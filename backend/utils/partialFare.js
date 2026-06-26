// =======================================================
// Partial (segment) fare for SHARED rides.
// -------------------------------------------------------
// A carpool driver sets ONE flat `pricePerPerson` for the whole route. When a
// passenger only rides part of that route (an intermediate drop-off), charging
// the full price is unfair. This helper derives a per-km rate from the driver's
// own price and charges for the distance actually travelled:
//
//     perKm       = pricePerPerson / fullRouteKm
//     segmentKm   = alongFraction(drop) * fullRouteKm   (distance from start → drop)
//     segmentFare = clamp(round(perKm * segmentKm), floor, pricePerPerson)
//
// It is pure and never throws: missing geometry/price falls back to the full
// price (we never silently undercharge on bad data). Server-authoritative — the
// client estimate is informational; the server always recomputes.
// =======================================================

const { haversineKm, decodePolyline, pointToRoute, straightLine, validPoint } = require("./geo");

// A segment must cost at least MIN_FRACTION of the full price (or MIN_FLOOR ₹,
// whichever is higher) so short hops still fairly compensate the driver.
const MIN_FRACTION = (() => {
    const n = Number(process.env.PARTIAL_FARE_MIN_FRACTION);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.2;
})();
const MIN_FLOOR = (() => {
    const n = Number(process.env.PARTIAL_FARE_MIN_RUPEES);
    return Number.isFinite(n) && n >= 0 ? n : 10;
})();
// At/above this fraction along the route, treat it as the full ride.
const FULL_RIDE_FRACTION = 0.92;

function round1(n) { return Math.round(n * 10) / 10; }

// Resolve the ride's path: prefer the stored encoded polyline, else a straight
// line between source and destination.
function ridePolyline(ride) {
    const enc = ride && ride.route && ride.route.polyline;
    let pts = enc ? decodePolyline(enc) : [];
    if (!pts || pts.length < 2) pts = straightLine(ride && ride.sourceCoords, ride && ride.destinationCoords);
    return pts;
}

// Full route distance (km): stored Directions distance, else haversine of the
// straight line between source and destination.
function fullRouteKm(ride) {
    const stored = ride && ride.route && ride.route.distanceKm;
    if (Number.isFinite(stored) && stored > 0) return stored;
    if (validPoint(ride && ride.sourceCoords) && validPoint(ride && ride.destinationCoords)) {
        const d = haversineKm(ride.sourceCoords, ride.destinationCoords);
        return Number.isFinite(d) && d > 0 ? d : 0;
    }
    return 0;
}

/**
 * Compute the fair per-seat fare for a passenger dropping at `dropCoords`.
 * @returns {{ fare:number, fullPrice:number, segmentKm:number, fullKm:number,
 *             fraction:number, perKm:number, isFullRide:boolean, partial:boolean }}
 */
function computeSegmentFare(ride, dropCoords) {
    const fullPrice = Number(ride && ride.pricePerPerson) || 0;
    const fullKm = fullRouteKm(ride);

    // Can't scale safely (free ride, or no geometry/destination) → full price.
    if (fullPrice <= 0 || fullKm <= 0 || !validPoint(dropCoords)) {
        return {
            fare: fullPrice, fullPrice, segmentKm: round1(fullKm), fullKm: round1(fullKm),
            fraction: 1, perKm: fullKm > 0 ? Math.round((fullPrice / fullKm) * 100) / 100 : 0,
            isFullRide: true, partial: false,
        };
    }

    const poly = ridePolyline(ride);
    const { alongFraction } = pointToRoute(dropCoords, poly);
    let frac = Number.isFinite(alongFraction) ? Math.min(1, Math.max(0, alongFraction)) : 1;
    const isFullRide = frac >= FULL_RIDE_FRACTION;
    if (isFullRide) frac = 1;

    const segmentKm = round1(fullKm * frac);
    const perKm = fullPrice / fullKm;
    const floor = Math.max(MIN_FLOOR, Math.round(fullPrice * MIN_FRACTION));
    let fare = Math.round(perKm * segmentKm);
    fare = Math.min(fullPrice, Math.max(floor, fare));

    return {
        fare,
        fullPrice,
        segmentKm,
        fullKm: round1(fullKm),
        fraction: Math.round(frac * 100) / 100,
        perKm: Math.round(perKm * 100) / 100,
        isFullRide,
        partial: !isFullRide && fare < fullPrice,
    };
}

module.exports = { computeSegmentFare, fullRouteKm };
