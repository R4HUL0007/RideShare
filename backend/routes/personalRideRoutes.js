const express = require("express");
const pr = require("../controllers/personalRideController");
const { protect } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();

// Throttle on-demand ride creation (broadcasts to drivers) against abuse.
const createLimiter = rateLimit({ key: "pr-create", windowMs: 60 * 1000, max: 15 });

// ---- Admin (specific paths first) ----
router.get("/admin/list", protect, requireAdmin, pr.adminList);
router.get("/admin/ledger", protect, requireAdmin, pr.adminLedger);
router.get("/admin/settlements", protect, requireAdmin, pr.adminSettlements);
router.get("/admin/dashboard", protect, requireAdmin, pr.adminDashboard);
router.post("/admin/run-settlement", protect, requireAdmin, pr.adminRunSettlement);

// ---- Passenger ----
router.post("/estimate", protect, pr.estimate);
router.get("/stats", protect, pr.stats);
router.post("/", protect, createLimiter, pr.createRequest);
router.get("/mine", protect, pr.myActive);
router.get("/history", protect, pr.myHistory);

// ---- Driver ----
router.get("/incoming", protect, pr.incoming);
router.get("/driver/active", protect, pr.driverActive);
router.get("/ledger", protect, pr.myLedger);

// ---- Single ride (param routes last) ----
router.get("/:id", protect, pr.getById);
router.post("/:id/cancel", protect, pr.cancel);
router.post("/:id/pay", protect, pr.confirmPayment);
router.post("/:id/accept", protect, pr.accept);
router.post("/:id/decline", protect, pr.decline);
router.post("/:id/reached-pickup", protect, pr.reachedPickup);
router.post("/:id/verify-otp", protect, pr.verifyOtp);
router.post("/:id/location", protect, pr.updateLocation);
router.post("/:id/complete", protect, pr.complete);

module.exports = router;
