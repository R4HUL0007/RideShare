// =======================================================
// Smart Recommendation Engine
// -------------------------------------------------------
// Behavior-driven recommendations for passengers and drivers. Learns from
// booking history, ride history and search logs. Pure-ish (DB reads only),
// no ML — but structured with clean extension points for future collaborative
// filtering / predictive models (see `scoreRide`).
//
// Scoring blends: route similarity, booking frequency, search frequency, time
// preference, ride popularity (seats booked) and driver rating.
// =======================================================

const mongoose = require("mongoose");
const Ride = require("../models/Ride");
const { rankRides } = require("./routeMatch");

const idStr = (v) => (v == null ? null : typeof v === "string" ? v : v._id ? v._id.toString() : v.toString());
const routeKey = (s, d) => `${(s || "").trim().toLowerCase()}→${(d || "").trim().toLowerCase()}`;

/**
 * Build the user's "route profile": frequency-ranked routes from bookings,
 * created rides and searches, plus preferred departure hours and a coordinate
 * for the most frequent destination (for route matching).
 */
async function buildProfile(userId) {
    const SearchLog = require("../models/SearchLog");
    const uid = new mongoose.Types.ObjectId(userId);

    const [booked, searches] = await Promise.all([
        Ride.find({ "passengers.user_id": uid })
            .select("source destination destinationCoords sourceCoords timing passengers")
            .sort({ createdAt: -1 }).limit(60).lean(),
        SearchLog.find({ user_id: uid }).select("source destination destinationCoords sourceCoords createdAt").sort({ createdAt: -1 }).limit(120).lean(),
    ]);

    // Weighted route frequency: a booking counts more than a search.
    const routes = new Map(); // key -> { source, destination, destCoords, count, lastAt, weekdays:Set }
    const bump = (s, d, destCoords, at, weight) => {
        const key = routeKey(s, d);
        if (!d) return;
        const e = routes.get(key) || { source: s, destination: d, destCoords: null, count: 0, lastAt: 0, hours: {}, weekdays: {} };
        e.count += weight;
        if (destCoords?.lat != null && !e.destCoords) e.destCoords = destCoords;
        const t = at ? new Date(at).getTime() : 0;
        if (t > e.lastAt) e.lastAt = t;
        if (at) {
            const dt = new Date(at);
            e.hours[dt.getHours()] = (e.hours[dt.getHours()] || 0) + 1;
            e.weekdays[dt.getDay()] = (e.weekdays[dt.getDay()] || 0) + 1;
        }
        routes.set(key, e);
    };

    for (const r of booked) bump(r.source, r.destination, r.destinationCoords, pickBookingTime(r, userId), 3);
    for (const s of searches) bump(s.source, s.destination, s.destinationCoords, s.createdAt, 1);

    const ranked = [...routes.values()].sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);

    // Preferred departure hours (top across all activity).
    const hourTally = {};
    ranked.forEach((r) => Object.entries(r.hours).forEach(([h, c]) => { hourTally[h] = (hourTally[h] || 0) + c; }));
    const preferredHours = Object.entries(hourTally).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => Number(h));

    return {
        favoriteRoutes: ranked.slice(0, 5).map((r) => ({
            source: r.source, destination: r.destination, destCoords: r.destCoords, count: r.count,
            lastAt: r.lastAt || null,
            topWeekday: topKey(r.weekdays),
        })),
        recentRoutes: dedupeRecent(booked, searches),
        preferredHours,
    };
}

function pickBookingTime(ride, userId) {
    const mine = (ride.passengers || []).find((p) => idStr(p.user_id || p) === idStr(userId));
    return mine?.bookedAt || ride.timing;
}
function topKey(obj) {
    const e = Object.entries(obj || {}).sort((a, b) => b[1] - a[1])[0];
    return e ? Number(e[0]) : null;
}
function dedupeRecent(booked, searches) {
    const seen = new Set(); const out = [];
    for (const r of [...booked, ...searches]) {
        const key = routeKey(r.source, r.destination);
        if (!r.destination || seen.has(key)) continue;
        seen.add(key);
        out.push({ source: r.source, destination: r.destination });
        if (out.length >= 6) break;
    }
    return out;
}

