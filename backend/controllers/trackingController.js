const mongoose = require("mongoose");
const Ride = require("../models/Ride");
const User = require("../models/User");
const { createNotification } = require("../utils/notify");

// Normalize an id-ish value (ObjectId | populated doc | string) to a string.
const idStr = (v) => {
    if (!v) return null;
    if (typeof v === "string") return v;
    if (v._id) return v._id.toString();
    return v.toString();
};

const passengerIds = (ride) =>
    (ride.passengers || [])
        .map((p) => (p && typeof p === "object" && p.user_id ? idStr(p.user_id) : idStr(p)))
        .filter(Boolean);

const isDriver = (ride, userId) => idStr(ride.user_id) === userId;
const isParticipant = (ride, userId) => isDriver(ride, userId) || passengerIds(ride).includes(userId);

// Emit a socket event to a set of user ids (if connected).
const emitToUsers = (io, users, userIds, event, payload) => {
    if (!io) return;
    userIds.filter(Boolean).forEach((uid) => {
        io.to(String(uid)).emit(event, payload);
    });
};

// Persist + push a typed, user-scoped notification (real-time).
const notify = async (io, users, userId, message, rideId, opts = {}) => {
    if (!userId) return;
    await createNotification({
        io, users,
        userId: idStr(userId),
        type: opts.type || "tracking",
        title: opts.title || "Ride update",
        message,
        rideId,
        link: opts.link || { tab: "myBookings" },
    });
};

/**
 * GET /api/rides/:rideId/tracking
 * Return the current tracking snapshot for a ride. Participants only.
 */
