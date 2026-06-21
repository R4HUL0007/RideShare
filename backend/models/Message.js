const mongoose = require("mongoose");

// A chat message scoped to a specific ride. Conversations are ride-based:
// a message always belongs to a ride and has a distinct sender/receiver who
// must both be participants of that ride (driver or a booked passenger).
const MessageSchema = new mongoose.Schema(
    {
        ride_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Ride",
            required: true,
            index: true,
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        receiver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        text: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000,
        },
        // Message kind. "text" is the default; "location" carries a shared
        // current-location pin in the `location` field below.
        type: {
            type: String,
            enum: ["text", "location"],
            default: "text",
        },
        location: {
            lat: { type: Number, default: null },
            lng: { type: Number, default: null },
            address: { type: String, default: "" },
        },
        // Read receipt: set when the receiver has seen the message.
        read: {
            type: Boolean,
            default: false,
        },
        readAt: {
            type: Date,
            default: null,
        },
        // Per-user "clear chat": user ids who have cleared this message from
        // THEIR view. The message is retained for everyone else. Filtered out
        // of that user's message/conversation queries.
        clearedBy: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        }],
    },
    { timestamps: true }
);

// Common query path: messages for a ride between two users, in order.
MessageSchema.index({ ride_id: 1, createdAt: 1 });
// Unread-count + inbox lookups for a receiver (avoids a collection scan).
MessageSchema.index({ receiver: 1, read: 1 });

module.exports = mongoose.model("Message", MessageSchema);
