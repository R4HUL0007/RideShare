const Notification = require("../models/Notification");

exports.getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ user_id: req.user.id }).sort({ createdAt: -1 });
        res.status(200).json(notifications);
    } catch (error) {
        console.error("Error in getNotifications:", error);
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};

exports.clearAllNotifications = async (req, res) => {
    const userId = req.user.id; // Logged-in user's ID

    try {
        await Notification.deleteMany({ user_id: userId });
        res.status(200).json({ message: "All notifications cleared successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};