// Whether phone verification is enforced before ride actions (create/book) and
// at signup. Controlled by REQUIRE_PHONE_VERIFICATION so it can be turned off
// during development/testing (no SMS credits burned) and on for production/demo.
function phoneVerificationRequired() {
    return String(process.env.REQUIRE_PHONE_VERIFICATION || "").toLowerCase() === "true";
}

module.exports = { phoneVerificationRequired };
