// =======================================================
// Smart, targeted ride-creation notifications.
//
// Replaces the old "notify EVERY same-role user" fan-out. When a ride is
// created we find only users whose OWN history (searches + past bookings for
// this destination) makes them likely to care, score them with simple rules,
// and PUSH-notify only the highly-relevant ones (score >= PUSH_THRESHOLD).
// Everyone else discovers the ride through the in-app "Recommended For You"
// section (served on demand by recommendation.js) — no notification spam.
//
// Lightweight by design: candidates come from INDEXED history queries scoped to
// this ride's destination (not a scan of all users), then a handful of cheap
// aggregations. No AI/ML — just deterministic scoring rules.
// =======================================================
const mongoose = require("mongoose");
const { haversineKm, validPoint } = require("./geo");
const { createNotification } = require("./notify");
const { getOnlineIds } = require("./presence");

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const TZ = process.env.RECO_TIMEZONE || "Asia/Kolkata"; // for hour/weekday matching
const LOOKBACK_DAYS = 45;       // how far back to look at a user's history
const MAX_CANDIDATES = 300;     // safety cap — keeps this lightweight
const PUSH_THRESHOLD = 70;      // >= this score → push + in-app notification
const NEAR_DEST_KM = 2;         // coord proximity that counts as "same destination"

// Score weights (mirror the product spec's rubric).
const W = {
    booked: 40,          // booked this route/destination before
    sameDestination: 25, // candidate pool already matched the destination
    frequent: 30,        // travels this route often
    recentSearch: 20,    // recently searched this route
    timeMatch: 15,       // ride time matches their usual hour
    weekdayMatch: 15,    // matches their usual weekday
    online: 10,          // currently online
    startsSoon: 15,      // ride departs within 30 min
    verified: 10,        // verified account (trust match)
    ignorePenalty: -30,  // repeatedly ignores recommendations
};

// Build a personalized notification for a ride (never a generic message).
function buildContent(ride) {
    const when = ride.timing ? new Date(ride.timing) : null;
    const mins = when ? Math.round((when.getTime() - Date.now()) / 60000) : null;
    const hour = when ? Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: TZ }).format(when)) : 12;
    const seats = ride.seatsAvailable || 1;
    const seatTxt = `${seats} seat${seats === 1 ? "" : "s"} remaining`;
    const departs = mins != null && mins <= 90 && mins >= 0
        ? `Departs in ${Math.max(1, mins)} minute${mins === 1 ? "" : "s"}`
        : (when ? `Departs ${new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(when)}` : "Departing soon");

    let title;
    if (hour >= 5 && hour <= 11) title = "🚗 Your usual morning ride is available";
    else if (hour >= 16 && hour <= 22) title = "🌆 Heading home?";
    else title = "🚗 A ride on your route is available";

    const message = `${ride.source || "Pickup"} → ${ride.destination}. ${departs}. ${seatTxt}.`;
    return { title, message };
}

