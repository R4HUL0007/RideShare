// =======================================================
// Smart Ride Suggestions — lightweight, rule-based (NO ML).
// Reuses the existing recommendation profile (buildProfile) for frequency-ranked
// favorite routes + preferred hours, and layers current-location radius matching
// and time-of-day/weekday bias on top to pick a single "smart card" suggestion.
// Bounded reads only; safe to call on every homepage load.
// =======================================================

const mongoose = require("mongoose");
const FavoriteLocation = require("../models/FavoriteLocation");
const { buildProfile } = require("./recommendation");

// Configurable match radius (meters). Default 300m.
const MATCH_RADIUS_M = Number(process.env.SUGGESTION_MATCH_RADIUS_M) || 300;

const norm = (s) => (s || "").trim().toLowerCase();

// Great-circle distance in meters between two {lat,lng} points (haversine).
function haversineMeters(a, b) {
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return Infinity;
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Nearest favorite location within `radiusM` of `coords`, or null.
function matchCurrentPlace(coords, favorites, radiusM = MATCH_RADIUS_M) {
    if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return null;
    let best = null;
    for (const f of favorites || []) {
        const c = f.coords || {};
        const d = haversineMeters(coords, { lat: c.lat, lng: c.lng });
        if (d <= radiusM && (!best || d < best.dist)) best = { place: f, dist: d };
    }
    return best ? best.place : null;
}

/**
 * Produce the homepage smart suggestion + favorite/frequent lists for a user.
 * @param userId
 * @param opts { lat, lng, hour (0-23 local), day (0-6 local, Sun=0) }
 * @returns { smartCard, favoritePlaces, frequentDestinations }
 */
async function buildSmartSuggestion(userId, opts = {}) {
    const { lat, lng, hour, day } = opts;
    const uid = new mongoose.Types.ObjectId(userId);

    const [profile, favorites] = await Promise.all([
        buildProfile(userId), // REUSE — favoriteRoutes (count/lastAt/topWeekday), preferredHours
        FavoriteLocation.find({ user_id: uid }).sort({ visitCount: -1, lastUsedAt: -1 }).limit(5).lean(),
    ]);

    const coords = (Number.isFinite(lat) && Number.isFinite(lng)) ? { lat, lng } : null;
    const currentPlace = matchCurrentPlace(coords, favorites);

    const routes = profile.favoriteRoutes || [];
    let best = null;
    for (const r of routes) {
        if (!r.destination) continue;
        let score = Math.min(20, (r.count || 0)); // (3) frequency
        let reason = "Based on your previous trips";

        // (1) current-location match — route originating at where the user is now.
        if (currentPlace && norm(r.source) && norm(currentPlace.label) &&
            (norm(r.source) === norm(currentPlace.label) || norm(r.source).includes(norm(currentPlace.label)) || norm(currentPlace.label).includes(norm(r.source)))) {
            score += 100;
            reason = `You often head to ${r.destination} from here`;
        }
        // (2) time context — usual hour and/or weekday.
        if (Number.isFinite(hour) && Array.isArray(profile.preferredHours) &&
            profile.preferredHours.some((ph) => Math.abs(ph - hour) <= 1)) {
            score += 10;
            reason = currentPlace ? reason : `Around your usual time — ${r.destination}`;
        }
        if (Number.isFinite(day) && r.topWeekday === day) score += 8;
        // (4) recency tiebreaker.
        score += r.lastAt ? Math.min(3, (Date.now() - r.lastAt < 14 * 864e5 ? 3 : 1)) : 0;

        if (!best || score > best.score || (score === best.score && (r.lastAt || 0) > (best.route.lastAt || 0))) {
            best = { route: r, score, reason };
        }
    }

    const smartCard = best ? {
        origin: best.route.source || (currentPlace ? currentPlace.label : ""),
        destination: best.route.destination,
        destCoords: best.route.destCoords || null,
        srcCoords: best.route.srcCoords || (currentPlace ? currentPlace.coords : null) || null,
        reason: best.reason,
    } : null;

    // Frequent destinations: unique from favorite routes, then favorites.
    const seen = new Set();
    const frequentDestinations = [];
    for (const r of routes) {
        const k = norm(r.destination);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        frequentDestinations.push({ label: r.destination, coords: r.destCoords || null, count: r.count || 0 });
        if (frequentDestinations.length >= 5) break;
    }

    const favoritePlaces = favorites.map((f) => ({
        _id: f._id, label: f.label, coords: f.coords || null, visitCount: f.visitCount || 0,
    }));

    return { smartCard, favoritePlaces, frequentDestinations };
}

module.exports = { haversineMeters, matchCurrentPlace, buildSmartSuggestion, MATCH_RADIUS_M };
