const PersonalRideRequest = require("../models/PersonalRideRequest");
const { createNotification } = require("../utils/notify");
const { config } = require("../utils/personalFare");

// =======================================================
// Background jobs for the Personalized Ride feature:
//   1. Request expiry  — SEARCHING requests no driver accepted in time.
//   2. OTP expiry      — clears stale boarding OTPs (regenerable).
//   3. Stale active sweep — force-closes rides abandoned mid-flow (driver
//      app crashed, connectivity lost, etc.) so they don't sit as "active"
//      forever on the passenger/driver screens (see myActive/driverActive).
//   4. Weekly settlement — Fridays: aggregate ledger → payout (Uber-style).
//   5. Failed payout retry — re-attempts failed settlements.
// =======================================================

// ---- 1. Request expiry sweep ----
async function runRequestExpiry({ io, users } = {}) {
    const now = new Date();
    const due = await PersonalRideRequest.find({ status: "SEARCHING", expiresAt: { $ne: null, $lte: now } });
    let expired = 0;
    for (const r of due) {
        // Atomic, conditional transition: only expire if the request is STILL
        // searching. A driver may have accepted it (→ DRIVER_ASSIGNED) between
        // the find above and now; an unconditional save() would clobber that and
        // strand both sides. If the claim fails, someone accepted it first.
        const claimed = await PersonalRideRequest.findOneAndUpdate(
            { _id: r._id, status: "SEARCHING" },
            { $set: { status: r.notifiedDriverIds.length ? "EXPIRED" : "NO_DRIVERS" } },
            { new: true }
        );
        if (!claimed) continue;
        expired += 1;
        try {
            await createNotification({
                io, users, userId: r.passenger_id, type: "ride", title: "No driver found",
                message: `We couldn't find a driver for your ride to ${r.destination?.address}. Please try again.`,
                link: { tab: "requestRide" },
            });
            if (io) io.to(String(r.passenger_id)).emit("personal_ride:update", { at: Date.now() });
        } catch { /* non-fatal */ }
    }
    if (expired > 0) console.log(`[personalRide] expired ${expired} unmatched request(s).`);
    return expired;
}

// ---- 2. OTP expiry sweep (clears stale codes; ride stays assigned) ----
async function runOtpExpiry() {
    const now = new Date();
    const res = await PersonalRideRequest.updateMany(
        { status: "DRIVER_ASSIGNED", "otp.verifiedAt": null, "otp.expiresAt": { $ne: null, $lte: now }, "otp.code": { $ne: "" } },
        { $set: { "otp.code": "", "otp.expiresAt": null } }
    );
    if (res.modifiedCount > 0) console.log(`[personalRide] cleared ${res.modifiedCount} expired OTP(s).`);
    return res.modifiedCount || 0;
}

// ---- 3. Stale active-ride sweep ----
// A ride can get stuck in DRIVER_ASSIGNED or RIDE_STARTED forever if the
// driver's app/connection dies before they call complete()/cancel() — neither
// runRequestExpiry (SEARCHING only) nor runOtpExpiry (clears the OTP code,
// doesn't change status) ever close it out. myActive/driverActive filter
// purely by status with no time bound, so a week-old abandoned ride would
// otherwise show as "active" indefinitely. This sweep force-cancels anything
// that's sat in an in-flight status well past a generous age threshold.
async function runStaleActiveSweep({ io, users } = {}) {
    const now = Date.now();
    const assignedCutoff = new Date(now - config.maxAssignedMin() * 60 * 1000);
    const tripCutoff = new Date(now - config.maxTripHours() * 60 * 60 * 1000);

    const stale = await PersonalRideRequest.find({
        $or: [
            { status: "DRIVER_ASSIGNED", assignedAt: { $ne: null, $lte: assignedCutoff } },
            { status: "DRIVER_ASSIGNED", assignedAt: null, createdAt: { $lte: assignedCutoff } },
            { status: "RIDE_STARTED", startedAt: { $ne: null, $lte: tripCutoff } },
        ],
    });

    let closed = 0;
    for (const r of stale) {
        // Atomic, conditional transition — same pattern as runRequestExpiry —
        // so a driver's concurrent complete()/cancel() call always wins the race.
        const claimed = await PersonalRideRequest.findOneAndUpdate(
            { _id: r._id, status: r.status },
            { $set: { status: "CANCELLED", cancelledBy: "system", cancelReason: "Auto-cancelled: ride was inactive for too long." } },
            { new: true }
        );
        if (!claimed) continue;
        closed += 1;
        try {
            for (const uid of [claimed.passenger_id, claimed.driver_id].filter(Boolean)) {
                await createNotification({
                    io, users, userId: uid, type: "ride", title: "Ride auto-cancelled",
                    message: `Your ride to ${claimed.destination?.address} was automatically cancelled after being inactive for too long.`,
                    link: { tab: "requestRide" },
                });
                if (io) io.to(String(uid)).emit("ride_cancelled", { id: String(claimed._id), by: "system" });
            }
            if (io) io.emit("personal_ride:update", { at: Date.now() });
        } catch { /* non-fatal */ }
    }
    if (closed > 0) console.log(`[personalRide] auto-cancelled ${closed} stale active ride(s).`);
    return closed;
}

