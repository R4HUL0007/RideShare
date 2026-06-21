// Shared, dependency-free map utilities.
//
// These are pure functions with no Google Maps SDK dependency, so they are
// unit/property testable in isolation. They back the Correctness Properties
// defined in the Interactive Maps & Navigation design.

/**
 * Estimate the per-person fare (in whole Indian Rupees) for a trip distance.
 *
 * Fare formula: Math.round(10 + 15 * distanceKm).
 * Non-numeric, non-finite, or negative input is treated as a distance of 0.
 *
 * @param {number} distanceKm - Route distance in kilometers (>= 0).
 * @returns {number} Estimated fare in whole rupees.
 *
 * Validates: Requirements 10.2
 */
export function estimateFare(distanceKm) {
  const km = Number.isFinite(distanceKm) && distanceKm >= 0 ? distanceKm : 0;
  return Math.round(10 + 15 * km);
}

/**
 * Format a distance given in meters as kilometers with exactly one decimal.
 *
 * Non-numeric, non-finite, or negative input is treated as 0, so the result
 * always has exactly one decimal place.
 *
 * @param {number} meters - Distance in meters (>= 0).
 * @returns {string} Distance in kilometers, e.g. "3.4".
 *
 * Validates: Requirements 8.2
 */
export function formatDistanceKm(meters) {
  const m = Number.isFinite(meters) && meters >= 0 ? meters : 0;
  return (m / 1000).toFixed(1);
}

/**
 * Convert a duration in seconds to whole minutes, rounded up.
 *
 * Returns the smallest integer not less than seconds / 60. Non-numeric,
 * non-finite, or negative input is treated as 0.
 *
 * @param {number} seconds - Duration in seconds (>= 0).
 * @returns {number} Duration in whole minutes, rounded up.
 *
 * Validates: Requirements 9.2
 */
export function formatDurationMinutes(seconds) {
  const s = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
  return Math.ceil(s / 60);
}

/**
 * Normalize an arbitrary coordinate-like input to a total { lat, lng } shape.
 *
 * When the input has finite numeric lat and lng, both are preserved exactly.
 * Anything else (null, undefined, partial, non-finite, non-numeric) collapses
 * to { lat: null, lng: null }. The return value is always an object with both
 * keys present, never undefined and never a partial shape.
 *
 * @param {{ lat?: unknown, lng?: unknown } | null | undefined} coords
 * @returns {{ lat: number | null, lng: number | null }}
 *
 * Validates: Requirements 13.1, 13.2
 */
export function normalizeCoords(coords) {
  if (
    coords &&
    typeof coords.lat === 'number' &&
    Number.isFinite(coords.lat) &&
    typeof coords.lng === 'number' &&
    Number.isFinite(coords.lng)
  ) {
    return { lat: coords.lat, lng: coords.lng };
  }
  return { lat: null, lng: null };
}

/**
 * Great-circle distance between two { lat, lng } points, in kilometers.
 *
 * Uses the haversine formula. Returns null when either input is not a finite
 * numeric coordinate pair (so callers can cleanly hide "distance away" UI).
 *
 * @param {{ lat:number, lng:number }} a
 * @param {{ lat:number, lng:number }} b
 * @returns {number | null} distance in km, or null if inputs are invalid.
 */
export function haversineKm(a, b) {
  const A = normalizeCoords(a);
  const B = normalizeCoords(b);
  if (A.lat === null || B.lat === null) return null;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(B.lat - A.lat);
  const dLng = toRad(B.lng - A.lng);
  const lat1 = toRad(A.lat);
  const lat2 = toRad(B.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Human-friendly "distance away" label for a km value.
 *   < 1 km  -> "{meters} m away" (rounded to nearest 10 m)
 *   >= 1 km -> "{km} km away" (one decimal)
 * Returns '' for null/invalid input.
 *
 * @param {number | null} km
 * @returns {string}
 */
export function formatNearby(km) {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) {
    const meters = Math.max(10, Math.round((km * 1000) / 10) * 10);
    return `${meters} m away`;
  }
  return `${km.toFixed(1)} km away`;
}

/**
 * Build a Google Maps directions deep link for driving navigation.
 *
 * Uses the documented Maps URLs form:
 *   https://www.google.com/maps/dir/?api=1&origin={lat},{lng}&destination={lat},{lng}&travelmode=driving
 *
 * Both coordinate pairs are normalized first so the URL is built from finite
 * numbers (or null) and parses back to the same origin/destination.
 *
 * @param {{ lat: number, lng: number }} sourceCoords
 * @param {{ lat: number, lng: number }} destinationCoords
 * @returns {string} Google Maps directions URL.
 *
 * Validates: Requirements 12.2
 */
export function buildDirectionsUrl(sourceCoords, destinationCoords) {
  const source = normalizeCoords(sourceCoords);
  const destination = normalizeCoords(destinationCoords);
  return (
    'https://www.google.com/maps/dir/?api=1' +
    `&origin=${source.lat},${source.lng}` +
    `&destination=${destination.lat},${destination.lng}` +
    '&travelmode=driving'
  );
}
