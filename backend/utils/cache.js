const { getRedis } = require("../config/redis");

// Tiny JSON cache backed by Redis when available, else an in-process Map with
// TTL. Safe for read-mostly aggregates (trending routes, dashboards). Never
// cache per-user-sensitive data without a user-scoped key.

const mem = new Map(); // key -> { val, exp }

async function cacheGet(key) {
    const r = getRedis();
    if (r) {
        try {
            const v = await r.get(key);
            return v ? JSON.parse(v) : null;
        } catch { return null; }
    }
    const e = mem.get(key);
    if (!e) return null;
    if (Date.now() > e.exp) { mem.delete(key); return null; }
    return e.val;
}

async function cacheSet(key, val, ttlSec = 60) {
    const r = getRedis();
    if (r) {
        try { await r.set(key, JSON.stringify(val), "EX", ttlSec); return; } catch { /* fall through */ }
    }
    mem.set(key, { val, exp: Date.now() + ttlSec * 1000 });
}

async function cacheDel(key) {
    const r = getRedis();
    if (r) { try { await r.del(key); return; } catch { /* fall through */ } }
    mem.delete(key);
}

// Get-or-compute: return the cached value or run fn(), cache it, and return it.
async function cacheWrap(key, ttlSec, fn) {
    const hit = await cacheGet(key);
    if (hit !== null && hit !== undefined) return hit;
    const val = await fn();
    if (val !== null && val !== undefined) await cacheSet(key, val, ttlSec);
    return val;
}

module.exports = { cacheGet, cacheSet, cacheDel, cacheWrap };
