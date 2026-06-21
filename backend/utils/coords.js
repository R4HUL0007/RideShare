// Backend-local coordinate utilities (CommonJS).
//
// This intentionally mirrors the semantics of the frontend ESM
// `src/utils/mapUtils.js` `normalizeCoords`, but is implemented separately
// because the backend is CommonJS and must NOT import frontend ESM modules.

/**
 * Normalize an arbitrary coordinate-like input to a total { lat, lng } shape.
 *
 * When the input has finite numeric lat AND lng, both are preserved exactly.
 * Anything else (null, undefined, partial, non-finite, non-numeric) collapses
 * to { lat: null, lng: null }. The return value is always an object with both
 * keys present — never undefined and never a partial shape.
 *
 * @param {{ lat?: unknown, lng?: unknown } | null | undefined} coords
 * @returns {{ lat: number | null, lng: number | null }}
 *
 * Validates: Requirements 13.1, 13.2
 */
function normalizeCoords(coords) {
    if (
        coords &&
        typeof coords.lat === "number" &&
        Number.isFinite(coords.lat) &&
        typeof coords.lng === "number" &&
        Number.isFinite(coords.lng)
    ) {
        return { lat: coords.lat, lng: coords.lng };
    }
    return { lat: null, lng: null };
}

module.exports = { normalizeCoords };
