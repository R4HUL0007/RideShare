const mongoose = require("mongoose");
const Review = require("../models/Review");
const Ride = require("../models/Ride");
const User = require("../models/User");
const { createNotification } = require("../utils/notify");

const idStr = (v) => (v == null ? null : typeof v === "string" ? v : v._id ? v._id.toString() : v.toString());

const passengerIds = (ride) =>
    (ride.passengers || [])
        .map((p) => (p && typeof p === "object" && p.user_id ? idStr(p.user_id) : idStr(p)))
        .filter(Boolean);

const isDriver = (ride, userId) => idStr(ride.user_id) === userId;
const isParticipant = (ride, userId) => isDriver(ride, userId) || passengerIds(ride).includes(userId);

// Round to one decimal.
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Recompute and persist a user's denormalized rating aggregates from the
 * reviews they have RECEIVED. Splits driver-side vs passenger-side.
 */
async function recomputeUserRatings(userId) {
    const reviews = await Review.find({ reviewee: userId }).lean();

    const driver = reviews.filter((r) => r.direction === "passengerToDriver");
    const passenger = reviews.filter((r) => r.direction === "driverToPassenger");

    const avg = (arr, pick) => {
        const vals = arr.map(pick).filter((n) => Number.isFinite(n) && n > 0);
        if (vals.length === 0) return 0;
        return round1(vals.reduce((s, n) => s + n, 0) / vals.length);
    };

    const ratings = {
        driver: {
            count: driver.length,
            average: avg(driver, (r) => r.rating),
            categories: {
                driving: avg(driver, (r) => r.categories?.driving),
                punctuality: avg(driver, (r) => r.categories?.punctuality),
                communication: avg(driver, (r) => r.categories?.communication),
                vehicle: avg(driver, (r) => r.categories?.vehicle),
            },
        },
        passenger: {
            count: passenger.length,
            average: avg(passenger, (r) => r.rating),
            categories: {
                punctuality: avg(passenger, (r) => r.categories?.punctuality),
                communication: avg(passenger, (r) => r.categories?.communication),
                behavior: avg(passenger, (r) => r.categories?.behavior),
            },
        },
    };

    await User.updateOne({ _id: userId }, { $set: { ratings } });
    return ratings;
}
// Exported so the admin panel can recompute aggregates after removing a review.
exports.recomputeUserRatings = recomputeUserRatings;

/**
 * POST /api/reviews/:rideId/:revieweeId
 * Submit a review. Enforces: authenticated, ride completed, both are
 * participants, reviewer != reviewee, correct driver/passenger pairing, and one
 * review per (ride, reviewer, reviewee).
 */
