// =======================================================
// Smart Route Matching — scoring engine (pure, CommonJS)
// -------------------------------------------------------
// Given a passenger's desired source+destination and a ride (with stored route
// coords + optional encoded polyline), compute:
//   - whether the source is within radius
//   - how far the passenger's destination is from the ride's route
//   - a 0–100 match score + a human explanation
//
// Thresholds are configurable (env-backed defaults). The engine never throws;
// missing data degrades gracefully (uses a straight-line route approximation).
// =======================================================

const { haversineKm, decodePolyline, pointToRoute, straightLine, validPoint } = require("./geo");

// Configurable thresholds (km). Env overrides allow tuning without code changes.
const CFG = {
    sourceRadiusKm: Number(process.env.MATCH_SOURCE_RADIUS_KM ?? 5),
    destOnRouteKm: Number(process.env.MATCH_DEST_ON_ROUTE_KM ?? 1.5), // "on the route"
    destNearRouteKm: Number(process.env.MATCH_DEST_NEAR_ROUTE_KM ?? 8), // max to still match
    destNearDestKm: Number(process.env.MATCH_DEST_NEAR_DEST_KM ?? 5),  // close to final destination
};

/**
 * Resolve the polyline for a ride: prefer the stored encoded polyline; else
 * decode nothing and fall back to a straight line between source/destination.
 */
function ridePolyline(ride) {
    const enc = ride?.route?.polyline;
    let pts = enc ? decodePolyline(enc) : [];
    if (pts.length < 2) {
        pts = straightLine(ride?.sourceCoords, ride?.destinationCoords);
    }
    return pts;
}

/**
 * Score a single ride against a passenger query.
 * @param {object} query  { sourceCoords?, destinationCoords? }
 * @param {object} ride   ride doc/lean with sourceCoords, destinationCoords, route?
 * @param {object} [opts] threshold overrides
 * @returns {null | { score, matchType, reason, sourceDistanceKm, destToRouteKm, destToDestKm }}
 *          null = no match (filtered out).
 */
function scoreRide(query, ride, opts = {}) {
    const cfg = { ...CFG, ...opts };
    const pSrc = query.sourceCoords, pDst = query.destinationCoords;
    const rSrc = ride.sourceCoords, rDst = ride.destinationCoords;

    // Source proximity (if both known). When passenger source is unknown we
    // don't penalize (treat as flexible pickup).
    let sourceDistanceKm = null;
    if (validPoint(pSrc) && validPoint(rSrc)) {
        sourceDistanceKm = haversineKm(pSrc, rSrc);
        if (sourceDistanceKm != null && sourceDistanceKm > cfg.sourceRadiusKm) {
            return null; // pickup too far — not a viable match
        }
    }

    // Destination analysis — requires passenger destination coords.
    if (!validPoint(pDst)) {
        // Without a destination we can't route-match; treat as a loose source-only match.
        return {
            score: sourceDistanceKm != null ? 60 : 50,
            matchType: "source_only",
            reason: "Pickup point is near the ride's start.",
            sourceDistanceKm, destToRouteKm: null, destToDestKm: null,
        };
    }

    const destToDestKm = validPoint(rDst) ? haversineKm(pDst, rDst) : null;
    const poly = ridePolyline(ride);
    const { distanceKm: destToRouteKm, alongFraction } = pointToRoute(pDst, poly);

    // Exact-ish destination match.
    if (destToDestKm != null && destToDestKm <= 0.4) {
        return mk(100, "exact", "Exact destination match.", sourceDistanceKm, destToRouteKm, destToDestKm);
    }

    // Destination lies ON the route (intermediate stop).
    if (destToRouteKm != null && destToRouteKm <= cfg.destOnRouteKm) {
        // If it's near the very end, it's basically the destination.
        const score = alongFraction > 0.85 ? 96 : 95;
        return mk(score, "on_route", `Your destination lies on this route${alongFraction < 0.9 ? " (the ride passes through it)" : ""}.`, sourceDistanceKm, destToRouteKm, destToDestKm);
    }

    // Destination very close to the route.
    if (destToRouteKm != null && destToRouteKm <= 3) {
        const score = Math.round(92 - (destToRouteKm / 3) * 7); // 92..85
        return mk(score, "near_route", `Drop point is ${destToRouteKm.toFixed(1)} km from your destination.`, sourceDistanceKm, destToRouteKm, destToDestKm);
    }

    // Nearby the final destination.
    if (destToDestKm != null && destToDestKm <= cfg.destNearDestKm) {
        const score = Math.round(85 - (destToDestKm / cfg.destNearDestKm) * 10); // 85..75
        return mk(score, "near_dest", `Ride ends ${destToDestKm.toFixed(1)} km from your destination.`, sourceDistanceKm, destToRouteKm, destToDestKm);
    }

    // Partial route proximity (within the wider threshold).
    if (destToRouteKm != null && destToRouteKm <= cfg.destNearRouteKm) {
        const score = Math.round(75 - ((destToRouteKm - 3) / (cfg.destNearRouteKm - 3)) * 10); // ~75..65
        return mk(Math.max(65, score), "partial", `This ride passes within ${destToRouteKm.toFixed(1)} km of your destination.`, sourceDistanceKm, destToRouteKm, destToDestKm);
    }

    return null; // out of range — not a match
}

function mk(score, matchType, reason, sourceDistanceKm, destToRouteKm, destToDestKm) {
    return { score, matchType, reason, sourceDistanceKm, destToRouteKm, destToDestKm };
}

/**
 * Rank rides by relevance. Each input ride is annotated with its match object.
 * Returns only matched rides, sorted by: score desc → distance-from-route asc →
 * departure time asc → driver rating desc.
 */
function rankRides(query, rides, opts = {}) {
    const out = [];
    for (const ride of rides) {
        const match = scoreRide(query, ride, opts);
        if (match) out.push({ ride, match });
    }
    out.sort((a, b) => {
        if (b.match.score !== a.match.score) return b.match.score - a.match.score;
        const ar = a.match.destToRouteKm ?? 9999, br = b.match.destToRouteKm ?? 9999;
        if (ar !== br) return ar - br;
        const at = new Date(a.ride.timing).getTime() || 0, bt = new Date(b.ride.timing).getTime() || 0;
        if (at !== bt) return at - bt;
        const arate = a.ride.user_id?.ratings?.driver?.average || 0;
        const brate = b.ride.user_id?.ratings?.driver?.average || 0;
        return brate - arate;
    });
    return out;
}

module.exports = { scoreRide, rankRides, CFG };
