const express = require("express");
const { 
    registerUser, 
    loginUser, 
    verifyOTP, 
    resendOTP,
    forgotPassword,
    resetPassword,
    logoutUser,
    getCurrentUser,
    googleAuth,
    verifyGoogleSignup,
    updateProfile,
    changePassword,
    updateNotificationPrefs,
    refreshSession,
    sendPhoneOtp,
    verifyPhone,
    getPublicConfig
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();

// Throttle sensitive auth endpoints (brute-force / abuse protection). Maxes are
// env-configurable so ops can tune per environment (defaults match production).
const N = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const otpVerifyLimiter = rateLimit({ key: "otp-verify", windowMs: 60 * 1000, max: N(process.env.AUTH_OTP_VERIFY_MAX, 10) });
const otpSendLimiter = rateLimit({ key: "otp-send", windowMs: 60 * 1000, max: N(process.env.AUTH_OTP_SEND_MAX, 3) });
const loginLimiter = rateLimit({ key: "login", windowMs: 60 * 1000, max: N(process.env.AUTH_LOGIN_MAX, 10) });
// Refresh is called silently/often (every ~15m + on 401). Generous but capped.
const refreshLimiter = rateLimit({ key: "refresh", windowMs: 60 * 1000, max: N(process.env.AUTH_REFRESH_MAX, 60) });

router.post("/register", otpSendLimiter, registerUser);
router.post("/verify-otp", otpVerifyLimiter, verifyOTP);
router.post("/resend-otp", otpSendLimiter, resendOTP);
router.post("/login", loginLimiter, loginUser);
router.post("/google", googleAuth);
router.post("/google/verify", otpVerifyLimiter, verifyGoogleSignup);
router.post("/forgot-password", otpSendLimiter, forgotPassword);
router.post("/reset-password", otpVerifyLimiter, resetPassword);
// Silent session renewal — authenticates via the refresh cookie (no `protect`).
router.post("/refresh", refreshLimiter, refreshSession);
router.get("/me", protect, getCurrentUser);
router.put("/profile", protect, updateProfile);
router.post("/phone/send-otp", protect, otpSendLimiter, sendPhoneOtp);
router.post("/phone/verify", protect, otpVerifyLimiter, verifyPhone);
router.put("/change-password", protect, changePassword);
router.put("/notification-prefs", protect, updateNotificationPrefs);
router.post("/logout", logoutUser);
// Public runtime config (e.g. whether phone verification is enforced).
router.get("/config", getPublicConfig);

module.exports = router;
