// =======================================================
// Rate limiter (per client IP + route key).
//
// Uses Redis (shared across all instances) when REDIS_URL is set, so limits are
// GLOBAL behind a load balancer. Falls back to an in-process Map for
// single-instance / dev. Same `rateLimit({ windowMs, max, key })` API either way.
//
// Client IP comes from Express's req.ip, which resolves X-Forwarded-For per the
// configured `trust proxy` hop count (set in server.js) — not a spoofable raw
// header.
// =======================================================
const { getRedis } = require("../config/redis");

const buckets = new Map(); // in-memory fallback: id -> { count, reset }

const clientIp = (req) => req.ip || req.socket?.remoteAddress || "anon";

// In-memory fixed window. Returns { limited, retryAfterSec }.
function memoryHit(id, windowMs, max) {
    const now = Date.now();
    let entry = buckets.get(id);
    if (!entry || now > entry.reset) {
        entry = { count: 0, reset: now + windowMs };
        buckets.set(id, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
        return { limited: true, retryAfterSec: Math.max(1, Math.ceil((entry.reset - now) / 1000)) };
    }
    return { limited: false };
}

// Redis fixed window via INCR + PEXPIRE on first hit.
async function redisHit(redis, id, windowMs, max) {
    const key = `rl:${id}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.pexpire(key, windowMs);
    if (count > max) {
        let ttl = await redis.pttl(key);
        if (ttl < 0) ttl = windowMs; // key with no expiry → reset it defensively
        return { limited: true, retryAfterSec: Math.max(1, Math.ceil(ttl / 1000)) };
    }
    return { limited: false };
}

function rateLimit({ windowMs = 60 * 1000, max = 10, key = "default" } = {}) {
    return async (req, res, next) => {
        const id = `${key}:${clientIp(req)}`;
        let result;
        const redis = getRedis();
        if (redis) {
            try {
                result = await redisHit(redis, id, windowMs, max);
            } catch {
                result = memoryHit(id, windowMs, max); // Redis blip → fail safe to memory
            }
        } else {
            result = memoryHit(id, windowMs, max);
        }
        if (result.limited) {
            res.set("Retry-After", String(result.retryAfterSec));
            return res.status(429).json({ message: `Too many requests. Please try again in ${result.retryAfterSec}s.` });
        }
        next();
    };
}

// Bound memory for the fallback path: drop expired buckets every few minutes.
const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
}, 5 * 60 * 1000);
if (cleanup.unref) cleanup.unref();

module.exports = { rateLimit };
