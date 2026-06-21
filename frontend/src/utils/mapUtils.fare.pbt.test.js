// Property-based tests for the pure fare / distance / duration formatting
// utilities in mapUtils.js.
//
// These exercise the Correctness Properties from the Interactive Maps &
// Navigation design document:
//   - Property 1 (Req 10.2): fare formula + monotonicity     -> estimateFare
//   - Property 3 (Req 8.2):  distance precision (one decimal) -> formatDistanceKm
//   - Property 2 (Req 9.2):  duration rounding (ceil minutes) -> formatDurationMinutes
//
// Generators are kept finite (noNaN, noDefaultInfinity, sane max) so the only
// inputs explored are the non-negative real-world domain the functions accept.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  estimateFare,
  formatDistanceKm,
  formatDurationMinutes,
} from './mapUtils.js';

// Number of generated cases per property. Kept low so the suite runs fast
// while still exercising a spread of inputs (fast-check default is 100).
const PBT_RUNS = 10;

// Non-negative, finite doubles bounded to a realistic magnitude. fast-check's
// double generator can otherwise emit NaN / Infinity / huge magnitudes which
// are outside the input space these utilities are specified for.
const nonNegativeDistanceKm = fc.double({
  min: 0,
  max: 1e6,
  noNaN: true,
  noDefaultInfinity: true,
});

const nonNegativeMeters = fc.double({
  min: 0,
  max: 1e6,
  noNaN: true,
  noDefaultInfinity: true,
});

const nonNegativeSeconds = fc.double({
  min: 0,
  max: 1e6,
  noNaN: true,
  noDefaultInfinity: true,
});

describe('estimateFare (Property 1 — fare formula and monotonicity)', () => {
  // Validates: Requirements 10.2
  it('equals Math.round(10 + 15 * distanceKm) for any distanceKm >= 0', () => {
    fc.assert(
      fc.property(nonNegativeDistanceKm, (distanceKm) => {
        expect(estimateFare(distanceKm)).toBe(Math.round(10 + 15 * distanceKm));
      }),
      { numRuns: PBT_RUNS },
    );
  });

  // Validates: Requirements 10.2
  it('is non-decreasing in distance (a <= b => fare(a) <= fare(b))', () => {
    fc.assert(
      fc.property(nonNegativeDistanceKm, nonNegativeDistanceKm, (x, y) => {
        const a = Math.min(x, y);
        const b = Math.max(x, y);
        expect(estimateFare(a)).toBeLessThanOrEqual(estimateFare(b));
      }),
      { numRuns: PBT_RUNS },
    );
  });

  // Example-based anchors.
  it('matches known example values', () => {
    expect(estimateFare(0)).toBe(10);
    expect(estimateFare(3.4)).toBe(61); // round(10 + 51) = 61
    expect(estimateFare(0.1)).toBe(12); // round(11.5) = 12
    expect(estimateFare(100)).toBe(1510);
  });
});

describe('formatDistanceKm (Property 3 — distance precision)', () => {
  // Validates: Requirements 8.2
  it('equals (meters / 1000).toFixed(1) for any meters >= 0', () => {
    fc.assert(
      fc.property(nonNegativeMeters, (meters) => {
        expect(formatDistanceKm(meters)).toBe((meters / 1000).toFixed(1));
      }),
      { numRuns: PBT_RUNS },
    );
  });

  // Validates: Requirements 8.2
  it('always produces a string with exactly one digit after the decimal point', () => {
    fc.assert(
      fc.property(nonNegativeMeters, (meters) => {
        expect(formatDistanceKm(meters)).toMatch(/^\d+\.\d$/);
      }),
      { numRuns: PBT_RUNS },
    );
  });

  // Example-based anchors.
  it('matches known example values', () => {
    expect(formatDistanceKm(0)).toBe('0.0');
    expect(formatDistanceKm(3450)).toBe('3.5'); // 3.45 km -> 3.5
    expect(formatDistanceKm(12300)).toBe('12.3');
    expect(formatDistanceKm(1000)).toBe('1.0');
  });
});

describe('formatDurationMinutes (Property 2 — duration rounding)', () => {
  // Validates: Requirements 9.2
  it('equals Math.ceil(seconds / 60) for any seconds >= 0', () => {
    fc.assert(
      fc.property(nonNegativeSeconds, (seconds) => {
        expect(formatDurationMinutes(seconds)).toBe(Math.ceil(seconds / 60));
      }),
      { numRuns: PBT_RUNS },
    );
  });

  // Validates: Requirements 9.2
  it('returns the smallest integer >= seconds / 60 (result - 1 < seconds/60 <= result)', () => {
    fc.assert(
      fc.property(nonNegativeSeconds, (seconds) => {
        const result = formatDurationMinutes(seconds);
        const exactMinutes = seconds / 60;
        // result is an integer.
        expect(Number.isInteger(result)).toBe(true);
        // result is an upper bound: seconds/60 <= result.
        expect(exactMinutes).toBeLessThanOrEqual(result);
        // result is the SMALLEST such integer: result - 1 < seconds/60.
        // For seconds === 0 this is -1 < 0, which holds.
        expect(result - 1).toBeLessThan(exactMinutes);
      }),
      { numRuns: PBT_RUNS },
    );
  });

  // Example-based anchors, including the minute boundaries.
  it('matches known example values', () => {
    expect(formatDurationMinutes(0)).toBe(0);
    expect(formatDurationMinutes(1)).toBe(1);
    expect(formatDurationMinutes(59)).toBe(1);
    expect(formatDurationMinutes(60)).toBe(1);
    expect(formatDurationMinutes(61)).toBe(2);
    expect(formatDurationMinutes(1500)).toBe(25);
  });
});
