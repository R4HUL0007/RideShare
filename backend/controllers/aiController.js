// =======================================================
// RidexShare AI — Controller
// -------------------------------------------------------
// HTTP surface for the AI assistant. `chat` is the conversational endpoint
// (protected: runs with the authenticated user's context, so all data tools
// are hard-scoped to that user). `analytics` exposes aggregate AI metrics for
// the admin panel. `reindex` re-ingests the knowledge base (admin only).
// =======================================================

const ai = require("../ai");
const analytics = require("../ai/analytics");
const { ingestKnowledgeBase } = require("../ai/rag/ingest");
const { containsAbuse } = require("../utils/moderation");

// Guardrail: block attempts to extract secrets, credentials, or system/internal
// details (API keys, env vars, DB connection strings, source code, the system
// prompt, other users' private data, etc.). The assistant is a product helper —
// it must never surface infrastructure or security-sensitive information.
const SENSITIVE_RE = new RegExp(
    [
        "api[\\s_-]?key", "secret\\s*key", "razorpay\\s*(key|secret)", "access\\s*token",
        "\\benv\\b", "environment\\s*variable", "\\.env", "connection\\s*string",
        "mongo(db)?\\s*(uri|url|password|connection)", "database\\s*(password|credential|uri|url)",
        "jwt\\s*secret", "private\\s*key", "vapid", "cloudinary\\s*secret",
        "system\\s*prompt", "your\\s*(instructions|prompt|rules|configuration)",
        "source\\s*code", "show\\s*me\\s*the\\s*code", "admin\\s*(password|credential)",
        "other\\s*(user|users|people)('|’)?s?\\s*(data|password|details|info|phone|email)",
    ].join("|"),
    "i"
);

const SENSITIVE_REPLY =
    "I can't share technical or security-sensitive details like API keys, secrets, environment variables, " +
    "database info, source code, or other users' private data. I'm here to help you with rides, bookings, " +
    "payments, tracking, and safety — what would you like to do?";

/**
 * POST /api/ai/chat
 * body: { message, sessionId? }
 * Auth required. The agent answers using RAG + tools, scoped to req.user.
 */
exports.chat = async (req, res) => {
    const { message, sessionId } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ message: "A non-empty 'message' is required." });
    }
    if (message.length > 1000) {
        return res.status(400).json({ message: "Message is too long." });
    }
    // Content restriction: refuse abusive/violent input instead of processing it.
    if (containsAbuse(message)) {
        return res.status(200).json({
            reply: "Let's keep it respectful — I can't help with messages that contain abusive or violent language. How can I help with your rides, payments, or safety?",
            actions: [],
            suggestions: [],
            cards: [],
            moderated: true,
        });
    }
    // Security guardrail: never leak secrets, credentials, or system internals.
    if (SENSITIVE_RE.test(message)) {
        return res.status(200).json({
            reply: SENSITIVE_REPLY,
            actions: [],
            suggestions: ["What is RidexShare?", "How do I book a ride?", "How does payment work?"],
            cards: [],
            moderated: true,
        });
    }
    try {
        const result = await ai.chat(message.trim(), { user: req.user, sessionId: sessionId || "default" });
        return res.status(200).json(result);
    } catch (err) {
        console.error("[AI] chat controller error:", err.message);
        return res.status(500).json({ message: "Assistant error", error: err.message });
    }
};

/**
 * GET /api/ai/analytics?days=30  (admin)
 */
exports.analytics = async (req, res) => {
    try {
        const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));
        const data = await analytics.summary(days);
        return res.status(200).json(data);
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * POST /api/ai/reindex  (admin) — re-ingest the knowledge base.
 */
exports.reindex = async (req, res) => {
    try {
        const result = await ingestKnowledgeBase();
        return res.status(200).json({ message: "Knowledge base re-indexed", ...result });
    } catch (err) {
        return res.status(500).json({ message: "Reindex failed", error: err.message });
    }
};