// Gather per-user history signals for THIS ride's destination in one pass each.
// Returns Map<userIdStr, { searchCount, bookingCount, hours:Set, weekdays:Set, lastAt }>.
async function gatherSignals(ride) {
    const SearchLog = mongoose.model("SearchLog");
    const Ride = mongoose.model("Ride");
    const destLower = norm(ride.destination);
    if (!destLower) return new Map();
    const since = new Date(Date.now() - LOOKBACK_DAYS * 864e5);
    const driverId = ride.user_id?.toString();
    const rideDest = ride.destinationCoords;

    const [searchRows, bookingRows] = await Promise.all([
        // Users who recently SEARCHED this destination (same role audience).
        SearchLog.aggregate([
            { $match: { createdAt: { $gte: since }, role: ride.role, user_id: { $ne: null } } },
            { $addFields: { destL: { $toLower: { $ifNull: ["$destination", ""] } } } },
            { $match: { destL: destLower } },
            {
                $group: {
                    _id: "$user_id",
                    searchCount: { $sum: 1 },
                    lastAt: { $max: "$createdAt" },
                    hours: { $addToSet: { $hour: { date: "$createdAt", timezone: TZ } } },
                    weekdays: { $addToSet: { $dayOfWeek: { date: "$createdAt", timezone: TZ } } },
                },
            },
            { $limit: MAX_CANDIDATES },
        ]),
        // Users who previously BOOKED a ride to this destination.
        Ride.aggregate([
            { $match: { "passengers.0": { $exists: true } } },
            { $addFields: { destL: { $toLower: { $ifNull: ["$destination", ""] } } } },
            { $match: { destL: destLower } },
            { $unwind: "$passengers" },
            {
                $group: {
                    _id: "$passengers.user_id",
                    bookingCount: { $sum: 1 },
                    lastAt: { $max: "$timing" },
                    hours: { $addToSet: { $hour: { date: "$timing", timezone: TZ } } },
                    weekdays: { $addToSet: { $dayOfWeek: { date: "$timing", timezone: TZ } } },
                },
            },
            { $limit: MAX_CANDIDATES },
        ]),
    ]);

    const map = new Map();
    const put = (row, key) => {
        const id = row._id?.toString();
        if (!id || id === driverId) return;
        const e = map.get(id) || { searchCount: 0, bookingCount: 0, hours: new Set(), weekdays: new Set(), lastAt: null };
        e[key] = row[key === "searchCount" ? "searchCount" : "bookingCount"] || (key === "searchCount" ? row.searchCount : row.bookingCount) || 0;
        (row.hours || []).forEach((h) => e.hours.add(h));
        (row.weekdays || []).forEach((d) => e.weekdays.add(d));
        if (row.lastAt && (!e.lastAt || row.lastAt > e.lastAt)) e.lastAt = row.lastAt;
        map.set(id, e);
    };
    searchRows.forEach((r) => put(r, "searchCount"));
    bookingRows.forEach((r) => put(r, "bookingCount"));

    // Note the coord-proximity fallback: if the ride destination has coords, we
    // trust the text match above (campus destinations share names); coord check
    // stays available for future refinement without changing the candidate set.
    void rideDest; void haversineKm; void validPoint; void NEAR_DEST_KM;
    return map;
}

// Users who repeatedly see recommendations but never engage → stop pushing.
async function ignoreSet(candidateIds) {
    if (candidateIds.length === 0) return new Set();
    try {
        const RecommendationEvent = mongoose.model("RecommendationEvent");
        const since = new Date(Date.now() - 21 * 864e5);
        const rows = await RecommendationEvent.aggregate([
            { $match: { user_id: { $in: candidateIds.map((id) => new mongoose.Types.ObjectId(id)) }, createdAt: { $gte: since } } },
            {
                $group: {
                    _id: "$user_id",
                    impressions: { $sum: { $cond: [{ $eq: ["$kind", "impression"] }, 1, 0] } },
                    engaged: { $sum: { $cond: [{ $in: ["$kind", ["click", "conversion"]] }, 1, 0] } },
                },
            },
        ]);
        const s = new Set();
        rows.forEach((r) => { if (r.impressions >= 8 && r.engaged === 0) s.add(r._id.toString()); });
        return s;
    } catch { return new Set(); }
}

