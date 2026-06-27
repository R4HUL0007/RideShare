const express = require("express");
const {
    getConversations,
    getMessages,
    sendMessage,
    markRead,
    getUnreadCount,
    clearChat,
    archiveChat,
    unarchiveChat,
} = require("../controllers/chatController");
const { protect } = require("../middleware/authMiddleware");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();

// Throttle outbound messages (each persists + emits a socket event/notification).
const sendLimiter = rateLimit({ key: "chat-send", windowMs: 60 * 1000, max: 60 });

// All chat routes require authentication (existing JWT/cookie flow).
router.get("/conversations", protect, getConversations);
router.get("/unread-count", protect, getUnreadCount);
// Archive/unarchive a conversation (keyed by the other user). Registered before
// the generic param routes so "archive"/"unarchive" aren't read as a rideId.
router.patch("/archive/:counterpartId", protect, archiveChat);
router.patch("/unarchive/:counterpartId", protect, unarchiveChat);
router.get("/:rideId/:counterpartId", protect, getMessages);
router.post("/:rideId/:counterpartId", protect, sendLimiter, sendMessage);
router.patch("/:rideId/:counterpartId/read", protect, markRead);
router.delete("/:rideId/:counterpartId", protect, clearChat);

module.exports = router;
