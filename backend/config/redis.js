const Redis = require("ioredis");

// =======================================================
// Optional Redis. Enabled only when REDIS_URL is set — otherwise every
// consumer (rate limiter, cache, presence, Socket.io adapter) falls back to
// in-memory behavior so single-instance / dev runs need no Redis at all.
//
// Required ONLY when you run more than one backend instance behind a load
// balancer (shared rate limits, shared presence, cross-instance socket fan-out).
// =======================================================

const REDIS_URL = process.env.REDIS_URL || "";
let client = null;
let warned = false;

const isRedisEnabled = () => Boolean(REDIS_URL);

// Main command client. Commands fail fast (no offline queue) so callers can
// degrade gracefully to memory if Redis is briefly unavailable.
function getRedis() {
    if (!REDIS_URL) return null;
    if (!client) {
        client = new Redis(REDIS_URL, {
            maxRetriesPerRequest: 2,
            enableOfflineQueue: false,
            connectTimeout: 5000,
        });
        client.on("connect", () => console.log("[redis] connected"));
        client.on("error", (e) => {
            if (!warned) { console.error("[redis] error (falling back to in-memory):", e.message); warned = true; }
        });
    }
    return client;
}

// A fresh pub/sub pair for the Socket.io adapter (must NOT share the command
// client; the adapter puts the sub connection into subscriber mode).
function getRedisPair() {
    if (!REDIS_URL) return null;
    const pub = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    const sub = pub.duplicate();
    pub.on("error", (e) => console.error("[redis pub] error:", e.message));
    sub.on("error", (e) => console.error("[redis sub] error:", e.message));
    return { pub, sub };
}

module.exports = { getRedis, getRedisPair, isRedisEnabled };
