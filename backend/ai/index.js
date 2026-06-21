// =======================================================
// RidexShare AI — Gateway (public entry point)
// -------------------------------------------------------
// The single seam the rest of the backend talks to. Orchestrates the agent,
// records analytics, and exposes boot-time knowledge ingestion. Keeping this
// thin means the underlying AI stack (LangChain / RAG / vector store) stays
// modular and replaceable behind a stable `chat()` function.
// =======================================================

const agent = require("./agent");
const analytics = require("./analytics");
const llm = require("./providers/llm");
const { ensureKnowledgeBase } = require("./rag/ingest");

/**
 * Process one chat message and return the structured assistant response.
 * @param {string} message
 * @param {object} ctx  { user, sessionId }
 */
async function chat(message, ctx = {}) {
    const start = Date.now();
    let result;
    try {
        result = await agent.run(message, ctx);
    } catch (err) {
        console.error("[AI] agent error:", err.message);
        result = {
            reply: "Something went wrong on my side. I can still help with rides, bookings, payments and tracking — try again?",
            actions: [], cards: [], suggestions: ["Create a ride", "Find a ride", "My bookings"],
            sources: [], intent: "fallback", usedLLM: false, ragGrounded: false, toolsUsed: [], _error: true,
        };
    }

    analytics.log({
        userId: ctx.user?._id,
        sessionId: ctx.sessionId,
        message,
        intent: result.intent,
        toolsUsed: result.toolsUsed,
        ragGrounded: result.ragGrounded,
        ragSources: (result.sources || []).map((s) => s.title).filter(Boolean),
        usedLLM: result.usedLLM,
        success: !result._error,
        latencyMs: Date.now() - start,
        role: ctx.user?.isAdmin ? "admin" : (ctx.user?.role || ""),
    });

    return result;
}

/**
 * Boot-time initialization: ingest the knowledge base into the vector store.
 * Safe to call on every start (idempotent / skips when already populated).
 */
async function init() {
    try {
        const res = await ensureKnowledgeBase();
        const mode = llm.isEnabled() ? "LLM + RAG" : "rule-based + RAG";
        console.log(`[AI] Initialized (${mode}). Knowledge:`, res.skipped ? `${res.chunks} chunks (cached)` : `${res.chunks || 0} chunks ingested`);
    } catch (err) {
        console.warn("[AI] init failed (assistant still works in degraded mode):", err.message);
    }
}

module.exports = { chat, init };
