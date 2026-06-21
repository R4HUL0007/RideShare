// Property-based tests for the pure coordinate utilities in mapUtils.js.
//
// These exercise the Correctness Properties from the Interactive Maps &
// Navigation design document:
//   - Property 4 (Reqs 13.1, 13.2): normalizeCoords totality   -> normalizeCoords
//   - Property 6 (Req 12.2):        deep-link round-trip        -> buildDirectionsUrl
//
// normalizeCoords is intentionally exercised with a *wide* mix of inputs
// (valid pairs, partial objects, non-numeric values, NaN/Infinity, null,
// undefined, and fully arbitrary values) to confirm it is total: it always
// returns a flat { lat, lng } where each field is a finite number or null.
//
// buildDirectionsUrl is exercised with valid finite coordinate pairs bounded
// to real-world lat/lng ranges, confirming the generated URL parses back to
// the same origin/destination and always specifies driving mode.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { normalizeCoords, buildDirectionsUrl } from './mapUtils.js';

// Number of generated cases per property. Kept low so the suite runs fast
// while still exercising a spread of inputs (fast-check default is 100).
const PBT_RUNS = 10;

// ---------------------------------------------------------------------------
// Shared generators
// ---------------------------------------------------------------------------

// A finite double (no NaN, no Infinity). These are the only values that
// normalizeCoords should preserve.
const finiteDouble = fc.double({ noNaN: true, noDefaultInfinity: true });

// Values that are explicitly NOT finite numbers. normalizeCoords must collapse
// any coordinate field carrying one of these to null.
const nonNumericValue = fc.oneof(
  fc.string(),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity),
  fc.boolean(),
  fc.integer().map((n) => String(n)), // numeric-looking strings are still strings
);

// Inputs that can NEVER be a complete finite numeric pair, by construction:
// partial records, records with at least one non-numeric field, and non-object
// primitives. Used to assert the "collapse to {lat:null,lng:null}" branch.
const invalidCoordInput = fc.oneof(
  fc.record({ lat: finiteDouble }), // missing lng
  fc.record({ lng: finiteDouble }), // missing lat
  fc.record({ lat: nonNumericValue, lng: nonNumericValue }),
  fc.record({ lat: finiteDouble, lng: nonNumericValue }),
  fc.record({ lat: nonNumericValue, lng: finiteDouble }),
  fc.record({ lat: nonNumericValue }),
  fc.record({ lng: nonNumericValue }),
  fc.record({}),
  fc.constant(null),
  fc.constant(undefined),
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.array(fc.anything()),
);

// A wide mix used for the totality property. Note fc.double() WITHOUT options
// can emit NaN / Infinity, which is desirable here: it confirms those collapse
// to null. fc.anything() throws fully arbitrary structures at the function.
const anyCoordInput = fc.oneof(
  fc.record({ lat: fc.double(), lng: fc.double() }),
  fc.record({ lat: fc.double() }),
  fc.record({ lng: fc.double() }),
  fc.record({ lat: nonNumericValue, lng: nonNumericValue }),
  fc.constant(null),
  fc.constant(undefined),
  fc.anything(),
);

// Helper mirroring normalizeCoords' acceptance predicate, used only to express
// the collapse property precisely (defense-in-depth alongside the generators).
const isFinitePair = (c) =>
  c != null &&
  typeof c === 'object' &&
  typeof c.lat === 'number' &&
  Number.isFinite(c.lat) &&
  typeof c.lng === 'number' &&
  Number.isFinite(c.lng);

const isFiniteOrNull = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));

// ---------------------------------------------------------------------------
// Property 4 — normalizeCoords totality
// ---------------------------------------------------------------------------

