const express = require("express");
const {
    getNotifications,
    getUnreadCount,
    markRead,
    markAllRead,
    deleteNotification,
    clearAllNotifications,
} = require("../controllers/notificationController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// All notification routes are protected and hard-scoped to the logged-in user.
router.get("/", protect, getNotifications);
router.get("/unread-count", protect, getUnreadCount);
router.patch("/read-all", protect, markAllRead);
router.patch("/:id/read", protect, markRead);
router.delete("/:id", protect, deleteNotification);
router.delete("/", protect, clearAllNotifications);

module.exports = router;
