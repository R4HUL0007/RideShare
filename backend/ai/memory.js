// =======================================================
// RidexShare AI — Conversation Memory
// -------------------------------------------------------
// Per-user, per-session short-term memory. Holds recent turns and an in-progress
// slot-filling flow (e.g. multi-step ride creation) so the agent remembers
// context across messages ("Create a ride to Ahmedabad" → "What time?" → "8 AM").
//
// In-process TTL store (sufficient for a single-node deployment). The interface
// is intentionally tiny so it can be swapped for Redis later without touching
// callers.
// =======================================================

const config = require("./config");

const sessions = new Map(); // key -> { turns: [], flow: {}, lastSeen: ts }

function keyFor(userId, sessionId) {
    return `${userId || "anon"}::${sessionId || "default"}`;
}

function gc() {
    const now = Date.now();
    for (const [k, v] of sessions.entries()) {
        if (now - v.lastSeen > config.memory.ttlMs) sessions.delete(k);
    }
}

function get(userId, sessionId) {
    gc();
    const key = keyFor(userId, sessionId);
    if (!sessions.has(key)) {
        sessions.set(key, { turns: [], flow: null, lastSeen: Date.now() });
    }
    const s = sessions.get(key);
    s.lastSeen = Date.now();
    return s;
}

function addTurn(userId, sessionId, role, content) {
    const s = get(userId, sessionId);
    s.turns.push({ role, content, at: Date.now() });
    // Cap history.
    const max = config.memory.maxTurns * 2;
    if (s.turns.length > max) s.turns = s.turns.slice(-max);
}

function getHistory(userId, sessionId) {
    return get(userId, sessionId).turns;
}

function setFlow(userId, sessionId, flow) {
    get(userId, sessionId).flow = flow;
}

function getFlow(userId, sessionId) {
    return get(userId, sessionId).flow;
}

function clearFlow(userId, sessionId) {
    get(userId, sessionId).flow = null;
}

function clear(userId, sessionId) {
    sessions.delete(keyFor(userId, sessionId));
}

module.exports = { get, addTurn, getHistory, setFlow, getFlow, clearFlow, clear };
