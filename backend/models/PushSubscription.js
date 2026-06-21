const mongoose = require("mongoose");

// A browser Web Push subscription for a user. One user may have several
// (multiple devices/browsers). Keyed by the endpoint (unique). Used to deliver
// push notifications when the app is closed — complements the in-app socket
// notifications. Sending requires VAPID keys + the optional `web-push` package.
const PushSubscriptionSchema = new mongoose.Schema(
    {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        endpoint: { type: String, required: true, unique: true },
        keys: {
            p256dh: { type: String, default: "" },
            auth: { type: String, default: "" },
        },
        userAgent: { type: String, default: "" },
    },
    { timestamps: true }
);

module.exports = mongoose.model("PushSubscription", PushSubscriptionSchema);