// Score one candidate from their signals + live context.
function scoreCandidate(sig, ride, ctx) {
    let score = W.sameDestination; // they matched this destination
    const reasons = [];

    if (sig.bookingCount > 0) { score += W.booked; reasons.push("on your usual route"); }
    if (sig.searchCount > 0) { score += W.recentSearch; reasons.push("you searched this recently"); }
    if (sig.bookingCount >= 3 || sig.searchCount >= 3) { score += W.frequent; reasons.push("you travel this often"); }

    if (ctx.rideHour != null && sig.hours.size && [...sig.hours].some((h) => Math.abs(h - ctx.rideHour) <= 1)) {
        score += W.timeMatch; reasons.push("around your usual time");
    }
    if (ctx.rideWeekday != null && sig.weekdays.has(ctx.rideWeekday)) score += W.weekdayMatch;
    if (ctx.online) score += W.online;
    if (ctx.startsSoon) { score += W.startsSoon; reasons.push("leaving soon"); }
    if (ctx.verified) score += W.verified;
    if (ctx.ignored) score += W.ignorePenalty;

    return { score, reason: reasons.slice(0, 2).join(" · ") };
}

/**
 * Find + notify only the users who are highly likely to want this ride.
 * Called (fire-and-forget) from createRide's setImmediate. Never throws.
 * @returns {Promise<number>} number of push/in-app notifications sent
 */
async function notifyRelevantUsers({ ride, io, users = {} }) {
    try {
        const signals = await gatherSignals(ride);
        if (signals.size === 0) return 0;

        const ids = [...signals.keys()];
        const User = mongoose.model("User");

        // Eligibility filter: same role, active account, ride notifications on,
        // and gender rule (male passengers can't be offered a female-only ride).
        const eligible = await User.find({
            _id: { $in: ids },
            role: ride.role,
            status: { $nin: ["suspended", "frozen"] },
        }).select("gender notificationPrefs isVerified phoneVerified").lean();

        const [onlineArr, ignored] = await Promise.all([getOnlineIds().catch(() => []), ignoreSet(ids)]);
        const online = new Set(onlineArr.map(String));

        const when = ride.timing ? new Date(ride.timing) : null;
        const rideHour = when ? Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: TZ }).format(when)) : null;
        const rideWeekday = when ? Number(new Intl.DateTimeFormat("en-US", { weekday: "numeric", timeZone: TZ }).format(when).replace(/\D/g, "")) || null : null;
        const startsSoon = when ? (when.getTime() - Date.now()) <= 30 * 60000 && when.getTime() >= Date.now() : false;

        const targets = [];
        for (const u of eligible) {
            const uid = u._id.toString();
            // Respect the user's ride-notification preference.
            if (u.notificationPrefs && u.notificationPrefs.rideUpdates === false) continue;
            // Gender safety: a Female-only ride is never offered to male users.
            if (ride.gender_preference === "Female" && u.gender === "Male") continue;

            const sig = signals.get(uid);
            const { score, reason } = scoreCandidate(sig, ride, {
                rideHour, rideWeekday, startsSoon,
                online: online.has(uid),
                verified: Boolean(u.phoneVerified || u.isVerified),
                ignored: ignored.has(uid),
            });
            if (score >= PUSH_THRESHOLD) targets.push({ uid, score, reason });
        }

        if (targets.length === 0) return 0;

        const { title, message } = buildContent(ride);
        // High-relevance set is small — send each as a full notification (in-app
        // + socket + web push). Personalized, never a generic broadcast.
        let sent = 0;
        for (const t of targets) {
            try {
                await createNotification({
                    io, users,
                    userId: t.uid,
                    type: "ride",
                    title,
                    message: t.reason ? `${message} (${t.reason})` : message,
                    rideId: ride._id,
                    link: {
                        tab: "findRides",
                        rideId: String(ride._id),
                        destination: ride.destination || null,
                        destLat: ride.destinationCoords?.lat ?? null,
                        destLng: ride.destinationCoords?.lng ?? null,
                    },
                });
                sent += 1;
            } catch { /* skip one bad recipient */ }
        }
        return sent;
    } catch (e) {
        // Never let targeting break ride creation.
        // eslint-disable-next-line no-console
        console.error("notifyRelevantUsers failed:", e.message);
        return 0;
    }
}

module.exports = { notifyRelevantUsers, scoreCandidate, buildContent, PUSH_THRESHOLD };
