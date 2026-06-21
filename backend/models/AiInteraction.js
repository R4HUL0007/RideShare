const mongoose = require("mongoose");

// Append-only log of AI assistant interactions for analytics & future model
// optimization. Captures the question, detected intent, tools used, whether RAG
// grounded the answer, and whether the query failed (so we can surface most
// common questions, most used tools, failed queries, and retrieval accuracy).
// Stores NO sensitive payment values — only metadata.
const AiInteractionSchema = new mongoose.Schema(
    {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, default: null },
        sessionId: { type: String, default: "default" },
        message: { type: String, default: "" },
        intent: { type: String, default: "", index: true },
        toolsUsed: [{ type: String }],
        ragGrounded: { type: Boolean, default: false },
        ragSources: [{ type: String }],
        usedLLM: { type: Boolean, default: false },
        success: { type: Boolean, default: true, index: true },
        latencyMs: { type: Number, default: 0 },
        role: { type: String, default: "" }, // Student | Faculty | admin
    },
    { timestamps: true }
);

AiInteractionSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AiInteraction", AiInteractionSchema);
