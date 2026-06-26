// =======================================================
// Production ride-completion logic (GPS-validated).
// -------------------------------------------------------
// Ride completion is NEVER a blind "driver pressed a button". The backend
// validates the trip actually happened and reached the destination:
//   • ride has started (in_progress)
//   • driver is within the destination radius   (manual completion)
//   • a minimum trip distance was travelled
//   • a minimum trip duration elapsed
// Three completion methods are supported and audit-logged:
//   AUTO_GPS               — driver dwelled inside the destination radius
//   DRIVER_MANUAL          — driver tapped Complete AND passed validation
//   PASSENGER_CONFIRMATION — passenger confirmed arrival (GPS fallback)
// Centralized so every completion path enforces the same rules.
// =======================================================

const { haversineKm, validPoint } = require("./geo");
const Ride = require("../models/Ride");

// Configurable thresholds (env-overridable). Defaults tuned for real trips;
// kept low enough that short campus rides still satisfy the minimums.
function CONFIG() {
    return {
        destRadiusM: Number(process.env.RIDE_DEST_RADIUS_M) || 75,           // "reached destination"
        minTripKm: Number(process.env.RIDE_MIN_TRIP_KM ?? 0.3),              // minimum distance
        minTripMin: Number(process.env.RIDE_MIN_TRIP_MIN ?? 1),             // minimum duration
        autoCompleteDwellSec: Number(process.env.RIDE_AUTO_COMPLETE_DWELL_SEC) || 45,
        deviationKm: Number(process.env.RIDE_DEVIATION_KM ?? 1.5),          // route-deviation alert
        gpsJumpMaxKm: Number(process.env.RIDE_GPS_JUMP_MAX_KM ?? 5),        // ignore teleport jumps
    };
}

// Metres from a location to the ride's destination (null if unknown).
function metersToDestination(ride, loc) {
    const dst = ride && ride.destinationCoords;
    if (!validPoint(dst) || !validPoint(loc)) return null;
    return haversineKm(loc, dst) * 1000;
}

function tripDurationMin(ride) {
    const s = ride?.tracking?.startedAt ? new Date(ride.tracking.startedAt).getTime() : null;
    if (!s) return null;
    return (Date.now() - s) / 60000;
}

/**
 * Validate a DRIVER_MANUAL completion. Returns { ok, code, message }.
 * `loc` is the driver's current/last location. When destination coords are
 * absent (legacy rides), the radius check is skipped (GPS fallback) but the
 * distance/duration minimums still apply.
 */
function validateManualCompletion(ride, loc) {
    const cfg = CONFIG();
    if (!ride) return { ok: false, code: "NOT_FOUND", message: "Ride not found." };
    if (ride.status === "Cancelled") return { ok: false, code: "CANCELLED", message: "A cancelled ride can't be completed." };
    if (ride.status === "Completed") return { ok: false, code: "ALREADY", message: "This ride is already completed." };
    if (ride.tracking?.state !== "in_progress") {
        return { ok: false, code: "NOT_STARTED", message: "Start the ride before completing it." };
    }

    const driverLoc = loc || ride.tracking?.driverLocation;
    const distM = metersToDestination(ride, driverLoc);
    // Only enforce the radius when we actually have both coordinates.
    if (distM != null && distM > cfg.destRadiusM) {
        return {
            ok: false, code: "TOO_FAR",
            message: "You are too far from the destination to complete this ride.",
        };
    }

    // Minimum distance — only enforced when we have a destination to measure a
    // real route against (so coordinate-less legacy rides aren't blocked).
    const km = Number(ride.tracking?.distanceKm) || 0;
    if (validPoint(ride.destinationCoords) && km < cfg.minTripKm) {
        return {
            ok: false, code: "TOO_SHORT",
            message: `The trip is too short to complete (min ${cfg.minTripKm} km).`,
        };
    }

    const dur = tripDurationMin(ride);
    if (dur != null && dur < cfg.minTripMin) {
        return {
            ok: false, code: "TOO_QUICK",
            message: `The ride just started — you can complete it after ${cfg.minTripMin} min.`,
        };
    }

    return { ok: true };
}

/**
 * Finalize a ride completion (any method). Mutates + saves the ride, writes the
 * audit log, arms escrow for legacy pre-paid bookings, and prompts unpaid
 * passengers to pay. Returns { durationMin }.
 */
async function finalizeCompletion(ride, { method, endLocation, actorId, io, users } = {}) {
    const now = new Date();
    const endLoc = endLocation || (ride.tracking && ride.tracking.driverLocation) || null;
    const set = {
        status: "Completed",
        "tracking.state": "completed",
        "tracking.endedAt": now,
        "tracking.completionMethod": method || "DRIVER_MANUAL",
    };
    if (endLoc && endLoc.lat != null) set["tracking.endLocation"] = { lat: endLoc.lat, lng: endLoc.lng };

    // Atomic claim: only the FIRST completion wins. Prevents double audit logs +
    // double payment notifications when auto-GPS and a manual/passenger complete
    // race each other.
    const claimed = await Ride.findOneAndUpdate(
        { _id: ride._id, status: { $ne: "Completed" } },
        { $set: set },
        { new: true }
    );
    if (!claimed) return { durationMin: null, alreadyCompleted: true };

    // Reflect into the in-memory doc so callers' socket emits read fresh values.
    ride.status = "Completed";
    ride.tracking = claimed.tracking;

    const startedAt = claimed.tracking?.startedAt ? new Date(claimed.tracking.startedAt).getTime() : null;
    const durationMin = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 60000)) : null;

    // Admin audit log: completion method, distance, duration, start/end coords.
    try {
        const { _log } = require("../controllers/checkinController");
        await _log(claimed._id, "ride_completed", {
            actor_id: actorId || null,
            details: {
                method: claimed.tracking.completionMethod,
                distanceKm: Number(claimed.tracking.distanceKm) || 0,
                durationMin,
                startLocation: claimed.tracking.startLocation || null,
                endLocation: claimed.tracking.endLocation || null,
            },
        });
    } catch { /* non-fatal */ }

    // Legacy pre-paid bookings: arm their escrow (no-op for pay-after flow).
    try {
        const { armEscrowForRide } = require("../controllers/paymentController");
        await armEscrowForRide(claimed._id, { io, users });
    } catch (e) {
        console.error("armEscrowForRide failed (finalizeCompletion):", e.message);
    }

    // Notify passengers — those who owe a fare get a pay prompt.
    try {
        const { createNotification } = require("./notify");
        for (const p of (claimed.passengers || [])) {
            const pid = p && p.user_id ? (p.user_id._id ? p.user_id._id.toString() : p.user_id.toString()) : null;
            if (!pid) continue;
            const owes = (p.fareAmount || 0) > 0 && p.paymentStatus !== "paid";
            await createNotification({
                io, users, userId: pid,
                type: owes ? "booking" : "ride",
                title: owes ? "Ride done — payment due" : "Ride completed",
                message: owes
                    ? `Your ride to ${claimed.destination} is complete. Please pay ₹${p.fareAmount} to finish.`
                    : `Your ride to ${claimed.destination} has been completed.`,
                rideId: claimed._id, link: { tab: "myBookings" },
            });
        }
    } catch (e) {
        console.error("completion notify failed:", e.message);
    }

    return { durationMin };
}

module.exports = {
    CONFIG,
    metersToDestination,
    tripDurationMin,
    validateManualCompletion,
    finalizeCompletion,
};