exports.getTracking = async (req, res) => {
    const userId = req.user.id;
    const { rideId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(rideId)) {
        return res.status(400).json({ message: "Invalid ride id" });
    }
    try {
        const ride = await Ride.findById(rideId)
            .populate("user_id", "name email phoneNumber profilePicture role")
            .populate("vehicle_id")
            .lean();
        if (!ride) return res.status(404).json({ message: "Ride not found" });
        if (!isParticipant(ride, userId)) {
            return res.status(403).json({ message: "You are not part of this ride" });
        }

        res.status(200).json({
            rideId: ride._id,
            driver: ride.user_id,
            vehicle: ride.vehicle_id,
            source: ride.source,
            destination: ride.destination,
            sourceCoords: ride.sourceCoords,
            destinationCoords: ride.destinationCoords,
            timing: ride.timing,
            isDriver: isDriver(ride, userId),
            tracking: ride.tracking || { state: "scheduled", driverLocation: { lat: null, lng: null } },
        });
    } catch (error) {
        console.error("Error in getTracking:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * POST /api/rides/:rideId/tracking/start
 * Driver starts the ride. Sets state -> in_progress and broadcasts to passengers.
 */
exports.startTracking = async (req, res) => {
    const userId = req.user.id;
    const { rideId } = req.params;
    const io = req.app.get("io");
    const users = req.app.get("users") || {};

    if (!mongoose.Types.ObjectId.isValid(rideId)) {
        return res.status(400).json({ message: "Invalid ride id" });
    }
    try {
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });
        if (!isDriver(ride, userId)) {
            return res.status(403).json({ message: "Only the driver can start the ride" });
        }
        if (ride.status === "Cancelled") {
            return res.status(400).json({ message: "This ride was cancelled" });
        }

        // ---- Boarding verification gate ----
        // Require at least one passenger to have verified boarding before the
        // ride can start (configurable; preserves existing flow when disabled).
        // Rides with no passengers are unaffected.
        const requireVerification = process.env.REQUIRE_BOARDING_VERIFICATION !== "false";
        const roster = (ride.passengers || []);
        if (requireVerification && roster.length > 0) {
            const anyVerified = roster.some((p) => p.boardingVerified);
            if (!anyVerified) {
                return res.status(400).json({
                    message: "Verify at least one passenger's boarding code before starting the ride.",
                    code: "BOARDING_NOT_VERIFIED",
                });
            }
        }

        ride.tracking = ride.tracking || {};
        ride.tracking.state = "in_progress";
        ride.tracking.startedAt = new Date();
        await ride.save();

        // Log ride start for the verification timeline/analytics.
        try {
            const { _log } = require("./checkinController");
            await _log(ride._id, "ride_started", { actor_id: userId });
        } catch { /* non-fatal */ }

        const pax = passengerIds(ride);
        const statusPayload = { rideId: idStr(ride._id), state: "in_progress", startedAt: ride.tracking.startedAt };
        emitToUsers(io, users, pax, "ride:status", statusPayload);
        for (const pid of pax) {
            await notify(io, users, pid, `Your ride to ${ride.destination} has started.`, ride._id, {
                type: "tracking", title: "Ride started", link: { tab: "track", rideId: idStr(ride._id) },
            });
        }

        res.status(200).json({ message: "Ride started", tracking: ride.tracking });
    } catch (error) {
        console.error("Error in startTracking:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * POST /api/rides/:rideId/tracking/end
 * Driver ends the ride. Sets state -> completed, marks ride Completed.
 */
exports.endTracking = async (req, res) => {
    const userId = req.user.id;
    const { rideId } = req.params;
    const io = req.app.get("io");
    const users = req.app.get("users") || {};

    if (!mongoose.Types.ObjectId.isValid(rideId)) {
        return res.status(400).json({ message: "Invalid ride id" });
    }
    try {
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });
        if (!isDriver(ride, userId)) {
            return res.status(403).json({ message: "Only the driver can end the ride" });
        }
        // Guard invalid transitions. endTracking is a completion path that arms
        // escrow, so it must not run on a cancelled/already-completed ride, and
        // the ride must actually be in progress (started first).
        if (ride.status === "Cancelled") {
            return res.status(400).json({ message: "A cancelled ride can't be completed." });
        }
        if (ride.status === "Completed") {
            return res.status(400).json({ message: "This ride is already completed." });
        }
        if (ride.tracking?.state !== "in_progress") {
            return res.status(400).json({ message: "Start the ride before ending it." });
        }

        ride.tracking = ride.tracking || {};
        ride.tracking.state = "completed";
        ride.tracking.endedAt = new Date();
        ride.status = "Completed";
        await ride.save();

        // Log ride completion for the verification timeline/analytics.
        try {
            const { _log } = require("./checkinController");
            await _log(ride._id, "ride_completed", { actor_id: userId });
        } catch { /* non-fatal */ }

        // Arm escrow for paid bookings (held → awaiting_completion + 24h clock).
        try {
            const { armEscrowForRide } = require("./paymentController");
            await armEscrowForRide(ride._id, { io, users });
        } catch (e) {
            console.error("armEscrowForRide failed (endTracking):", e.message);
        }

        const pax = passengerIds(ride);
        const startedAt = ride.tracking.startedAt ? new Date(ride.tracking.startedAt).getTime() : null;
        const durationMin = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 60000)) : null;
        const statusPayload = { rideId: idStr(ride._id), state: "completed", endedAt: ride.tracking.endedAt, durationMin };
        emitToUsers(io, users, pax, "ride:status", statusPayload);
        for (const pid of pax) {
            await notify(io, users, pid, `Your ride to ${ride.destination} is complete.`, ride._id, {
                type: "ride", title: "Ride completed", link: { tab: "rideHistory" },
            });
        }

        res.status(200).json({ message: "Ride completed", tracking: ride.tracking, durationMin });
    } catch (error) {
        console.error("Error in endTracking:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * POST /api/rides/:rideId/tracking/location
 * Driver shares a live location update. Optionally carries a derived
 * `state` (arriving/arrived) computed client-side from proximity, plus eta and
 * distance to relay to passengers. Broadcast over Socket.io to passengers.
 */
exports.updateLocation = async (req, res) => {
    const userId = req.user.id;
    const { rideId } = req.params;
    const { lat, lng, state, eta, distance } = req.body;
    const io = req.app.get("io");
    const users = req.app.get("users") || {};

    if (!mongoose.Types.ObjectId.isValid(rideId)) {
        return res.status(400).json({ message: "Invalid ride id" });
    }
    const nlat = Number(lat), nlng = Number(lng);
    if (!Number.isFinite(nlat) || !Number.isFinite(nlng)) {
        return res.status(400).json({ message: "Valid coordinates required" });
    }
    try {
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });
        if (!isDriver(ride, userId)) {
            return res.status(403).json({ message: "Only the driver can share location" });
        }

        ride.tracking = ride.tracking || {};
        ride.tracking.driverLocation = { lat: nlat, lng: nlng, updatedAt: new Date() };

        // Optional proximity-derived state transitions (before the ride starts).
        const allowedPreStart = ["enroute", "arriving", "arrived"];
        if (state && allowedPreStart.includes(state) && ride.tracking.state !== "in_progress" && ride.tracking.state !== "completed") {
            const prev = ride.tracking.state;
            ride.tracking.state = state;
            if (state === "arrived" && prev !== "arrived") {
                for (const pid of passengerIds(ride)) {
                    await notify(io, users, pid, `Your driver has arrived at the pickup point.`, ride._id, {
                        type: "tracking", title: "Driver arrived", link: { tab: "track", rideId: idStr(ride._id) },
                    });
                }
            }
        }
        await ride.save();

        const payload = {
            rideId: idStr(ride._id),
            location: { lat: nlat, lng: nlng },
            state: ride.tracking.state,
            eta: eta ?? null,
            distance: distance ?? null,
            at: Date.now(),
        };
        emitToUsers(io, users, passengerIds(ride), "ride:location", payload);

        res.status(200).json({ message: "Location updated", tracking: ride.tracking });
    } catch (error) {
        console.error("Error in updateLocation:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
