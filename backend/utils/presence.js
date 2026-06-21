const { getRedis } = require("../config/redis");

// Cluster-wide online presence. Backed by a Redis hash (userId -> open-socket
// count) so "drivers online" / live-monitoring counts and online-only socket
// fan-out are correct ACROSS instances. Falls back to an in-process Map when
// Redis isn't configured (single instance).
const ONLINE_KEY = "presence:online";
const local = new Map(); // userId -> count

async function markOnline(userId) {
    const id = String(userId);
    const r = getRedis();
    if (r) { try { await r.hincrby(ONLINE_KEY, id, 1); return; } catch { /* fall through */ } }
    local.set(id, (local.get(id) || 0) + 1);
}

async function markOffline(userId) {
    const id = String(userId);
    const r = getRedis();
    if (r) {
        try {
            const n = await r.hincrby(ONLINE_KEY, id, -1);
            if (n <= 0) await r.hdel(ONLINE_KEY, id);
            return;
        } catch { /* fall through */ }
    }
    const n = (local.get(id) || 1) - 1;
    if (n <= 0) local.delete(id); else local.set(id, n);
}

async function getOnlineIds() {
    const r = getRedis();
    if (r) { try { return Object.keys(await r.hgetall(ONLINE_KEY)); } catch { /* fall through */ } }
    return [...local.keys()];
}

async function isOnline(userId) {
    const id = String(userId);
    const r = getRedis();
    if (r) { try { return (await r.hexists(ONLINE_KEY, id)) === 1; } catch { /* fall through */ } }
    return local.has(id);
}

module.exports = { markOnline, markOffline, getOnlineIds, isOnline };