exports.submitReview = async (req, res) => {
    const reviewerId = req.user.id;
    const { rideId, revieweeId } = req.params;
    const { rating, comment, categories } = req.body;
    const io = req.app.get("io");
    const users = req.app.get("users") || {};

    if (!mongoose.Types.ObjectId.isValid(rideId) || !mongoose.Types.ObjectId.isValid(revieweeId)) {
        return res.status(400).json({ message: "Invalid ride or user id" });
    }
    if (revieweeId === reviewerId) {
        return res.status(400).json({ message: "You can't review yourself." });
    }
    const numRating = Number(rating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5." });
    }

    try {
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });

        // Must be completed before any review is allowed.
        if (ride.status !== "Completed") {
            return res.status(400).json({ message: "You can only review after the ride is completed." });
        }

        // Both reviewer and reviewee must be participants of this ride.
        if (!isParticipant(ride, reviewerId) || !isParticipant(ride, revieweeId)) {
            return res.status(403).json({ message: "Both users must be participants of this ride." });
        }

        // Determine direction + validate the driver/passenger pairing.
        const reviewerIsDriver = isDriver(ride, reviewerId);
        const revieweeIsDriver = isDriver(ride, revieweeId);
        if (reviewerIsDriver === revieweeIsDriver) {
            // Both driver (impossible) or both passengers — passengers don't review each other.
            return res.status(403).json({ message: "Reviews are between the driver and a passenger only." });
        }
        const direction = reviewerIsDriver ? "driverToPassenger" : "passengerToDriver";

        // Build the allowed category set for this direction.
        const c = categories || {};
        const clamp = (n) => {
            const x = Number(n);
            return Number.isFinite(x) && x >= 1 && x <= 5 ? Math.round(x) : 0;
        };
        const categoryDoc = direction === "passengerToDriver"
            ? {
                driving: clamp(c.driving),
                punctuality: clamp(c.punctuality),
                communication: clamp(c.communication),
                vehicle: clamp(c.vehicle),
            }
            : {
                punctuality: clamp(c.punctuality),
                communication: clamp(c.communication),
                behavior: clamp(c.behavior),
            };

        // Create the review (unique index guards against duplicates).
        let review;
        try {
            review = await Review.create({
                ride: rideId,
                reviewer: reviewerId,
                reviewee: revieweeId,
                direction,
                rating: numRating,
                comment: (comment || "").trim().slice(0, 1000),
                categories: categoryDoc,
            });
        } catch (err) {
            if (err.code === 11000) {
                return res.status(409).json({ message: "You've already reviewed this ride." });
            }
            throw err;
        }

        // Recompute the reviewee's aggregates.
        const ratings = await recomputeUserRatings(revieweeId);

        // Notify the reviewee (user-scoped, real-time).
        await createNotification({
            io, users,
            userId: revieweeId,
            type: "system",
            title: "New review",
            message: `${req.user.name?.split(" ")[0] || "Someone"} left you a ${numRating}★ review.`,
            rideId,
            link: { tab: "profile" },
        });

        res.status(201).json({ message: "Review submitted", review, ratings });
    } catch (error) {
        console.error("Error in submitReview:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * GET /api/reviews/user/:userId
 * Public list of reviews RECEIVED by a user (newest first), with aggregates.
 * Supports ?limit & ?direction=driver|passenger for lazy loading / filtering.
 */
exports.getUserReviews = async (req, res) => {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: "Invalid user id" });
    }
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
        const filter = { reviewee: userId };
        if (req.query.direction === "driver") filter.direction = "passengerToDriver";
        if (req.query.direction === "passenger") filter.direction = "driverToPassenger";

        const reviews = await Review.find(filter)
            .populate("reviewer", "name profilePicture role")
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        const user = await User.findById(userId).select("name profilePicture role ratings createdAt").lean();
        if (!user) return res.status(404).json({ message: "User not found" });

        res.status(200).json({ user, reviews });
    } catch (error) {
        console.error("Error in getUserReviews:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * GET /api/reviews/pending
 * Completed rides where the current user still has someone left to review.
 * Drives the "Rate driver / Rate passenger" prompts + review modal.
 */
exports.getPendingReviews = async (req, res) => {
    const userId = req.user.id;
    try {
        const rides = await Ride.find({
            status: "Completed",
            $or: [{ user_id: userId }, { "passengers.user_id": userId }],
        })
            .populate("user_id", "name profilePicture role")
            .populate("passengers.user_id", "name profilePicture role")
            .sort({ updatedAt: -1 })
            .lean();

        // Reviews this user has already written.
        const written = await Review.find({ reviewer: userId }).select("ride reviewee").lean();
        const writtenSet = new Set(written.map((w) => `${idStr(w.ride)}:${idStr(w.reviewee)}`));

        const pending = [];
        for (const ride of rides) {
            const reviewerIsDriver = idStr(ride.user_id) === userId;
            if (reviewerIsDriver) {
                // Driver reviews each passenger they haven't yet.
                for (const p of ride.passengers || []) {
                    const pax = p.user_id;
                    const pid = idStr(pax);
                    if (!pid || pid === userId) continue;
                    if (writtenSet.has(`${idStr(ride._id)}:${pid}`)) continue;
                    pending.push({
                        rideId: idStr(ride._id),
                        reviewee: { _id: pid, name: pax.name, profilePicture: pax.profilePicture || "", role: pax.role },
                        direction: "driverToPassenger",
                        source: ride.source, destination: ride.destination, timing: ride.timing,
                    });
                }
            } else {
                // Passenger reviews the driver if not done yet.
                const driver = ride.user_id;
                const did = idStr(driver);
                if (did && did !== userId && !writtenSet.has(`${idStr(ride._id)}:${did}`)) {
                    pending.push({
                        rideId: idStr(ride._id),
                        reviewee: { _id: did, name: driver.name, profilePicture: driver.profilePicture || "", role: driver.role },
                        direction: "passengerToDriver",
                        source: ride.source, destination: ride.destination, timing: ride.timing,
                    });
                }
            }
        }

        res.status(200).json(pending);
    } catch (error) {
        console.error("Error in getPendingReviews:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