describe('normalizeCoords (Property 4 — coordinate normalization totality)', () => {
  // Validates: Requirements 13.1, 13.2
  it('always returns exactly { lat, lng } with each value a finite number or null', () => {
    fc.assert(
      fc.property(anyCoordInput, (input) => {
        const result = normalizeCoords(input);

        // Result is a plain object with EXACTLY the keys lat and lng.
        expect(result).not.toBeNull();
        expect(typeof result).toBe('object');
        expect(Object.keys(result).sort()).toEqual(['lat', 'lng']);

        // Neither field is ever undefined.
        expect(result.lat).not.toBeUndefined();
        expect(result.lng).not.toBeUndefined();

        // Each field is a finite number or null — never a nested/partial shape.
        expect(isFiniteOrNull(result.lat)).toBe(true);
        expect(isFiniteOrNull(result.lng)).toBe(true);
      }),
      { numRuns: PBT_RUNS },
    );
  });

  // Validates: Requirements 13.1
  it('preserves a complete finite numeric pair exactly', () => {
    fc.assert(
      fc.property(finiteDouble, finiteDouble, (lat, lng) => {
        expect(normalizeCoords({ lat, lng })).toEqual({ lat, lng });
      }),
      { numRuns: PBT_RUNS },
    );
  });

  // Validates: Requirements 13.1
  it('ignores extra properties and preserves only lat/lng of a finite pair', () => {
    fc.assert(
      fc.property(finiteDouble, finiteDouble, fc.anything(), (lat, lng, extra) => {
        expect(normalizeCoords({ lat, lng, extra })).toEqual({ lat, lng });
      }),
      { numRuns: PBT_RUNS },
    );
  });

  // Validates: Requirements 13.2
  it('collapses any non-finite-pair input to { lat: null, lng: null }', () => {
    fc.assert(
      fc.property(invalidCoordInput, (input) => {
        // Guard: by construction these are never finite pairs, but assert it.
        fc.pre(!isFinitePair(input));
        expect(normalizeCoords(input)).toEqual({ lat: null, lng: null });
      }),
      { numRuns: PBT_RUNS },
    );
  });

  // Example-based anchors.
  it('matches known example values', () => {
    expect(normalizeCoords({ lat: 28.6139, lng: 77.209 })).toEqual({
      lat: 28.6139,
      lng: 77.209,
    });
    expect(normalizeCoords({ lat: 0, lng: 0 })).toEqual({ lat: 0, lng: 0 });
    expect(normalizeCoords({ lat: 1 })).toEqual({ lat: null, lng: null });
    expect(normalizeCoords({ lng: 2 })).toEqual({ lat: null, lng: null });
    expect(normalizeCoords({ lat: '1', lng: '2' })).toEqual({ lat: null, lng: null });
    expect(normalizeCoords({ lat: NaN, lng: 2 })).toEqual({ lat: null, lng: null });
    expect(normalizeCoords({ lat: Infinity, lng: 2 })).toEqual({ lat: null, lng: null });
    expect(normalizeCoords(null)).toEqual({ lat: null, lng: null });
    expect(normalizeCoords(undefined)).toEqual({ lat: null, lng: null });
    expect(normalizeCoords('not-an-object')).toEqual({ lat: null, lng: null });
    expect(normalizeCoords(42)).toEqual({ lat: null, lng: null });
  });
});

// ---------------------------------------------------------------------------
// Property 6 — buildDirectionsUrl round-trip
// ---------------------------------------------------------------------------

// Real-world lat/lng ranges, finite, and with negative zero normalized away
// (String(-0) === '0', so -0 would not survive a textual round-trip; the
// generator avoids it so the equality check stays exact).
const noNegZero = (n) => (n === 0 ? 0 : n);
const validCoord = fc
  .record({
    lat: fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
    lng: fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
  })
  .map(({ lat, lng }) => ({ lat: noNegZero(lat), lng: noNegZero(lng) }));

describe('buildDirectionsUrl (Property 6 — deep-link round-trip)', () => {
  // Validates: Requirements 12.2
  it('produces a URL that parses back to the same origin/destination with driving mode', () => {
    fc.assert(
      fc.property(validCoord, validCoord, (source, destination) => {
        const url = buildDirectionsUrl(source, destination);
        const parsed = new URL(url);

        // Driving mode is always specified.
        expect(parsed.searchParams.get('travelmode')).toBe('driving');

        // origin and destination are present as "lat,lng".
        const origin = parsed.searchParams.get('origin');
        const dest = parsed.searchParams.get('destination');
        expect(origin).not.toBeNull();
        expect(dest).not.toBeNull();

        const [oLat, oLng] = origin.split(',').map(Number);
        const [dLat, dLng] = dest.split(',').map(Number);

        expect(oLat).toBe(source.lat);
        expect(oLng).toBe(source.lng);
        expect(dLat).toBe(destination.lat);
        expect(dLng).toBe(destination.lng);
      }),
      { numRuns: PBT_RUNS },
    );
  });

  // Validates: Requirements 12.2
  it('always targets the documented Google Maps directions endpoint', () => {
    fc.assert(
      fc.property(validCoord, validCoord, (source, destination) => {
        const parsed = new URL(buildDirectionsUrl(source, destination));
        expect(parsed.origin).toBe('https://www.google.com');
        expect(parsed.pathname).toBe('/maps/dir/');
        expect(parsed.searchParams.get('api')).toBe('1');
      }),
      { numRuns: PBT_RUNS },
    );
  });

  // Example-based anchors.
  it('matches a known example deep link', () => {
    const url = buildDirectionsUrl(
      { lat: 28.6139, lng: 77.209 },
      { lat: 28.5355, lng: 77.391 },
    );
    expect(url).toBe(
      'https://www.google.com/maps/dir/?api=1' +
        '&origin=28.6139,77.209' +
        '&destination=28.5355,77.391' +
        '&travelmode=driving',
    );

    const parsed = new URL(url);
    expect(parsed.searchParams.get('origin')).toBe('28.6139,77.209');
    expect(parsed.searchParams.get('destination')).toBe('28.5355,77.391');
    expect(parsed.searchParams.get('travelmode')).toBe('driving');
  });

  // Example-based anchor: null coordinates (from normalizeCoords) still produce
  // a parseable URL with the literal "null" values.
  it('renders null coordinate fields without throwing', () => {
    const url = buildDirectionsUrl(null, undefined);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('origin')).toBe('null,null');
    expect(parsed.searchParams.get('destination')).toBe('null,null');
    expect(parsed.searchParams.get('travelmode')).toBe('driving');
  });
});
