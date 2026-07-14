const mongoose = require("mongoose");

// A user-scoped notification. EVERY notification belongs to exactly one user
// (`user_id`) and is only ever queried/mutated for that authenticated user.
const NotificationSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    // High-level category used for icons/filtering on the client.
    type: {
        type: String,
        enum: ["booking", "ride", "tracking", "chat", "system"],
        default: "system",
    },
    title: { type: String, default: "Notification" },
    message: { type: String, required: true },
    ride_id: { type: mongoose.Schema.Types.ObjectId, ref: "Ride" },
    // Deep-link metadata so the client can route to the relevant module.
    // e.g. { tab: "myBookings" } or { tab: "track", rideId: "..." }.
    // Optional prefill fields let a notification open Find Rides pre-filled with
    // a destination + coords (used by ride recommendations) so "View" lands on
    // the relevant ride instead of a blank search.
    link: {
        tab: { type: String, default: null },
        rideId: { type: String, default: null },
        destination: { type: String, default: null },
        destLat: { type: Number, default: null },
        destLng: { type: Number, default: null },
    },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

// Common query path: a user's notifications, newest first.
NotificationSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", NotificationSchema);
