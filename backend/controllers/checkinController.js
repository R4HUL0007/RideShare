// =======================================================
// Ride Check-In & Verification Controller
// -------------------------------------------------------
// Secure boarding verification: passenger check-in, 4-digit code generation,
// driver code verification, no-show reporting. Integrates with the existing
// tracking + escrow flows (start gate lives in trackingController; drop-off
// confirmation reuses the escrow confirm). All endpoints are participant-scoped.
// =======================================================

const mongoose = require("mongoose");
const Ride = require("../models/Ride");
const User = require("../models/User");
const VerificationLog = require("../models/VerificationLog");
const { createNotification } = require("../utils/notify");

const idStr = (v) => (v == null ? null : typeof v === "string" ? v : v._id ? v._id.toString() : v.toString());
const isDriver = (ride, uid) => idStr(ride.user_id) === idStr(uid);
const findPassenger = (ride, uid) =>
    (ride.passengers || []).find((p) => idStr(p.user_id) === idStr(uid));
const passengerIds = (ride) => (ride.passengers || []).map((p) => idStr(p.user_id)).filter(Boolean);

// ---- OTP security config (configurable via env) ----
const OTP_LEN = 6;
const OTP_EXPIRY_MIN = Number(process.env.RIDE_OTP_EXPIRY_MIN) || 10;
const OTP_MAX_ATTEMPTS = Number(process.env.RIDE_OTP_MAX_ATTEMPTS) || 5;
const otpExpiryMs = () => OTP_EXPIRY_MIN * 60 * 1000;

// Generate a unique 6-digit code within a ride (avoids collisions between
// multiple passengers on the same ride so a single code maps to one passenger).
function genCode(ride) {
    const used = new Set((ride.passengers || []).map((p) => p.verificationCode).filter(Boolean));
    const min = 10 ** (OTP_LEN - 1);
    const span = 9 * min;
    let code;
    do { code = String(Math.floor(min + Math.random() * span)); } while (used.has(code));
    return code;
}

// (Re)issue a fresh OTP for a passenger: new code, reset expiry + attempt count.
function issueCode(ride, passenger) {
    passenger.verificationCode = genCode(ride);
    passenger.otpExpiresAt = new Date(Date.now() + otpExpiryMs());
    passenger.otpAttempts = 0;
    return passenger.verificationCode;
}

const otpExpired = (p) => Boolean(p.otpExpiresAt && new Date(p.otpExpiresAt).getTime() < Date.now());
const secsLeft = (p) => (p.otpExpiresAt ? Math.max(0, Math.round((new Date(p.otpExpiresAt).getTime() - Date.now()) / 1000)) : null);

async function log(ride_id, event, { actor_id, passenger_id, details } = {}) {
    try { await VerificationLog.create({ ride_id, actor_id: actor_id || null, passenger_id: passenger_id || null, event, details: details || {} }); }
    catch { /* non-fatal */ }
}

/**
 * GET /api/rides/:rideId/verification
 * Passenger → their own code + status. Driver → roster of passengers + statuses.
 * Generates codes lazily so existing bookings work.
 */
