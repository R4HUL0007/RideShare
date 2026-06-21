// =======================================================
// RidexShare AI — LLM provider (abstraction)
// -------------------------------------------------------
// Wraps the optional Large Language Model. When OPENAI_API_KEY is set AND the
// LangChain packages are installed, this exposes a real LangChain ChatOpenAI
// model (with bound tools). Otherwise `isEnabled()` returns false and the
// agent uses the deterministic rule-based reasoner instead — so the platform
// works with zero AI dependencies.
//
// Everything is loaded LAZILY via dynamic import so `langchain` / `@langchain/*`
// are truly optional and a missing package never crashes the server.
// =======================================================

const config = require("../config");

let _model = null;
let _loadAttempted = false;
let _available = false;

/**
 * Returns true when a real LLM can be used (key present + packages importable).
 */
function isEnabled() {
    return config.llm.enabled && _available !== false;
}

/**
 * Lazily construct (and cache) the LangChain chat model. Returns null when the
 * LLM is unavailable for any reason (no key, package missing, init error).
 */
async function getModel() {
    if (!config.llm.enabled) return null;
    if (_model) return _model;
    if (_loadAttempted && !_available) return null;

    _loadAttempted = true;
    try {
        const { ChatOpenAI } = await import("@langchain/openai");
        _model = new ChatOpenAI({
            apiKey: config.llm.openaiApiKey,
            model: config.llm.model,
            temperature: config.llm.temperature,
            maxTokens: config.llm.maxTokens,
            streaming: false,
        });
        _available = true;
        return _model;
    } catch (err) {
        _available = false;
        console.warn("[AI] LLM unavailable (LangChain/OpenAI not installed or init failed). Using rule-based reasoner. Reason:", err.message);
        return null;
    }
}

/**
 * One-shot completion helper used for RAG answer synthesis. Returns the string
 * content, or null if the LLM is unavailable (caller should fall back).
 *
 * @param {Array<{role:string, content:string}>} messages
 */
async function complete(messages) {
    const model = await getModel();
    if (!model) return null;
    try {
        const res = await model.invoke(
            messages.map((m) => [m.role === "system" ? "system" : m.role === "assistant" ? "ai" : "human", m.content])
        );
        return typeof res?.content === "string" ? res.content : Array.isArray(res?.content) ? res.content.map((c) => c.text || "").join("") : null;
    } catch (err) {
        console.warn("[AI] LLM completion failed:", err.message);
        return null;
    }
}

module.exports = { isEnabled, getModel, complete };