let reqTimer = null, otpTimer = null, staleTimer = null, settleTimer = null, retryTimer = null;

function ctxOf(app) { return app ? { io: app.get("io"), users: app.get("users") } : {}; }

function startPersonalRideJobs(app) {
    const ctx = ctxOf(app);

    // Request + OTP expiry: frequent, lightweight.
    if (!reqTimer) {
        const tick = () => runRequestExpiry(ctx).catch((e) => console.error("[personalRide] request expiry error:", e.message));
        setTimeout(tick, 25 * 1000);
        reqTimer = setInterval(tick, Number(process.env.PERSONAL_RIDE_SWEEP_MS) || 60 * 1000);
        if (reqTimer.unref) reqTimer.unref();
    }
    if (!otpTimer) {
        const tick = () => runOtpExpiry().catch((e) => console.error("[personalRide] otp expiry error:", e.message));
        otpTimer = setInterval(tick, 2 * 60 * 1000);
        if (otpTimer.unref) otpTimer.unref();
    }

    // Stale active-ride sweep: infrequent (age thresholds are in tens of
    // minutes/hours, so there's no need to check every minute).
    if (!staleTimer) {
        const tick = () => runStaleActiveSweep(ctx).catch((e) => console.error("[personalRide] stale sweep error:", e.message));
        setTimeout(tick, 45 * 1000);
        staleTimer = setInterval(tick, 10 * 60 * 1000);
        if (staleTimer.unref) staleTimer.unref();
    }

    // Weekly settlement: check hourly, run on Fridays once per day.
    if (!settleTimer) {
        const { runWeeklySettlement } = require("../controllers/personalRideController");
        let lastRunDay = null;
        const tick = async () => {
            const now = new Date();
            const isFriday = now.getDay() === 5; // 0=Sun ... 5=Fri (server-local)
            // Use a LOCAL day key so it's consistent with getDay() above (a UTC
            // key could disagree near midnight and cause an extra run — harmless
            // now that settlement claims entries atomically, but kept correct).
            const dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
            if (isFriday && lastRunDay !== dayKey) {
                lastRunDay = dayKey;
                try { await runWeeklySettlement(ctx); } catch (e) { console.error("[personalRide] settlement error:", e.message); }
            }
        };
        settleTimer = setInterval(tick, 60 * 60 * 1000); // hourly check
        if (settleTimer.unref) settleTimer.unref();
    }

    // Failed payout retry: every 6 hours.
    if (!retryTimer) {
        const { retryFailedPayouts } = require("../controllers/personalRideController");
        const tick = () => retryFailedPayouts(ctx).catch((e) => console.error("[personalRide] payout retry error:", e.message));
        retryTimer = setInterval(tick, 6 * 60 * 60 * 1000);
        if (retryTimer.unref) retryTimer.unref();
    }
}

module.exports = { runRequestExpiry, runOtpExpiry, runStaleActiveSweep, startPersonalRideJobs };
