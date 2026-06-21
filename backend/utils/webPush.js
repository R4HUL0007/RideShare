// =======================================================
// Web Push delivery (OPTIONAL, future-ready)
// -------------------------------------------------------
// Sends browser push notifications to a user's stored subscriptions. Fully
// optional: requires the `web-push` package (lazy-loaded) AND VAPID keys in env
// (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY). When either is missing this is a
// graceful no-op, so the app keeps working on real-time sockets alone.
//
//   Enable:  npm i web-push   +   set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
// =======================================================

let _webpush = null;
let _ready = null;

async function getWebPush() {
    if (_ready !== null) return _ready ? _webpush : null;
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) { _ready = false; return null; }
    try {
        _webpush = (await import("web-push")).default || (await import("web-push"));
        _webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@rideshare.app", pub, priv);
        _ready = true;
        return _webpush;
    } catch {
        _ready = false; // package not installed — silently disable
        return null;
    }
}

/**
 * Send a push to all of a user's subscriptions. No-op when web push isn't set
 * up. Removes dead subscriptions (410/404). Never throws.
 * @param {string} userId
 * @param {{title, body, type?, url?, tag?}} payload
 */
async function sendPushToUser(userId, payload) {
    const wp = await getWebPush();
    if (!wp) return { sent: 0, skipped: true };
    try {
        const PushSubscription = require("../models/PushSubscription");
        const subs = await PushSubscription.find({ user_id: userId }).lean();
        if (subs.length === 0) return { sent: 0 };
        const body = JSON.stringify(payload);
        let sent = 0;
        await Promise.all(subs.map(async (s) => {
            try {
                await wp.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body);
                sent += 1;
            } catch (err) {
                if (err.statusCode === 404 || err.statusCode === 410) {
                    await PushSubscription.deleteOne({ _id: s._id }).catch(() => {});
                }
            }
        }));
        return { sent };
    } catch {
        return { sent: 0, error: true };
    }
}

module.exports = { sendPushToUser, getWebPush };