/**
 * Passenger recommendations: available rides matching the user's favorite
 * routes, scored by relevance. Reuses the route-matching engine for proximity.
 */
async function recommendRidesForPassenger(userId, role, { limit = 8 } = {}) {
    const profile = await buildProfile(userId);
    if (profile.favoriteRoutes.length === 0) {
        return { items: [], profile };
    }

    // Candidate pool: available rides for the user's role, not their own.
    const candidates = await Ride.find({
        status: "Available",
        role,
        seatsAvailable: { $gte: 1 },
        user_id: { $ne: new mongoose.Types.ObjectId(userId) },
    })
        .select("source destination destinationCoords sourceCoords timing seatsAvailable pricePerPerson user_id vehicle_id route passengers")
        .populate("user_id", "name ratings isDriverVerified")
        .populate("vehicle_id", "make model vehicleType")
        .limit(300)
        .lean();

    const now = Date.now();
    const scored = [];
    for (const ride of candidates) {
        // Only future rides.
        if (ride.timing && new Date(ride.timing).getTime() < now) continue;

        let best = null;
        for (const fav of profile.favoriteRoutes) {
            const s = scoreRide(ride, fav, profile);
            if (s && (!best || s.score > best.score)) best = s;
        }
        if (best) scored.push({ ride, reco: best });
    }

    scored.sort((a, b) => b.reco.score - a.reco.score || new Date(a.ride.timing) - new Date(b.ride.timing));
    return {
        profile,
        items: scored.slice(0, limit).map(({ ride, reco }) => ({
            ...ride,
            _reco: { score: reco.score, reason: reco.reason },
        })),
    };
}

/**
 * Score a candidate ride against one favorite route. Blends route similarity
 * (text + coordinate proximity), recency-weighted frequency, time preference,
 * popularity and driver rating into 0–100.
 *
 * Extension point: a future ML model can replace this function while keeping
 * the same (ride, fav, profile) → { score, reason } contract.
 */
function scoreRide(ride, fav, profile) {
    let score = 0;
    let reason = "";

    const sameDest = routeKey("", ride.destination) === routeKey("", fav.destination);
    const sameRoute = routeKey(ride.source, ride.destination) === routeKey(fav.source, fav.destination);

    // Route similarity via coordinates (uses route-match engine for overlap).
    let proximity = null;
    if (fav.destCoords?.lat != null) {
        const ranked = rankRides({ sourceCoords: ride.sourceCoords, destinationCoords: fav.destCoords }, [ride]);
        if (ranked.length) proximity = ranked[0].match;
    }

    if (sameRoute) { score = 95; reason = "On your usual route."; }
    else if (sameDest) { score = 88; reason = `You frequently travel to ${ride.destination}.`; }
    else if (proximity && proximity.score >= 85) { score = Math.min(90, proximity.score); reason = proximity.reason; }
    else if (proximity && proximity.score >= 70) { score = proximity.score - 5; reason = proximity.reason; }
    else return null; // not relevant to this favorite

    // Frequency boost (capped).
    score += Math.min(6, (fav.count || 0));

    // Time preference: rides near a preferred hour get a small boost.
    if (ride.timing && profile.preferredHours?.length) {
        const h = new Date(ride.timing).getHours();
        if (profile.preferredHours.some((ph) => Math.abs(ph - h) <= 1)) {
            score += 3;
            if (!reason.includes("usual time")) reason += " Around your usual time.";
        }
    }

    // Popularity (seats already booked) + driver rating — gentle tie-breakers.
    const booked = (ride.passengers || []).length;
    score += Math.min(2, booked);
    const rating = ride.user_id?.ratings?.driver?.average || 0;
    score += rating >= 4.5 ? 2 : rating >= 4 ? 1 : 0;

    return { score: Math.max(0, Math.min(100, Math.round(score))), reason: reason.trim() };
}

