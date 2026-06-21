const mongoose = require("mongoose");
const Notification = require("../models/Notification");

/**
 * GET /api/notifications
 * Return the authenticated user's notifications, newest first.
 * SECURITY: hard-scoped to req.user.id — a user can only ever read their own.
 * Optional ?limit= for lazy loading (defaults to 50).
 */
exports.getNotifications = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        const notifications = await Notification.find({ user_id: req.user.id })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        res.status(200).json(notifications);
    } catch (error) {
        console.error("Error in getNotifications:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * GET /api/notifications/unread-count
 * Unread count for the authenticated user (for the bell badge).
 */
exports.getUnreadCount = async (req, res) => {
    try {
        const count = await Notification.countDocuments({ user_id: req.user.id, read: false });
        res.status(200).json({ count });
    } catch (error) {
        console.error("Error in getUnreadCount:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read. SECURITY: the {_id, user_id} filter
 * guarantees a user can only mark THEIR OWN notification.
 */
exports.markRead = async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid notification id" });
    }
    try {
        const result = await Notification.updateOne(
            { _id: id, user_id: req.user.id },
            { $set: { read: true } }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Notification not found" });
        }
        res.status(200).json({ message: "Marked as read" });
    } catch (error) {
        console.error("Error in markRead:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * PATCH /api/notifications/read-all
 * Mark all of the authenticated user's notifications as read.
 */
exports.markAllRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { user_id: req.user.id, read: false },
            { $set: { read: true } }
        );
        res.status(200).json({ message: "All marked as read" });
    } catch (error) {
        console.error("Error in markAllRead:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * DELETE /api/notifications/:id
 * Delete a single notification owned by the authenticated user.
 */
exports.deleteNotification = async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid notification id" });
    }
    try {
        const result = await Notification.deleteOne({ _id: id, user_id: req.user.id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Notification not found" });
        }
        res.status(200).json({ message: "Notification deleted" });
    } catch (error) {
        console.error("Error in deleteNotification:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * DELETE /api/notifications
 * Clear all of the authenticated user's notifications.
 */
exports.clearAllNotifications = async (req, res) => {
    try {
        await Notification.deleteMany({ user_id: req.user.id });
        res.status(200).json({ message: "All notifications cleared successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
