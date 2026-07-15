const express = require("express");
const {
    getConfig,
    createOrder,
    verifyPayment,
    payCash,
    markFailed,
    getMyPayments,
    getEarnings,
    getReceipt,
    confirmCompletion,
    raiseDispute,
    getMyDisputes,
    updatePayoutDetails,
    requestWithdrawal,
    getMyWithdrawals,
} = require("../controllers/paymentController");
const { protect } = require("../middleware/authMiddleware");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();

// Guard order creation (hits Razorpay) and withdrawal requests against abuse.
const orderLimiter = rateLimit({ key: "pay-order", windowMs: 60 * 1000, max: 20 });
const withdrawLimiter = rateLimit({ key: "withdraw", windowMs: 60 * 1000, max: 10 });
// Payment confirmation callbacks (signature verify / failure report) — capped to
// blunt brute-force/replay attempts against the verification endpoints.
const verifyLimiter = rateLimit({ key: "pay-verify", windowMs: 60 * 1000, max: 30 });

// All payment routes require auth. Server-side checks further ensure a user can
// only create/verify/view their OWN payments, verification is signature-checked,
// bookings are confirmed only after verified payment, and escrow release is
// gated to the paying passenger (or auto-release / admin).

router.get("/config", protect, getConfig);
router.get("/history", protect, getMyPayments);
router.get("/earnings", protect, getEarnings);
router.get("/disputes", protect, getMyDisputes);
router.get("/withdrawals", protect, getMyWithdrawals);
router.post("/order/:rideId", protect, orderLimiter, createOrder);
router.post("/verify", protect, verifyLimiter, verifyPayment);
router.post("/cash/:rideId", protect, orderLimiter, payCash);
router.post("/failed", protect, verifyLimiter, markFailed);
router.put("/payout-details", protect, updatePayoutDetails);
router.post("/withdraw", protect, withdrawLimiter, requestWithdrawal);
router.post("/:id/confirm", protect, confirmCompletion);
router.post("/:id/dispute", protect, raiseDispute);
router.get("/:id/receipt", protect, getReceipt);

module.exports = router;
