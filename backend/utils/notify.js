const Notification = require("../models/Notification");

/**
 * Create a user-scoped notification AND deliver it in real time to that user
 * only. The notification is always tied to `userId`; the socket payload is sent
 * exclusively to that user's socket (never broadcast), so a notification for
 * User A can never reach User B.
 *
 * @param {object} opts
 * @param {object} opts.io           Socket.io server instance (app.get("io"))
 * @param {object} opts.users        userId -> socketId map (app.get("users"))
 * @param {string} opts.userId       owner of the notification (required)
 * @param {string} [opts.type]       booking | ride | tracking | chat | system
 * @param {string} [opts.title]      short title
 * @param {string} opts.message      body text (required)
 * @param {string} [opts.rideId]     related ride id
 * @param {object} [opts.link]       deep-link metadata { tab, rideId }
 * @returns {Promise<object|null>} the created notification (lean object) or null
 */
async function createNotification({ io, users, userId, type = "system", title, message, rideId = null, link = null }) {
    if (!userId || !message) return null;

    const doc = await Notification.create({
        user_id: userId,
        type,
        title: title || defaultTitle(type),
        message,
        ride_id: rideId || null,
        link: link || null,
        read: false,
    });

    const payload = doc.toObject();

    // Targeted, per-user real-time delivery. We emit BOTH a rich `notification:new`
    // event (new system) and the legacy `notification` string event (back-compat
    // with any existing listeners) — only to this user's socket.
    if (io && userId) {
        const room = userId.toString();
        io.to(room).emit("notification:new", payload);
        io.to(room).emit("notification", message);
    }

    // Also deliver via Web Push (optional) so users get notified when the app
    // is closed. No-op unless web-push + VAPID keys are configured.
    try {
        const { sendPushToUser } = require("./webPush");
        sendPushToUser(userId, {
            title: title || defaultTitle(type),
            body: message,
            type,
            url: link?.rideId ? undefined : undefined, // SW maps type→route
            tag: type,
        });
    } catch { /* non-fatal */ }

    return payload;
}

function defaultTitle(type) {
    switch (type) {
        case "booking": return "Booking update";
        case "ride": return "Ride update";
        case "tracking": return "Ride tracking";
        case "chat": return "New message";
        default: return "Notification";
    }
}

/**
 * Bulk fan-out: create the SAME notification for many users in ONE write, and
 * deliver real-time events only to users who are currently online (bounded by
 * concurrent connections, not the total recipient count). Use this instead of
 * looping `createNotification` for broadcast-style events (e.g. "new ride
 * available"), which would otherwise do N sequential inserts + emits.
 *
 * For truly massive recipient sets this should be handed to a queue/worker
 * (fan-out-on-read or a job per shard); this keeps it to a single bulk insert
 * and online-only emits, which removes the O(N) sequential round-trips.
 *
 * @returns {Promise<number>} number of notifications created
 */
async function createNotificationsBulk({ io, users = {}, userIds = [], type = "system", title, message, rideId = null, link = null }) {
    const ids = (userIds || []).filter(Boolean);
    if (ids.length === 0 || !message) return 0;

    const t = title || defaultTitle(type);
    const now = new Date();
    const docs = ids.map((uid) => ({
        user_id: uid, type, title: t, message,
        ride_id: rideId || null, link: link || null, read: false, createdAt: now,
    }));

    // Single bulk write instead of N round-trips. `ordered: false` lets the rest
    // succeed even if one doc fails.
    const inserted = await Notification.insertMany(docs, { ordered: false });

    // Real-time: only emit to recipients who are currently connected. Uses
    // CLUSTER-WIDE presence (Redis) when available so we reach users on other
    // instances too; falls back to this instance's `users` map otherwise.
    if (io) {
        let onlineSet = null;
        try {
            const { getOnlineIds } = require("./presence");
            onlineSet = new Set(await getOnlineIds());
        } catch { onlineSet = null; }
        for (const d of inserted) {
            const room = d.user_id.toString();
            const online = onlineSet ? onlineSet.has(room) : Boolean(users && users[room]);
            if (online) {
                const payload = typeof d.toObject === "function" ? d.toObject() : d;
                io.to(room).emit("notification:new", payload);
                io.to(room).emit("notification", message);
            }
        }
    }
    return inserted.length;
}

module.exports = { createNotification, createNotificationsBulk };
