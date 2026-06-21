// =======================================================
// Geo utilities for Smart Route Matching (CommonJS, dependency-free)
// -------------------------------------------------------
// Haversine distance, Google "encoded polyline" decoding, and shortest
// distance from a point to a polyline (route). Pure functions — unit testable.
// =======================================================

const R_KM = 6371; // Earth radius (km)
const toRad = (d) => (d * Math.PI) / 180;

const isFiniteNum = (n) => typeof n === "number" && Number.isFinite(n);
const validPoint = (p) => p && isFiniteNum(p.lat) && isFiniteNum(p.lng);

/**
 * Great-circle distance between two {lat,lng} points in km. Null on bad input.
 */
function haversineKm(a, b) {
    if (!validPoint(a) || !validPoint(b)) return null;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Decode a Google Maps encoded polyline string into [{lat,lng}, ...].
 * Returns [] on empty/invalid input.
 */
function decodePolyline(encoded) {
    if (!encoded || typeof encoded !== "string") return [];
    const points = [];
    let index = 0, lat = 0, lng = 0;
    const len = encoded.length;
    try {
        while (index < len) {
            let result = 0, shift = 0, b;
            do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
            lat += (result & 1) ? ~(result >> 1) : (result >> 1);

            result = 0; shift = 0;
            do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
            lng += (result & 1) ? ~(result >> 1) : (result >> 1);

            points.push({ lat: lat / 1e5, lng: lng / 1e5 });
        }
    } catch {
        return points;
    }
    return points;
}

/**
 * Equirectangular projection to local km plane around a reference latitude.
 * Good enough for short segment math (city-scale).
 */
function toXY(p, refLat) {
    const x = toRad(p.lng) * Math.cos(toRad(refLat)) * R_KM;
    const y = toRad(p.lat) * R_KM;
    return { x, y };
}

/**
 * Shortest distance (km) from point P to segment AB, using a local planar
 * projection (accurate at city scale).
 */
function pointToSegmentKm(P, A, B) {
    const refLat = (A.lat + B.lat) / 2;
    const p = toXY(P, refLat), a = toXY(A, refLat), b = toXY(B, refLat);
    const abx = b.x - a.x, aby = b.y - a.y;
    const apx = p.x - a.x, apy = p.y - a.y;
    const ab2 = abx * abx + aby * aby;
    let t = ab2 === 0 ? 0 : (apx * abx + apy * aby) / ab2;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * abx, cy = a.y + t * aby;
    return Math.hypot(p.x - cx, p.y - cy);
}

/**
 * Shortest distance (km) from a point to a polyline (array of {lat,lng}).
 * Also returns the fractional position along the route [0..1] of the closest
 * point, so callers can tell "how far along" the destination lies.
 *
 * @returns {{ distanceKm: number|null, alongFraction: number }}
 */
function pointToRoute(point, polyline) {
    if (!validPoint(point) || !Array.isArray(polyline) || polyline.length === 0) {
        return { distanceKm: null, alongFraction: 0 };
    }
    if (polyline.length === 1) {
        return { distanceKm: haversineKm(point, polyline[0]), alongFraction: 0 };
    }

    // Precompute cumulative segment lengths for the along-fraction.
    let best = Infinity, bestSegIdx = 0, bestT = 0;
    const segLengths = [];
    let totalLen = 0;
    for (let i = 0; i < polyline.length - 1; i++) {
        const segLen = haversineKm(polyline[i], polyline[i + 1]) || 0;
        segLengths.push(segLen);
        totalLen += segLen;
    }

    for (let i = 0; i < polyline.length - 1; i++) {
        const A = polyline[i], B = polyline[i + 1];
        if (!validPoint(A) || !validPoint(B)) continue;
        const d = pointToSegmentKm(point, A, B);
        if (d < best) {
            best = d;
            bestSegIdx = i;
            // Compute t along this segment for the fraction.
            const refLat = (A.lat + B.lat) / 2;
            const a = toXY(A, refLat), b = toXY(B, refLat), p = toXY(point, refLat);
            const abx = b.x - a.x, aby = b.y - a.y;
            const ab2 = abx * abx + aby * aby;
            bestT = ab2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / ab2));
        }
    }

    let along = 0;
    if (totalLen > 0) {
        let acc = 0;
        for (let i = 0; i < bestSegIdx; i++) acc += segLengths[i];
        acc += (segLengths[bestSegIdx] || 0) * bestT;
        along = acc / totalLen;
    }
    return { distanceKm: best === Infinity ? null : best, alongFraction: along };
}

/**
 * Build a coarse polyline (straight line samples) between two points when no
 * encoded route polyline is available. Lets matching degrade gracefully for
 * legacy rides that only stored source/destination coords.
 */
function straightLine(source, destination, samples = 12) {
    if (!validPoint(source) || !validPoint(destination)) return [];
    const pts = [];
    for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        pts.push({ lat: source.lat + (destination.lat - source.lat) * t, lng: source.lng + (destination.lng - source.lng) * t });
    }
    return pts;
}

module.exports = { haversineKm, decodePolyline, pointToRoute, pointToSegmentKm, straightLine, validPoint };
