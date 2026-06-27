const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { rateLimit } = require("../middleware/rateLimit");
const PushSubscription = require("../models/PushSubscription");

const router = express.Router();

// Throttle subscription writes (each is an upsert) per client.
const subscribeLimiter = rateLimit({ key: "push-subscribe", windowMs: 60 * 1000, max: 20 });

// Store / refresh a Web Push subscription for the logged-in user.
router.post("/subscribe", protect, subscribeLimiter, async (req, res) => {
    const { subscription } = req.body || {};
    if (!subscription?.endpoint) return res.status(400).json({ message: "Invalid subscription" });
    try {
        await PushSubscription.findOneAndUpdate(
            { endpoint: subscription.endpoint },
            {
                user_id: req.user._id,
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.keys?.p256dh || "", auth: subscription.keys?.auth || "" },
                userAgent: req.headers["user-agent"] || "",
            },
            { upsert: true, new: true }
        );
        res.status(201).json({ message: "Subscribed to push notifications" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Remove a subscription (e.g. user disables notifications).
router.post("/unsubscribe", protect, async (req, res) => {
    const { endpoint } = req.body || {};
    try {
        if (endpoint) await PushSubscription.deleteOne({ endpoint, user_id: req.user._id });
        res.status(200).json({ message: "Unsubscribed" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

module.exports = router;