exports.getVerification = async (req, res) => {
    const { rideId } = req.params;
    const uid = req.user._id;
    if (!mongoose.Types.ObjectId.isValid(rideId)) return res.status(400).json({ message: "Invalid ride id" });
    try {
        const ride = await Ride.findById(rideId).populate("passengers.user_id", "name");
        if (!ride) return res.status(404).json({ message: "Ride not found" });

        const driver = isDriver(ride, uid);
        const me = findPassenger(ride, uid);
        if (!driver && !me) return res.status(403).json({ message: "You are not part of this ride" });

        // Lazily generate codes for any passenger missing one (with expiry).
        let changed = false;
        for (const p of ride.passengers) {
            if (!p.verificationCode) { issueCode(ride, p); changed = true; }
        }
        if (changed) await ride.save();

        const state = ride.tracking?.state || "scheduled";

        if (driver) {
            return res.status(200).json({
                role: "driver",
                state,
                otpLength: OTP_LEN,
                maxAttempts: OTP_MAX_ATTEMPTS,
                passengers: ride.passengers.map((p) => ({
                    user_id: idStr(p.user_id?._id || p.user_id),
                    name: p.user_id?.name || "Passenger",
                    seats: p.seats || 1,
                    checkedIn: Boolean(p.checkedIn),
                    boardingVerified: Boolean(p.boardingVerified),
                    noShow: Boolean(p.noShow),
                })),
                verifiedCount: ride.passengers.filter((p) => p.boardingVerified).length,
            });
        }
        // Passenger view — only their own code.
        return res.status(200).json({
            role: "passenger",
            state,
            code: me.verificationCode,
            otpLength: OTP_LEN,
            checkedIn: Boolean(me.checkedIn),
            boardingVerified: Boolean(me.boardingVerified),
            expiresAt: me.otpExpiresAt,
            expiresInSec: secsLeft(me),
            expired: !me.boardingVerified && otpExpired(me),
            maxAttempts: OTP_MAX_ATTEMPTS,
            attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - (me.otpAttempts || 0)),
            // Payload a driver could scan from a QR (kept minimal + bound to ride).
            qrPayload: JSON.stringify({ r: idStr(ride._id), c: me.verificationCode }),
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * POST /api/rides/:rideId/checkin  (passenger)
 * Marks the passenger as checked-in (available once the driver has arrived).
 */
exports.checkIn = async (req, res) => {
    const { rideId } = req.params;
    const uid = req.user._id;
    const io = req.app.get("io"); const users = req.app.get("users") || {};
    if (!mongoose.Types.ObjectId.isValid(rideId)) return res.status(400).json({ message: "Invalid ride id" });
    try {
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });
        const me = findPassenger(ride, uid);
        if (!me) return res.status(403).json({ message: "You haven't booked this ride" });
        if (ride.status === "Cancelled") return res.status(400).json({ message: "This ride was cancelled" });
        if (ride.tracking?.state === "completed") return res.status(400).json({ message: "This ride is already completed" });

        if (!me.verificationCode || otpExpired(me)) issueCode(ride, me);
        me.checkedIn = true;
        me.checkedInAt = new Date();
        await ride.save();

        await log(ride._id, "checked_in", { actor_id: uid, passenger_id: uid });
        await createNotification({
            io, users, userId: idStr(ride.user_id), type: "tracking",
            title: "Passenger checked in",
            message: `${req.user.name} checked in. Ask for their ${OTP_LEN}-digit code to verify boarding.`,
            rideId: ride._id, link: { tab: "track", rideId: idStr(ride._id) },
        });

        res.status(200).json({ message: "Checked in", code: me.verificationCode, checkedIn: true, expiresAt: me.otpExpiresAt, expiresInSec: secsLeft(me) });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * POST /api/rides/:rideId/verify  (driver)  body: { code }
 * Driver enters the code shown by the passenger → verifies boarding.
 * Prevents reuse: a code that's already verified can't verify again.
 */
exports.verifyCode = async (req, res) => {
    const { rideId } = req.params;
    const { code } = req.body || {};
    const uid = req.user._id;
    const io = req.app.get("io"); const users = req.app.get("users") || {};
    if (!mongoose.Types.ObjectId.isValid(rideId)) return res.status(400).json({ message: "Invalid ride id" });
    const clean = String(code || "").trim();
    if (!new RegExp(`^\\d{${OTP_LEN}}$`).test(clean)) return res.status(400).json({ message: `Enter the passenger's ${OTP_LEN}-digit code.` });
    try {
        const ride = await Ride.findById(rideId).populate("passengers.user_id", "name");
        if (!ride) return res.status(404).json({ message: "Ride not found" });
        if (!isDriver(ride, uid)) return res.status(403).json({ message: "Only the driver can verify boarding" });

        // Brute-force guard: a wrong code can't be tied to a single passenger,
        // so failed attempts are throttled at the ride level. Lock the verify
        // endpoint briefly once too many wrong codes are entered.
        if (ride.boardingVerifyLockUntil && new Date(ride.boardingVerifyLockUntil).getTime() > Date.now()) {
            const wait = Math.ceil((new Date(ride.boardingVerifyLockUntil).getTime() - Date.now()) / 1000);
            return res.status(429).json({ message: `Too many incorrect codes. Try again in ${wait}s.`, code: "OTP_LOCKED" });
        }

        const match = ride.passengers.find((p) => p.verificationCode && p.verificationCode === clean);
        if (!match) {
            // Unknown code — record the failed attempt and count it toward the
            // ride-level lockout (we never lock individual passengers, since a
            // wrong code can't be attributed to one).
            ride.boardingVerifyAttempts = (ride.boardingVerifyAttempts || 0) + 1;
            let locked = false;
            if (ride.boardingVerifyAttempts >= OTP_MAX_ATTEMPTS) {
                ride.boardingVerifyLockUntil = new Date(Date.now() + 60 * 1000); // 1-min cooldown
                ride.boardingVerifyAttempts = 0;
                locked = true;
            }
            await ride.save();
            await log(ride._id, "verification_failed", { actor_id: uid, details: { code: clean } });
            if (locked) {
                return res.status(429).json({ message: "Too many incorrect codes. Please wait a minute and try again.", code: "OTP_LOCKED" });
            }
            return res.status(400).json({
                message: "Code doesn't match. Please re-check the passenger's code.",
                code: "OTP_MISMATCH",
                attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - ride.boardingVerifyAttempts),
            });
        }
        if (match.boardingVerified) {
            return res.status(400).json({ message: "This code was already verified." });
        }
        if (otpExpired(match)) {
            await log(ride._id, "verification_failed", { actor_id: uid, passenger_id: idStr(match.user_id?._id || match.user_id), details: { reason: "expired" } });
            return res.status(400).json({ message: "This code has expired. Ask the passenger to resend a new code.", code: "OTP_EXPIRED" });
        }
        match.boardingVerified = true;
        match.verifiedAt = new Date();
        match.checkedIn = true; // verifying implies presence
        match.noShow = false;
        // Successful verification clears the ride-level failed-attempt throttle.
        ride.boardingVerifyAttempts = 0;
        ride.boardingVerifyLockUntil = null;
        await ride.save();

        await log(ride._id, "boarding_verified", { actor_id: uid, passenger_id: idStr(match.user_id?._id || match.user_id) });
        await createNotification({
            io, users, userId: idStr(match.user_id?._id || match.user_id), type: "tracking",
            title: "Boarding verified ✅",
            message: "Your boarding has been verified. Have a safe ride!",
            rideId: ride._id, link: { tab: "track", rideId: idStr(ride._id) },
        });

        res.status(200).json({
            message: `Verified ${match.user_id?.name || "passenger"}`,
            passenger: idStr(match.user_id?._id || match.user_id),
            verifiedCount: ride.passengers.filter((p) => p.boardingVerified).length,
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * POST /api/rides/:rideId/otp/resend  (passenger)
 * Issues a brand-new code (invalidating the old one), resets expiry + attempts,
 * and notifies the driver. Audited via VerificationLog (code_generated).
 */
exports.resendOtp = async (req, res) => {
    const { rideId } = req.params;
    const uid = req.user._id;
    const io = req.app.get("io"); const users = req.app.get("users") || {};
    if (!mongoose.Types.ObjectId.isValid(rideId)) return res.status(400).json({ message: "Invalid ride id" });
    try {
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });
        const me = findPassenger(ride, uid);
        if (!me) return res.status(403).json({ message: "You haven't booked this ride" });
        if (ride.status === "Cancelled") return res.status(400).json({ message: "This ride was cancelled" });
        if (me.boardingVerified) return res.status(400).json({ message: "You're already verified." });
        if (ride.tracking?.state === "in_progress" || ride.tracking?.state === "completed") {
            return res.status(400).json({ message: "The ride has already started." });
        }

        issueCode(ride, me);
        await ride.save();

        await log(ride._id, "code_generated", { actor_id: uid, passenger_id: uid, details: { resend: true } });
        await createNotification({
            io, users, userId: idStr(ride.user_id), type: "tracking",
            title: "New verification code",
            message: `${req.user.name} generated a new ${OTP_LEN}-digit boarding code.`,
            rideId: ride._id, link: { tab: "track", rideId: idStr(ride._id) },
        });

        res.status(200).json({
            message: "A new code has been generated.",
            code: me.verificationCode,
            expiresAt: me.otpExpiresAt,
            expiresInSec: secsLeft(me),
            attemptsLeft: OTP_MAX_ATTEMPTS,
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * POST /api/rides/:rideId/no-show  body: { passengerId? }
 * Driver reports a passenger no-show, OR a passenger reports the driver no-show.
 * Stores evidence (the report) for admin review.
 */
exports.reportNoShow = async (req, res) => {
    const { rideId } = req.params;
    const { passengerId, note } = req.body || {};
    const uid = req.user._id;
    const io = req.app.get("io"); const users = req.app.get("users") || {};
    if (!mongoose.Types.ObjectId.isValid(rideId)) return res.status(400).json({ message: "Invalid ride id" });
    try {
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });

        if (isDriver(ride, uid)) {
            // Driver reports a passenger no-show.
            const target = findPassenger(ride, passengerId);
            if (!target) return res.status(404).json({ message: "Passenger not found on this ride" });
            target.noShow = true;
            await ride.save();
            await log(ride._id, "passenger_no_show", { actor_id: uid, passenger_id: idStr(passengerId), details: { note: (note || "").slice(0, 300) } });
            await createNotification({ io, users, userId: idStr(passengerId), type: "system", title: "No-show reported", message: "The driver reported you didn't arrive for the ride. Contact support if this is a mistake.", rideId: ride._id, link: { tab: "safety" } });
            // Notify admins for review.
            await notifyAdmins(io, users, `${req.user.name} (driver) reported a passenger no-show on ride to ${ride.destination}.`);
            return res.status(200).json({ message: "Passenger no-show reported. Stored for review." });
        }

        // Passenger reports the driver no-show.
        const me = findPassenger(ride, uid);
        if (!me) return res.status(403).json({ message: "You are not part of this ride" });
        await log(ride._id, "driver_no_show", { actor_id: uid, passenger_id: idStr(uid), details: { note: (note || "").slice(0, 300) } });
        await createNotification({ io, users, userId: idStr(ride.user_id), type: "system", title: "No-show reported", message: `${req.user.name} reported that you (driver) didn't arrive. Our team may review this.`, rideId: ride._id, link: { tab: "myRides" } });
        await notifyAdmins(io, users, `${req.user.name} (passenger) reported a driver no-show on ride to ${ride.destination}.`);
        return res.status(200).json({ message: "Driver no-show reported. Stored for review." });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * GET /api/rides/:rideId/timeline  (participant)
 * Returns the ordered verification event timeline for the ride.
 */
exports.getTimeline = async (req, res) => {
    const { rideId } = req.params;
    const uid = req.user._id;
    if (!mongoose.Types.ObjectId.isValid(rideId)) return res.status(400).json({ message: "Invalid ride id" });
    try {
        const ride = await Ride.findById(rideId).lean();
        if (!ride) return res.status(404).json({ message: "Ride not found" });
        const participant = isDriver(ride, uid) || passengerIds(ride).includes(idStr(uid));
        if (!participant) return res.status(403).json({ message: "You are not part of this ride" });
        const events = await VerificationLog.find({ ride_id: rideId }).sort({ createdAt: 1 }).limit(50).lean();
        res.status(200).json({ events });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

async function notifyAdmins(io, users, message) {
    try {
        const admins = await User.find({ isAdmin: true }).select("_id").lean();
        for (const a of admins) {
            await createNotification({ io, users, userId: a._id, type: "system", title: "Ride verification report", message, link: { tab: "admin" } });
        }
    } catch { /* non-fatal */ }
}

// Helper exported for tracking/escrow integration (logging ride lifecycle).
exports._log = log;