/**
 * Driver demand insights: most-searched destinations, high-demand routes, and
 * "unserved" routes (searched but yielding few/no results) — opportunities to
 * create rides. Scoped to the driver's role audience.
 */
async function demandInsightsForDriver(userId, role, { days = 7 } = {}) {
    const SearchLog = require("../models/SearchLog");
    const since = new Date(); since.setDate(since.getDate() - days);

    const match = { createdAt: { $gte: since }, destination: { $ne: "" } };
    if (role) match.role = role;

    const [popular, unserved, myRoutes] = await Promise.all([
        // Most searched destinations.
        SearchLog.aggregate([
            { $match: match },
            { $group: { _id: { $toLower: "$destination" }, label: { $first: "$destination" }, count: { $sum: 1 } } },
            { $sort: { count: -1 } }, { $limit: 8 },
        ]),
        // Unserved: searches that returned no results.
        SearchLog.aggregate([
            { $match: { ...match, resultCount: 0 } },
            { $group: { _id: { $toLower: "$destination" }, label: { $first: "$destination" }, count: { $sum: 1 } } },
            { $sort: { count: -1 } }, { $limit: 6 },
        ]),
        // The driver's own created routes (to suggest "create again").
        Ride.find({ user_id: new mongoose.Types.ObjectId(userId) }).select("source destination").sort({ createdAt: -1 }).limit(20).lean(),
    ]);

    return {
        days,
        popularDestinations: popular.map((p) => ({ destination: p.label, searches: p.count })),
        unservedRoutes: unserved.map((p) => ({ destination: p.label, searches: p.count })),
        suggestedToCreate: suggestRoutes(popular, myRoutes),
    };
}

// Suggest routes the driver could create: popular destinations they've served
// before (warm) ranked first, then other popular ones.
function suggestRoutes(popular, myRoutes) {
    const mineDest = new Set(myRoutes.map((r) => (r.destination || "").toLowerCase()));
    const out = popular.map((p) => ({
        destination: p.label,
        searches: p.count,
        familiar: mineDest.has((p.label || "").toLowerCase()),
    }));
    out.sort((a, b) => (b.familiar - a.familiar) || (b.searches - a.searches));
    return out.slice(0, 5);
}

/**
 * Trending routes across the platform (most searched + most booked), for a
 * shared "🔥 Trending" card.
 */
async function trendingRoutes({ days = 7 } = {}) {
    const SearchLog = require("../models/SearchLog");
    const since = new Date(); since.setDate(since.getDate() - days);
    const [searched, booked] = await Promise.all([
        SearchLog.aggregate([
            { $match: { createdAt: { $gte: since }, destination: { $ne: "" } } },
            { $group: { _id: { $toLower: "$destination" }, label: { $first: "$destination" }, count: { $sum: 1 } } },
            { $sort: { count: -1 } }, { $limit: 6 },
        ]),
        Ride.aggregate([
            { $match: { createdAt: { $gte: since } } },
            { $project: { destination: 1, n: { $size: { $ifNull: ["$passengers", []] } } } },
            { $group: { _id: { $toLower: "$destination" }, label: { $first: "$destination" }, bookings: { $sum: "$n" } } },
            { $sort: { bookings: -1 } }, { $limit: 6 },
        ]),
    ]);
    return {
        mostSearched: searched.map((s) => ({ destination: s.label, count: s.count })),
        mostBooked: booked.map((b) => ({ destination: b.label, count: b.bookings })),
    };
}

module.exports = { buildProfile, recommendRidesForPassenger, demandInsightsForDriver, trendingRoutes, scoreRide };
