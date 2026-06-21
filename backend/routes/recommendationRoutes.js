const express = require("express");
const { passenger, driver, trending, track, analytics } = require("../controllers/recommendationController");
const { protect } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");

const router = express.Router();

router.get("/passenger", protect, passenger);
router.get("/driver", protect, driver);
router.get("/trending", protect, trending);
router.post("/track", protect, track);

// Admin recommendation analytics.
router.get("/analytics", protect, requireAdmin, analytics);

module.exports = router;
