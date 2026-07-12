// Whether phone verification is enforced before ride actions (create/book) and
// at signup. Controlled by REQUIRE_PHONE_VERIFICATION so it can be turned off
// during development/testing (no SMS credits burned) and on for production/demo.
function phoneVerificationRequired() {
    return String(process.env.REQUIRE_PHONE_VERIFICATION || "").toLowerCase() === "true";
}

// Days a verified phone number is locked from being changed (anti OTP-spam).
function phoneChangeLockDays() {
    const n = Number(process.env.PHONE_CHANGE_LOCK_DAYS);
    return Number.isFinite(n) && n >= 0 ? n : 15;
}

// Max OTP sends (send + resends) allowed per verification cycle.
function phoneOtpMaxSends() {
    const n = Number(process.env.PHONE_OTP_MAX_SENDS);
    return Number.isFinite(n) && n > 0 ? n : 3;
}

module.exports = { phoneVerificationRequired, phoneChangeLockDays, phoneOtpMaxSends };
