const mongoose = require("mongoose");
const Ride = require("../models/Ride");
const User = require("../models/User");
const { createNotification } = require("../utils/notify");
const { haversineKm, validPoint, pointToRoute, decodePolyline, straightLine } = require("../utils/geo");
const { CONFIG, metersToDestination, validateManualCompletion, finalizeCompletion } = require("../utils/rideCompletion");
const { maskRideContacts } = require("../utils/maskContacts");
const { getCommissionPercent } = require("../config/razorpay");

// Build the fare/earnings settlement summary shown on the completion screen —
// the passenger sees what they owe (and how they can pay); the driver sees the
// fare/earnings and how much is still pending from passengers.
function buildSettlement(ride, userId) {
    const commissionPercent = getCommissionPercent();
    if (idStr(ride.user_id) === userId) {
        let gross = 0, driverEarnings = 0, pendingAmount = 0;
        for (const p of (ride.passengers || [])) {
            const fare = Number(p.fareAmount) || 0;
            if (fare <= 0) continue;
            gross += fare;
            driverEarnings += Math.max(0, fare - Math.round((fare * commissionPercent) / 100));
            if (p.paymentStatus !== "paid") pendingAmount += fare;
        }
        return { role: "driver", gross, driverEarnings, pendingAmount, commissionPercent, passengerCount: (ride.passengers || []).length };
    }
    const b = (ride.passengers || []).find((p) => idStr(p.user_id) === userId) || {};
    const fareAmount = Number(b.fareAmount) || 0;
    const platformFee = Math.round((fareAmount * commissionPercent) / 100);
    return {
        role: "passenger",
        fareAmount,
        platformFee,
        seats: b.seats || 1,
        paymentStatus: b.paymentStatus || "unpaid",
        paymentMethod: b.paymentMethod || null,
        commissionPercent,
    };
}

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

        // Reveal the driver's contact only to booked participants (defense in depth).
        maskRideContacts(ride, userId);

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
            settlement: buildSettlement(ride, userId),
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
        // Start GPS trip metrics: capture start location, reset trip distance +
        // destination/deviation state for a clean trip.
        const startLoc = (ride.tracking.driverLocation && ride.tracking.driverLocation.lat != null)
            ? { lat: ride.tracking.driverLocation.lat, lng: ride.tracking.driverLocation.lng }
            : (validPoint(ride.sourceCoords) ? { lat: ride.sourceCoords.lat, lng: ride.sourceCoords.lng } : { lat: null, lng: null });
        ride.tracking.startLocation = startLoc;
        ride.tracking.distanceKm = 0;
        ride.tracking.atDestination = false;
        ride.tracking.arrivedAtDestAt = null;
        ride.tracking.deviationFlagged = false;
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
 * Driver manually completes the ride. The backend VALIDATES the trip reached
 * the destination (within radius) and met the minimum distance + duration —
 * a driver can't complete from anywhere. Optional body { lat, lng } provides a
 * fresh fix; otherwise the last shared location is used.
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

        // Fresh location fix from the body (if the app sent one), else last known.
        const blat = Number(req.body?.lat), blng = Number(req.body?.lng);
        const fix = (Number.isFinite(blat) && Number.isFinite(blng)) ? { lat: blat, lng: blng } : null;
        if (fix) {
            ride.tracking = ride.tracking || {};
            ride.tracking.driverLocation = { lat: fix.lat, lng: fix.lng, updatedAt: new Date() };
        }

        // Backend-enforced destination + distance + duration validation. The
        // driver may override the GPS gates (force) after an explicit "Complete
        // anyway?" confirmation — device GPS is often inaccurate/static and must
        // never permanently strand the driver who knows the trip has ended.
        const force = Boolean(req.body?.force);
        const check = validateManualCompletion(ride, fix, { force });
        if (!check.ok) {
            return res.status(400).json({ message: check.message, code: check.code });
        }

        const { durationMin } = await finalizeCompletion(ride, {
            method: "DRIVER_MANUAL", endLocation: fix, actorId: userId, io, users,
        });

        const pax = passengerIds(ride);
        emitToUsers(io, users, pax, "ride:status", {
            rideId: idStr(ride._id), state: "completed", endedAt: ride.tracking.endedAt,
            durationMin, distanceKm: ride.tracking.distanceKm, completionMethod: "DRIVER_MANUAL",
        });

        res.status(200).json({ message: "Ride completed", tracking: ride.tracking, durationMin });
    } catch (error) {
        console.error("Error in endTracking:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * POST /api/rides/:rideId/tracking/arrived  (passenger)
 * GPS-fallback completion: the passenger confirms they've reached the
 * destination. Allowed only once the ride has started. Records the completion
 * as PASSENGER_CONFIRMATION (no driver-radius requirement — this is the
 * fallback for GPS inaccuracy).
 */
exports.confirmArrival = async (req, res) => {
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
        if (!passengerIds(ride).includes(userId)) {
            return res.status(403).json({ message: "Only a passenger on this ride can confirm arrival." });
        }
        if (ride.status === "Completed") {
            return res.status(400).json({ message: "This ride is already completed." });
        }
        if (ride.tracking?.state !== "in_progress") {
            return res.status(400).json({ message: "The ride hasn't started yet." });
        }
        // A passenger can only confirm arrival once the ride has ACTUALLY
        // reached the destination area (the driver's GPS entered the dest
        // radius). This blocks premature "I've arrived" completions while the
        // vehicle is still en route. If GPS never registers arrival, the driver
        // remains the authority and can complete via the tracking screen.
        if (!ride.tracking?.atDestination) {
            return res.status(400).json({
                message: "You can confirm arrival once the ride reaches the destination.",
                code: "NOT_AT_DESTINATION",
            });
        }

        const { durationMin } = await finalizeCompletion(ride, {
            method: "PASSENGER_CONFIRMATION", actorId: userId, io, users,
        });

        const pax = passengerIds(ride);
        emitToUsers(io, users, [...pax, idStr(ride.user_id)], "ride:status", {
            rideId: idStr(ride._id), state: "completed", endedAt: ride.tracking.endedAt,
            durationMin, completionMethod: "PASSENGER_CONFIRMATION",
        });

        res.status(200).json({ message: "Arrival confirmed — ride completed", tracking: ride.tracking, durationMin });
    } catch (error) {
        console.error("Error in confirmArrival:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * POST /api/rides/:rideId/tracking/location
 * Driver shares a live location. While the ride is in progress the backend
 * accumulates travelled distance, computes remaining distance + ETA, detects
 * destination arrival (and auto-completes after a short dwell), and flags route
 * deviation. Broadcasts a rich live payload to passengers.
 */
exports.updateLocation = async (req, res) => {
    const userId = req.user.id;
    const { rideId } = req.params;
    const { lat, lng, state } = req.body;
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

        const cfg = CONFIG();
        ride.tracking = ride.tracking || {};
        const prev = ride.tracking.driverLocation;
        const here = { lat: nlat, lng: nlng };
        const inProgress = ride.tracking.state === "in_progress";

        // Accumulate real travelled distance (ignore implausible GPS jumps).
        if (inProgress && prev && prev.lat != null && prev.lng != null) {
            const seg = haversineKm(prev, here);
            if (Number.isFinite(seg) && seg > 0 && seg < cfg.gpsJumpMaxKm) {
                ride.tracking.distanceKm = Number(((ride.tracking.distanceKm || 0) + seg).toFixed(3));
            }
        }
        ride.tracking.driverLocation = { lat: nlat, lng: nlng, updatedAt: new Date() };

        // Pre-start proximity state (driver heading to / at the PICKUP).
        const allowedPreStart = ["enroute", "arriving", "arrived"];
        if (state && allowedPreStart.includes(state) && !inProgress && ride.tracking.state !== "completed") {
            const prevState = ride.tracking.state;
            ride.tracking.state = state;
            if (state === "arrived" && prevState !== "arrived") {
                for (const pid of passengerIds(ride)) {
                    await notify(io, users, pid, `Your driver has arrived at the pickup point.`, ride._id, {
                        type: "tracking", title: "Driver arrived", link: { tab: "track", rideId: idStr(ride._id) },
                    });
                }
            }
        }

        // ---- In-progress monitoring: destination, deviation, auto-complete ----
        let remainingKm = null, etaMin = null, autoCompleted = false;
        const distToDestM = inProgress ? metersToDestination(ride, here) : null;
        if (distToDestM != null) {
            remainingKm = Number((distToDestM / 1000).toFixed(2));
            etaMin = Math.max(1, Math.round((remainingKm / 25) * 60)); // ~25 km/h city avg
        }

        if (inProgress) {
            // Destination radius detection + auto-complete dwell.
            if (distToDestM != null && distToDestM <= cfg.destRadiusM) {
                if (!ride.tracking.atDestination) {
                    ride.tracking.atDestination = true;
                    ride.tracking.arrivedAtDestAt = new Date();
                    for (const pid of passengerIds(ride)) {
                        await notify(io, users, pid, "You have reached your destination.", ride._id, {
                            type: "tracking", title: "Destination reached", link: { tab: "track", rideId: idStr(ride._id) },
                        });
                    }
                } else {
                    // Dwelled inside the radius long enough → AUTO_GPS completion,
                    // but only if the trip also satisfies distance + duration mins.
                    const dwellSec = (Date.now() - new Date(ride.tracking.arrivedAtDestAt).getTime()) / 1000;
                    const valid = validateManualCompletion(ride, here);
                    if (dwellSec >= cfg.autoCompleteDwellSec && valid.ok) {
                        await finalizeCompletion(ride, { method: "AUTO_GPS", endLocation: here, actorId: userId, io, users });
                        autoCompleted = true;
                        emitToUsers(io, users, [...passengerIds(ride), idStr(ride.user_id)], "ride:status", {
                            rideId: idStr(ride._id), state: "completed", endedAt: ride.tracking.endedAt,
                            distanceKm: ride.tracking.distanceKm, completionMethod: "AUTO_GPS",
                        });
                    }
                }
            } else if (ride.tracking.atDestination) {
                // Left the radius again — reset the dwell timer.
                ride.tracking.atDestination = false;
                ride.tracking.arrivedAtDestAt = null;
            }

            // Route-deviation monitoring (throttled to once / 2 min).
            if (!autoCompleted) {
                const poly = ride.route?.polyline ? decodePolyline(ride.route.polyline) : straightLine(ride.sourceCoords, ride.destinationCoords);
                if (Array.isArray(poly) && poly.length >= 2) {
                    const { distanceKm: offRouteKm } = pointToRoute(here, poly);
                    const recentlyFlagged = ride.tracking.lastDeviationAt && (Date.now() - new Date(ride.tracking.lastDeviationAt).getTime()) < 2 * 60 * 1000;
                    if (offRouteKm != null && offRouteKm > cfg.deviationKm && !recentlyFlagged) {
                        ride.tracking.deviationFlagged = true;
                        ride.tracking.lastDeviationAt = new Date();
                        for (const pid of passengerIds(ride)) {
                            await notify(io, users, pid, `Your driver appears to be off the planned route (${offRouteKm.toFixed(1)} km away). Stay alert — use SOS if you feel unsafe.`, ride._id, {
                                type: "tracking", title: "Route deviation detected", link: { tab: "track", rideId: idStr(ride._id) },
                            });
                        }
                        try {
                            const { _log } = require("./checkinController");
                            await _log(ride._id, "route_deviation", { actor_id: userId, details: { offRouteKm: Number(offRouteKm.toFixed(2)), at: here } });
                        } catch { /* non-fatal */ }
                    }
                }
            }
        }

        if (!autoCompleted) await ride.save();

        const payload = {
            rideId: idStr(ride._id),
            location: here,
            state: ride.tracking.state,
            atDestination: Boolean(ride.tracking.atDestination),
            distanceTravelledKm: Number(ride.tracking.distanceKm) || 0,
            remainingKm,
            etaMin,
            at: Date.now(),
        };
        emitToUsers(io, users, passengerIds(ride), "ride:location", payload);

        res.status(200).json({ message: "Location updated", tracking: ride.tracking, remainingKm, etaMin, autoCompleted });
    } catch (error) {
        console.error("Error in updateLocation:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
