const mongoose = require("mongoose");

// A single message in a support ticket conversation. `from` is user / agent /
// system (system = lifecycle events like "X joined the conversation").
const TicketMessageSchema = new mongoose.Schema(
    {
        from: { type: String, enum: ["user", "agent", "system"], required: true },
        senderName: { type: String, default: "" },
        text: { type: String, required: true, maxlength: 4000 },
        at: { type: Date, default: Date.now },
    },
    { _id: false }
);

// An in-app support ticket that doubles as a conversation thread. The user
// opens it from "Email us" (Safety Center) with a topic + first message; their
// name/email come from their account (never typed). On create the platform
// emails the support inbox (from its own account, so nothing lands in the
// user's "Sent"). Support agents reply in-app from the admin panel; the user
// sees replies (and who's helping) in their Support section + gets a real-time
// notification and an email.
const SupportTicketSchema = new mongoose.Schema(
    {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        name: { type: String, default: "" },
        email: { type: String, default: "" },
        topic: { type: String, required: true, maxlength: 150 },
        // First message text (kept for back-compat / list previews).
        description: { type: String, required: true, maxlength: 4000 },

        status: { type: String, enum: ["open", "in_progress", "closed"], default: "open", index: true },
        emailed: { type: Boolean, default: false },
        adminNotes: { type: String, default: "" },

        // Conversation.
        agent_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        agentName: { type: String, default: "" },
        messages: [TicketMessageSchema],
        lastMessageAt: { type: Date, default: Date.now },
        unreadForUser: { type: Number, default: 0 },
        unreadForAgent: { type: Number, default: 0 },
    },
    { timestamps: true }
);

SupportTicketSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("SupportTicket", SupportTicketSchema);
