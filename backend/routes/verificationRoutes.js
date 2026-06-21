const express = require("express");
const {
    getMyVerification,
    submitVerification,
    listVerifications,
    getVerificationDetail,
    decideVerification,
} = require("../controllers/verificationController");
const { protect } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");

const router = express.Router();

// ---- Driver endpoints (auth required) ----
router.get("/status", protect, getMyVerification);
router.post("/submit", protect, submitVerification);

// ---- Admin endpoints (auth + admin) ----
router.get("/admin/list", protect, requireAdmin, listVerifications);
router.get("/admin/:id", protect, requireAdmin, getVerificationDetail);
router.post("/admin/:id/decision", protect, requireAdmin, decideVerification);

module.exports = router;
