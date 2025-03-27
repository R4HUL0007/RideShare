const express = require("express");
const { getNotifications, clearAllNotifications } = require("../controllers/notificationController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// Get user notifications
router.get("/", protect, getNotifications);
router.delete("/", protect, clearAllNotifications);

module.exports = router;
