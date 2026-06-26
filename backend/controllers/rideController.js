const Ride = require("../models/Ride");
const User = require("../models/User");
const Vehicle = require("../models/Vehicle");
const mongoose = require("mongoose");
const { createNotification, createNotificationsBulk } = require("../utils/notify");
const { normalizeCoords } = require("../utils/coords");
const { rankRides, CFG } = require("../utils/routeMatch");
const { haversineKm } = require("../utils/geo");
const { computeSegmentFare } = require("../utils/partialFare");

// Fire-and-forget search logging for recommendations + demand insights.
function logSearch({ userId, role, destination, source, pSrc, pDst, resultCount }) {
    try {
        const SearchLog = require("../models/SearchLog");
        SearchLog.create({
            user_id: userId || null,
            role: role || "",
            source: source || "",
            destination: destination || "",
            sourceCoords: pSrc || { lat: null, lng: null },
            destinationCoords: pDst || { lat: null, lng: null },
            resultCount: resultCount || 0,
        }).catch(() => {});
    } catch { /* non-fatal */ }
}


// ✅ 1. Create a Ride (Host Offers a Ride)
exports.createRide = async (req, res) => {
    const { source, destination, timing, vehicle_id, pricePerPerson, seatsAvailable, sourceCoords, destinationCoords, route } = req.body;
    const userId = req.user.id; // Get logged-in user's ID
    const io = req.app.get("io");
    const users = req.app.get("users") || {};

    try {
        // Fetch the logged-in user's role and gender
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // ---- Driver verification gate ----
        // Only verified drivers can publish rides. Unverified users get a clear
        // message with a link to complete verification.
        if (!user.isDriverVerified) {
            return res.status(403).json({
                message: "Driver verification is required before creating rides. Please complete your verification.",
                code: "VERIFICATION_REQUIRED",
            });
        }

        // ---- Departure window guard (campus app: today or tomorrow only) ----
        // Mirrors the date picker's min=today / max=tomorrow, enforced on the
        // server so it can't be bypassed via a direct API call.
        const when = timing ? new Date(timing) : null;
        if (!when || isNaN(when.getTime())) {
            return res.status(400).json({ message: "A valid departure date and time is required." });
        }
        const nowTs = Date.now();
        const endOfTomorrow = new Date();
        endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
        endOfTomorrow.setHours(23, 59, 59, 999);
        if (when.getTime() < nowTs - 60 * 1000) {
            return res.status(400).json({ message: "Departure time can't be in the past." });
        }
        if (when.getTime() > endOfTomorrow.getTime()) {
            return res.status(400).json({ message: "Rides can only be scheduled for today or tomorrow." });
        }

        // If vehicle_id is provided, verify it belongs to the user AND is itself
        // verified (driver-level verification isn't enough — a newly added or
        // edited vehicle must be approved before it can carry rides).
        if (vehicle_id) {
            const vehicle = await Vehicle.findOne({ _id: vehicle_id, user_id: userId });
            if (!vehicle) {
                return res.status(403).json({ message: "Vehicle not found or doesn't belong to you" });
            }
            if (!vehicle.isVerified) {
                return res.status(403).json({
                    message: "This vehicle isn't verified yet. Submit it for verification before offering rides.",
                    code: "VEHICLE_NOT_VERIFIED",
                });
            }
        }

        // Automatically set gender_preference based on user's registered gender
        // This ensures rides are created with the driver's gender preference
        const genderPref = user.gender || "Any";

        // Limit seats to max 4 (coerce to a positive integer first so a
        // negative or fractional seatsAvailable can't be persisted).
        let seats = parseInt(seatsAvailable, 10);
        if (!Number.isFinite(seats) || seats < 1) seats = 1;
        seats = Math.min(seats, 4);

        // Create a new ride
        const ride = await Ride.create({
            user_id: userId,
            role: user.role, // Match role (student/faculty)
            gender_preference: genderPref, // Automatically set from user's gender
            source: source || "University",
            destination,
            timing,
            vehicle_id: vehicle_id || null,
            pricePerPerson: pricePerPerson || null,
            seatsAvailable: seats,
            status: "Available",
            sourceCoords: normalizeCoords(sourceCoords),
            destinationCoords: normalizeCoords(destinationCoords),
            // Store Google Maps route data for Smart Route Matching (optional).
            route: route && typeof route === "object" ? {
                polyline: typeof route.polyline === "string" ? route.polyline : "",
                distanceKm: Number.isFinite(route.distanceKm) ? route.distanceKm : null,
                durationMin: Number.isFinite(route.durationMin) ? route.durationMin : null,
            } : undefined,
        });

        // 🔥 Notify same-role users a new ride is available — WITHOUT blocking the
        // response. Previously this loaded every matching user and awaited one
        // notification insert + socket emit PER user (O(N) sequential round-trips
        // that could hang ride creation for minutes at scale). Now we respond
        // immediately, then fan out as a SINGLE bulk insert + online-only emits.
        res.status(201).json(ride);

        setImmediate(async () => {
            try {
                const recipients = await User.find({ role: user.role, _id: { $ne: userId } })
                    .select("_id").lean();
                if (recipients.length) {
                    await createNotificationsBulk({
                        io, users,
                        userIds: recipients.map((u) => u._id),
                        type: "ride",
                        title: "New ride available",
                        message: `New ride to ${destination} is available.`,
                        rideId: ride._id,
                        link: { tab: "findRides" },
                    });
                }
            } catch (e) {
                console.error("createRide notification fan-out failed:", e.message);
            }
        });
        return;
    } catch (error) {
        console.error("Error in createRide:", error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};


// ✅ 2. Find Matching Rides (Rider Looking for a Ride)
// Supports BOTH classic exact-destination search (backward compatible) AND
// Smart Route Matching (route overlap, intermediate stops, nearby destinations)
// when the passenger provides coordinates.
exports.findRides = async (req, res) => {
    const { destination, gender_preference, timing } = req.query;
    const userId = req.user.id;

    // Optional passenger coordinates → enables Smart Route Matching.
    const num = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
    const pSrc = (num(req.query.sourceLat) != null && num(req.query.sourceLng) != null)
        ? { lat: num(req.query.sourceLat), lng: num(req.query.sourceLng) } : null;
    const pDst = (num(req.query.destLat) != null && num(req.query.destLng) != null)
        ? { lat: num(req.query.destLat), lng: num(req.query.destLng) } : null;
    // Smart mode: on by default when a destination coordinate is supplied,
    // unless explicitly disabled with smart=false.
    const smart = req.query.smart !== "false" && Boolean(pDst);
    const radiusKm = num(req.query.radiusKm) || CFG.sourceRadiusKm;

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        // ---- Base query (shared by both modes) ----
        const query = {
            role: user.role,
            status: "Available",
            user_id: { $ne: userId }, // exclude own rides
        };

        // Gender safety rule (unchanged).
        if (user.gender === "Male") {
            query.gender_preference = { $ne: "Female" };
        }
        if (gender_preference && gender_preference !== "Any") {
            if (query.gender_preference && typeof query.gender_preference === "object") {
                query.$and = [
                    { gender_preference: query.gender_preference },
                    { gender_preference: gender_preference },
                ];
                delete query.gender_preference;
            } else {
                query.gender_preference = gender_preference;
            }
        }

        // Timing filter (unchanged).
        if (timing) {
            const searchDate = new Date(timing);
            const startOfDay = new Date(searchDate); startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(searchDate); endOfDay.setHours(23, 59, 59, 999);
            query.timing = { $gte: startOfDay, $lte: endOfDay };
        }

        const populate = (q) => q
            .populate("vehicle_id")
            .populate("user_id", "name email phoneNumber role gender profilePicture ratings isDriverVerified")
            .populate("passengers.user_id", "name email phoneNumber");

        // ===================================================
        // CLASSIC EXACT-MATCH SEARCH (preserved, default path)
        // ===================================================
        if (!smart) {
            const exactQuery = { ...query };
            if (destination) exactQuery.destination = destination;
            const rides = await populate(Ride.find(exactQuery)).lean();
            logSearch({ userId, role: user.role, destination, source: req.query.source, pSrc, pDst, resultCount: rides.length });
            if (rides.length === 0) {
                return res.status(404).json({ message: "No rides found matching the criteria" });
            }
            return res.status(200).json(rides);
        }

        // ===================================================
        // SMART ROUTE MATCHING
        // ===================================================
        // Cheap geospatial pre-filter: bound candidate rides to those whose
        // SOURCE is within ~radius of the passenger source (uses lat/lng box on
        // the indexed sourceCoords). Skipped when no passenger source given.
        if (pSrc) {
            const dLat = radiusKm / 111;
            const dLng = radiusKm / (111 * Math.cos((pSrc.lat * Math.PI) / 180) || 1);
            query["sourceCoords.lat"] = { $gte: pSrc.lat - dLat, $lte: pSrc.lat + dLat };
            query["sourceCoords.lng"] = { $gte: pSrc.lng - dLng, $lte: pSrc.lng + dLng };
        }

        // Fetch a bounded candidate set, then rank in memory.
        const candidates = await populate(Ride.find(query).limit(300)).lean();

        const ranked = rankRides(
            { sourceCoords: pSrc, destinationCoords: pDst },
            candidates,
            { sourceRadiusKm: radiusKm }
        );

        // Annotate each ride with its match metadata for the UI.
        const results = ranked.map(({ ride, match }) => {
            // Fair segment fare for the passenger's actual drop point (km-based,
            // derived from the driver's full-route price). Informational here;
            // the server recomputes authoritatively at payment/booking time.
            const seg = computeSegmentFare(ride, pDst);
            return {
                ...ride,
                _match: {
                    score: match.score,
                    type: match.matchType,
                    reason: match.reason,
                    sourceDistanceKm: match.sourceDistanceKm != null ? Number(match.sourceDistanceKm.toFixed(2)) : null,
                    destToRouteKm: match.destToRouteKm != null ? Number(match.destToRouteKm.toFixed(2)) : null,
                    destToDestKm: match.destToDestKm != null ? Number(match.destToDestKm.toFixed(2)) : null,
                },
                _fare: {
                    estimatedFare: seg.fare,
                    fullPrice: seg.fullPrice,
                    segmentKm: seg.segmentKm,
                    fullKm: seg.fullKm,
                    partial: seg.partial,
                },
            };
        });

        // Fire-and-forget analytics (never blocks the response).
        try {
            const { logRouteMatch } = require("../utils/routeMatchAnalytics");
            logRouteMatch({ userId, candidates: candidates.length, results });
        } catch { /* non-fatal */ }
        logSearch({ userId, role: user.role, destination, source: req.query.source, pSrc, pDst, resultCount: results.length });

        if (results.length === 0) {
            return res.status(404).json({ message: "No rides found matching the criteria" });
        }
        return res.status(200).json(results);
    } catch (error) {
        console.error("Error in findRides:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ✅ Book a Ride
exports.bookRide = async (req, res) => {
    const { rideId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(rideId)) {
        return res.status(400).json({ message: "Invalid ride id" });
    }
    const userId = req.user.id;
    const io = req.app.get("io");
    const users = req.app.get("users") || {};

    // Number of seats requested (defaults to 1; backward compatible with the
    // old single-seat booking calls that send no body).
    let requestedSeats = parseInt(req.body?.seats, 10);
    if (!Number.isFinite(requestedSeats) || requestedSeats < 1) {
        requestedSeats = 1;
    }

    try {
        // Check if ride exists
        let ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });

        // A driver cannot book their own ride.
        if (ride.user_id.toString() === userId) {
            return res.status(400).json({ message: "You can't book your own ride." });
        }

        // Women's-safety rule: male passengers cannot book female-only rides.
        // This is enforced in search, but MUST also be enforced here — a ride id
        // can be obtained out-of-band (shared link, cached list, or brute force),
        // so the search-time filter alone does not guarantee safety.
        if (req.user.gender === "Male" && ride.gender_preference === "Female") {
            return res.status(403).json({ message: "This ride is reserved for female passengers." });
        }

        // Reject obviously invalid seat counts up front.
        if (requestedSeats > 4) {
            return res.status(400).json({ message: "You can book at most 4 seats." });
        }

        // Check if enough seats are available (prevents overbooking).
        if (ride.seatsAvailable <= 0) {
            return res.status(400).json({ message: "No seats available" });
        }
        if (requestedSeats > ride.seatsAvailable) {
            return res.status(400).json({
                message: `Only ${ride.seatsAvailable} seat${ride.seatsAvailable !== 1 ? "s" : ""} available.`,
            });
        }

        // Check if user is already booked (handle both old and new format)
        const alreadyBooked = ride.passengers.some(p => {
            if (p && typeof p === 'object' && p.user_id) {
                return p.user_id.toString() === userId;
            }
            // Old format: just user ID
            return p && (p.toString() === userId || p === userId);
        });
        if (alreadyBooked) {
            return res.status(400).json({ message: "You have already booked this ride" });
        }

        // Add the passenger atomically: the conditional filter guarantees seats
        // are still available, the ride isn't cancelled/completed, and the user
        // isn't already aboard — so two concurrent bookings can't oversell the
        // last seat (the classic read-modify-write race). 6-digit boarding code
        // matches the check-in verifier.
        const verificationCode = String(Math.floor(100000 + Math.random() * 900000));
        const updated = await Ride.findOneAndUpdate(
            {
                _id: rideId,
                seatsAvailable: { $gte: requestedSeats },
                status: { $nin: ["Cancelled", "Completed"] },
                "passengers.user_id": { $ne: userId },
                // Don't let anyone book a ride that has already departed or
                // finished. (Missing tracking.state on legacy rides still
                // matches $nin, so old rides remain bookable.)
                "tracking.state": { $nin: ["in_progress", "completed"] },
            },
            {
                $push: { passengers: { user_id: userId, seats: requestedSeats, bookedAt: new Date(), verificationCode } },
                $inc: { seatsAvailable: -requestedSeats },
            },
            { new: true }
        );
        if (!updated) {
            return res.status(409).json({ message: "Those seats were just taken. Please pick another ride." });
        }
        // Flip to "Booked" once full (atomic, idempotent).
        if (updated.seatsAvailable <= 0 && updated.status !== "Booked") {
            await Ride.updateOne({ _id: rideId, seatsAvailable: { $lte: 0 } }, { $set: { status: "Booked" } });
            updated.status = "Booked";
        }
        ride = updated;

        // Smart Route Matching conversion tracking (fire-and-forget): mark the
        // user's most recent route-match search as converted.
        try {
            const RouteMatchLog = require("../models/RouteMatchLog");
            RouteMatchLog.findOneAndUpdate(
                { user_id: userId, converted: false },
                { converted: true },
                { sort: { createdAt: -1 } }
            ).catch(() => {});
        } catch { /* non-fatal */ }

        // Recommendation conversion tracking: if this ride was recently shown as
        // a recommendation to the user, record a conversion.
        try {
            const RecommendationEvent = require("../models/RecommendationEvent");
            RecommendationEvent.create({ user_id: userId, ride_id: ride._id, kind: "conversion", surface: "passenger" }).catch(() => {});
        } catch { /* non-fatal */ }

        // Notify ride owner (driver) — new booking received. Target the ride's
        // user_id directly: a deleted driver account would make a findById
        // lookup null and crash the notification after the booking succeeded.
        const seatLabel = requestedSeats > 1 ? `${requestedSeats} seats` : "a seat";
        await createNotification({
            io, users,
            userId: ride.user_id,
            type: "booking",
            title: "New booking received",
            message: `${req.user.name} booked ${seatLabel} on your ride to ${ride.destination}.`,
            rideId: ride._id,
            link: { tab: "myRides" },
        });

        // Broadcast a seat-update event so clients can refresh seat counts in
        // real time (frontend may subscribe to this later).
        if (io) {
            io.emit("rideSeatsUpdated", {
                rideId: ride._id.toString(),
                seatsAvailable: ride.seatsAvailable,
                status: ride.status,
            });
        }

        res.status(200).json({ message: "Ride booked successfully", ride });

    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ✅ Cancel Ride Booking
exports.cancelRide = async (req, res) => {
    const { rideId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(rideId)) {
        return res.status(400).json({ message: "Invalid ride id" });
    }
    const userId = req.user.id;
    const io = req.app.get("io");
    const users = req.app.get("users") || {};

    try {
        // Find ride
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });

        // Find passenger booking (handle both old and new format)
        let passengerBooking = null;
        let isOldFormat = false;
        
        // Check new format first (object with user_id and bookedAt)
        if (ride.passengers && ride.passengers.length > 0) {
            passengerBooking = ride.passengers.find(p => {
                if (p && typeof p === 'object' && p.user_id) {
                    return p.user_id.toString() === userId;
                }
                // Old format: just user ID
                if (p && (p.toString() === userId || p === userId)) {
                    isOldFormat = true;
                    return true;
                }
                return false;
            });
        }

        if (!passengerBooking) {
            return res.status(400).json({ message: "You are not booked in this ride" });
        }

        // Check if 3 minutes have passed since booking (only for new format)
        if (!isOldFormat && passengerBooking.bookedAt) {
            const bookingTime = new Date(passengerBooking.bookedAt);
            const currentTime = new Date();
            const timeDifference = (currentTime - bookingTime) / 1000 / 60; // Difference in minutes

            if (timeDifference > 3) {
                return res.status(403).json({ 
                    message: "Cancellation window has expired. You can only cancel within 3 minutes of booking." 
                });
            }
        }

        // Remove the passenger + restore their seats ATOMICALLY ($pull + $inc).
        // The previous read-modify-write (`ride.passengers = filter(...)` then
        // `ride.save()`) wrote a stale full-document snapshot, which could
        // silently clobber a booking made concurrently by another passenger and
        // corrupt the seat count. Conditioning the $pull on the user still being
        // present makes the cancel idempotent and race-safe.
        const restoreSeats = (passengerBooking && typeof passengerBooking === "object" && passengerBooking.seats)
            ? passengerBooking.seats
            : 1;
        const updated = await Ride.findOneAndUpdate(
            { _id: rideId },
            isOldFormat
                ? { $pull: { passengers: userId }, $inc: { seatsAvailable: restoreSeats } }
                : { $pull: { passengers: { user_id: userId } }, $inc: { seatsAvailable: restoreSeats } },
            { new: true }
        );
        const result = updated || ride;
        // Flip back to Available if it had been marked full.
        if (result.status === "Booked" && result.seatsAvailable > 0) {
            await Ride.updateOne({ _id: rideId }, { $set: { status: "Available" } });
            result.status = "Available";
        }

        // Notify ride owner — passenger cancelled. Use ride.user_id directly so a
        // deleted driver account can't null-deref after a successful cancel.
        await createNotification({
            io, users,
            userId: result.user_id,
            type: "booking",
            title: "Booking cancelled",
            message: `${req.user.name} cancelled their booking on your ride to ${result.destination}.`,
            rideId: result._id,
            link: { tab: "myRides" },
        });

        // Broadcast updated seat count for real-time clients.
        if (io) {
            io.emit("rideSeatsUpdated", {
                rideId: result._id.toString(),
                seatsAvailable: result.seatsAvailable,
                status: result.status,
            });
        }

        res.status(200).json({ message: "Ride booking canceled successfully", ride: result });

    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ✅ Complete a Ride
exports.completeRide = async (req, res) => {
    const { rideId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(rideId)) {
        return res.status(400).json({ message: "Invalid ride id" });
    }
    const userId = req.user.id; // Logged-in user ID
    const io = req.app.get("io");
    const users = req.app.get("users") || {};

    try {
        // Find the ride
        const ride = await Ride.findById(rideId);
        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        // Ensure only the host can mark the ride as completed
        if (ride.user_id.toString() !== userId) {
            return res.status(403).json({ message: "Unauthorized: You can only complete your own rides" });
        }

        // Guard invalid transitions — can't complete a cancelled/already-done ride.
        if (ride.status === "Completed") {
            return res.status(400).json({ message: "This ride is already completed." });
        }
        if (ride.status === "Cancelled") {
            return res.status(400).json({ message: "A cancelled ride can't be completed." });
        }

        // Update ride status
        ride.status = "Completed";
        await ride.save();

        // Arm escrow for paid bookings: held → awaiting_completion + start the
        // 24h auto-release clock. (No-op when there are no paid bookings.)
        try {
            const { armEscrowForRide } = require("./paymentController");
            await armEscrowForRide(ride._id, { io, users });
        } catch (e) {
            console.error("armEscrowForRide failed (completeRide):", e.message);
        }

        // 🔥 Notify the driver and all passengers.
        const passengerIds = (ride.passengers || [])
            .map((p) => (p && typeof p === "object" && p.user_id ? p.user_id.toString() : (p ? p.toString() : null)))
            .filter(Boolean);
        const recipients = [ride.user_id.toString(), ...passengerIds];
        await Promise.all(recipients.map((rid) => createNotification({
            io, users,
            userId: rid,
            type: "ride",
            title: "Ride completed",
            message: `Your ride to ${ride.destination} has been completed.`,
            rideId: ride._id,
            link: { tab: rid === ride.user_id.toString() ? "myRides" : "rideHistory" },
        })));

        res.status(200).json({ message: "Ride marked as completed", ride });
    } catch (error) {
        console.error("Error in completeRide:", error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ Get Rides by History
exports.getRideHistory = async (req, res) => {
    const userId = req.user.id; // Get logged-in user

    try {
        const rides = await Ride.find({
            $or: [{ user_id: userId }, { 'passengers.user_id': userId }],
            status: "Completed"
        })
            .populate('user_id', 'name email phoneNumber role profilePicture ratings isDriverVerified')
            .populate('vehicle_id')
            .populate('passengers.user_id', 'name email phoneNumber profilePicture ratings')
            .sort({ updatedAt: -1 })
            .lean();

        if (rides.length === 0) {
            return res.status(404).json({ message: "No past rides found" });
        }

        res.status(200).json(rides);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ✅ Get Rides Created by User
exports.getUserRides = async (req, res) => {
    const userId = req.user?.id; // Logged-in user's ID

    try {
        // Defensive: never run an unscoped query. If userId is somehow missing,
        // an undefined filter value would make Mongoose return EVERY ride.
        if (!userId) {
            return res.status(401).json({ message: "Not authorized" });
        }

        const rides = await Ride.find({ user_id: userId })
            .populate('vehicle_id')
            .populate('user_id', 'name email phoneNumber role profilePicture ratings isDriverVerified')
            .populate('passengers.user_id', 'name email phoneNumber profilePicture ratings')
            .sort({ createdAt: -1 })
            .lean();

        if (rides.length === 0) {
            return res.status(404).json({ message: "No rides created yet." });
        }

        res.status(200).json(rides);
    } catch (error) {
        console.error("Error in getUserRides:", error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ Get Rides Booked by User (My Bookings)
exports.getMyBookings = async (req, res) => {
    const userId = req.user.id; // Logged-in user's ID

    try {
        // Find rides where user is in the passengers array
        const rides = await Ride.find({ 'passengers.user_id': userId })
            .populate('vehicle_id')
            .populate('user_id', 'name email phoneNumber role profilePicture ratings isDriverVerified')
            .populate('passengers.user_id', 'name email phoneNumber profilePicture ratings')
            .sort({ createdAt: -1 })
            .lean();

        if (rides.length === 0) {
            return res.status(404).json({ message: "No booked rides found." });
        }

        res.status(200).json(rides);
    } catch (error) {
        console.error("Error in getMyBookings:", error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ Cancel a Ride (driver soft-cancel — retained for records)
exports.deleteRide = async (req, res) => {
    const { rideId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(rideId)) {
        return res.status(400).json({ message: "Invalid ride id" });
    }
    const userId = req.user.id;
    const io = req.app.get("io");
    const users = req.app.get("users") || {};

    try {
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });

        // Ensure only the ride creator can cancel the ride
        if (ride.user_id.toString() !== userId) {
            return res.status(403).json({ message: "Unauthorized: You can only cancel your own rides" });
        }

        if (ride.status === "Cancelled") {
            return res.status(400).json({ message: "This ride is already cancelled" });
        }

        // Snapshot passengers before clearing so we can notify them.
        const passengerIds = (ride.passengers || [])
            .map((p) => (p && typeof p === "object" && p.user_id ? p.user_id.toString() : (p ? p.toString() : null)))
            .filter(Boolean);

        // Soft-cancel: retain the ride document for the driver's records.
        ride.status = "Cancelled";
        ride.cancelledAt = new Date();
        ride.passengers = [];
        await ride.save();

        // Notify everyone who had booked a seat that the ride was cancelled.
        await Promise.all(passengerIds.map((pid) => createNotification({
            io, users,
            userId: pid,
            type: "ride",
            title: "Ride cancelled",
            message: `The ride to ${ride.destination} was cancelled by the driver.`,
            rideId: ride._id,
            link: { tab: "myBookings" },
        })));

        res.status(200).json({ message: "Ride cancelled successfully", ride });
    } catch (error) {
        console.error("❌ Error in deleteRide:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ✅ Remove a Passenger from Ride (Captain only)
exports.removePassenger = async (req, res) => {
    const { rideId, passengerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(rideId) || !mongoose.Types.ObjectId.isValid(passengerId)) {
        return res.status(400).json({ message: "Invalid ride or passenger id" });
    }
    const userId = req.user.id; // Logged-in user (captain)
    const io = req.app.get("io");
    const users = req.app.get("users") || {};

    try {
        // Find the ride
        const ride = await Ride.findById(rideId);
        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        // Ensure only the ride owner (captain) can remove passengers
        if (ride.user_id.toString() !== userId) {
            return res.status(403).json({ message: "Unauthorized: You can only remove passengers from your own rides" });
        }

        // Check if passenger exists in the ride
        const passengerIndex = ride.passengers.findIndex(p => {
            if (p && typeof p === 'object' && p.user_id) {
                return p.user_id.toString() === passengerId;
            }
            // Old format: just user ID
            return p && (p.toString() === passengerId || p === passengerId);
        });

        if (passengerIndex === -1) {
            return res.status(404).json({ message: "Passenger not found in this ride" });
        }

        // Check if 3 minutes have passed since booking (only for new format)
        const passengerBooking = ride.passengers[passengerIndex];
        if (passengerBooking && typeof passengerBooking === 'object' && passengerBooking.bookedAt) {
            const bookingTime = new Date(passengerBooking.bookedAt);
            const currentTime = new Date();
            const timeDifference = (currentTime - bookingTime) / 1000 / 60; // Difference in minutes

            if (timeDifference > 3) {
                return res.status(403).json({ 
                    message: "Removal window has expired. You can only remove passengers within 3 minutes of booking." 
                });
            }
        }

        // Remove passenger + restore their seats ATOMICALLY ($pull + $inc) so a
        // concurrent booking can't be clobbered by a stale full-document save.
        const removedSeats = (passengerBooking && typeof passengerBooking === "object" && passengerBooking.seats)
            ? passengerBooking.seats
            : 1;
        const isOldFormat = !(passengerBooking && typeof passengerBooking === "object" && passengerBooking.user_id);
        const updated = await Ride.findOneAndUpdate(
            { _id: rideId },
            isOldFormat
                ? { $pull: { passengers: passengerId }, $inc: { seatsAvailable: removedSeats } }
                : { $pull: { passengers: { user_id: passengerId } }, $inc: { seatsAvailable: removedSeats } },
            { new: true }
        );
        const result = updated || ride;

        // Update ride status if no passengers left.
        if ((result.passengers || []).length === 0 && result.status === "Booked") {
            await Ride.updateOne({ _id: rideId }, { $set: { status: "Available" } });
            result.status = "Available";
        }

        // Notify the removed passenger
        const passenger = await User.findById(passengerId);
        if (passenger) {
            await createNotification({
                io, users,
                userId: passengerId,
                type: "booking",
                title: "Removed from ride",
                message: `You were removed from the ride to ${ride.destination} by the driver.`,
                rideId: ride._id,
                link: { tab: "myBookings" },
            });
        }

        // Populate the response
        const updatedRide = await Ride.findById(rideId)
            .populate('vehicle_id')
            .populate('user_id', 'name email phoneNumber role profilePicture ratings isDriverVerified')
            .populate('passengers.user_id', 'name email phoneNumber profilePicture ratings');

        res.status(200).json({ 
            message: "Passenger removed successfully", 
            ride: updatedRide 
        });
    } catch (error) {
        console.error("Error in removePassenger:", error);
        res.status(500).json({ 
            message: "Server error", 
            error: error.message 
        });
    }
};
