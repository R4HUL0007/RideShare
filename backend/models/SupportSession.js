const mongoose = require("mongoose");

// A live support conversation between a user and a support agent (admin).
// Lifecycle: waiting (user requested, no agent yet) -> active (an agent joined)
// -> closed. Messages are embedded for simplicity. System messages record
// lifecycle events ("X has joined the chat", "Chat closed by support").
const SupportMessageSchema = new mongoose.Schema(
    {
        from: { type: String, enum: ["user", "agent", "system"], required: true },
        senderName: { type: String, default: "" },
        text: { type: String, required: true, maxlength: 2000 },
        at: { type: Date, default: Date.now },
    },
    { _id: false }
);

const SupportSessionSchema = new mongoose.Schema(
    {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        userName: { type: String, default: "" },
        userEmail: { type: String, default: "" },
        topic: { type: String, default: "General help", maxlength: 120 },

        status: { type: String, enum: ["waiting", "active", "closed"], default: "waiting", index: true },
        agent_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        agentName: { type: String, default: "" },

        messages: [SupportMessageSchema],
        lastMessageAt: { type: Date, default: Date.now },
        // Simple unread counters so each side can badge new messages.
        unreadForAgent: { type: Number, default: 0 },
        unreadForUser: { type: Number, default: 0 },
        closedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

SupportSessionSchema.index({ status: 1, lastMessageAt: -1 });

module.exports = mongoose.model("SupportSession", SupportSessionSchema);
