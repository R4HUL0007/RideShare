// Vitest global test setup for the frontend.
//
// 1. Registers @testing-library/jest-dom matchers (toBeInTheDocument, etc.).
// 2. Cleans up the React Testing Library DOM between tests.
// 3. Exposes a reusable `window.google` mock factory so individual tests can
//    drive the Google Maps SDK surfaces our components touch
//    (AutocompleteService, Geocoder, DirectionsService, geometry.encoding,
//    LatLng/LatLngBounds, SymbolPath, and the TravelMode/TrafficModel enums).
//
// The factory accepts per-test overrides so a single test can, for example,
// return a specific set of predictions, a ZERO_RESULTS directions status, or a
// custom reverse-geocode address without rebuilding the whole mock.

import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Lightweight value objects mirroring the Google Maps SDK shapes.
// ---------------------------------------------------------------------------

class MockLatLng {
  constructor(lat, lng) {
    this._lat = lat;
    this._lng = lng;
  }
  lat() {
    return this._lat;
  }
  lng() {
    return this._lng;
  }
  toJSON() {
    return { lat: this._lat, lng: this._lng };
  }
}

class MockLatLngBounds {
  constructor() {
    this.points = [];
  }
  extend(point) {
    this.points.push(point);
    return this;
  }
  getCenter() {
    const toLat = (p) => (typeof p.lat === 'function' ? p.lat() : p.lat);
    const toLng = (p) => (typeof p.lng === 'function' ? p.lng() : p.lng);
    const count = this.points.length || 1;
    const lat = this.points.reduce((sum, p) => sum + toLat(p), 0) / count;
    const lng = this.points.reduce((sum, p) => sum + toLng(p), 0) / count;
    return new MockLatLng(lat, lng);
  }
}

// ---------------------------------------------------------------------------
// Default responses. Tests can override any of these via createGoogleMapsMock.
// ---------------------------------------------------------------------------

const DEFAULTS = {
  // Array of place predictions returned by AutocompleteService.getPlacePredictions.
  predictions: [],
  // Results array returned by Geocoder.geocode for a placeId lookup.
  geocodeResults: [
    {
      formatted_address: 'Mock Place, India',
      geometry: { location: new MockLatLng(28.6139, 77.209) },
      address_components: [{ long_name: 'Mock Place' }],
    },
  ],
  // Results array returned by Geocoder.geocode for a reverse (location) lookup.
  reverseGeocodeResults: [
    {
      formatted_address: 'Mock Reverse Address, India',
      address_components: [{ long_name: 'Mock Reverse Address' }],
    },
  ],
  // Directions response + status returned by DirectionsService.route.
  directionsStatus: 'OK',
  directionsResult: {
    routes: [
      {
        overview_polyline: { points: 'mock_encoded_polyline' },
        overview_path: [new MockLatLng(28.6139, 77.209), new MockLatLng(28.5355, 77.391)],
        legs: [
          {
            distance: { text: '12.3 km', value: 12300 },
            duration: { text: '25 mins', value: 1500 },
          },
        ],
      },
    ],
  },
  // Points returned by geometry.encoding.decodePath.
  decodedPath: [new MockLatLng(28.6139, 77.209), new MockLatLng(28.5355, 77.391)],
};

/**
 * Build a `window.google`-shaped mock.
 *
 * @param {Partial<typeof DEFAULTS>} overrides
 *   Per-test response overrides. Any field may also be supplied as a function;
 *   for callback-driven APIs the function receives the request and should
 *   return the value to hand back (e.g. `predictions: (req) => [...]`).
 * @returns the mock `google` namespace object.
 */
export function createGoogleMapsMock(overrides = {}) {
  const config = { ...DEFAULTS, ...overrides };

  const resolve = (value, ...args) =>
    typeof value === 'function' ? value(...args) : value;

  const AutocompleteService = vi.fn(function AutocompleteService() {
    this.getPlacePredictions = vi.fn((request, callback) => {
      const predictions = resolve(config.predictions, request);
      if (typeof callback === 'function') callback(predictions, config.placesServiceStatus ?? 'OK');
      return Promise.resolve({ predictions });
    });
  });

  const AutocompleteSessionToken = vi.fn(function AutocompleteSessionToken() {
    this.token = Symbol('session-token');
  });

  const Geocoder = vi.fn(function Geocoder() {
    this.geocode = vi.fn((request, callback) => {
      // A `location` request is a reverse geocode; a `placeId`/`address`
      // request is a forward geocode.
      const isReverse = request && request.location !== undefined;
      const results = isReverse
        ? resolve(config.reverseGeocodeResults, request)
        : resolve(config.geocodeResults, request);
      const status = config.geocoderStatus ?? 'OK';
      if (typeof callback === 'function') callback(results, status);
      return Promise.resolve({ results });
    });
  });

  const DirectionsService = vi.fn(function DirectionsService() {
    this.route = vi.fn((request, callback) => {
      const status = resolve(config.directionsStatus, request);
      const result = resolve(config.directionsResult, request);
      // Support both the callback form (RoutePreview / LiveRideMap) and the
      // promise form (RideMapPreview uses `await ...route({...})`).
      if (typeof callback === 'function') {
        callback(result, status);
        return undefined;
      }
      if (status === 'OK') return Promise.resolve(result);
      return Promise.reject(new Error(status));
    });
  });

  return {
    maps: {
      places: {
        AutocompleteService,
        AutocompleteSessionToken,
      },
      Geocoder,
      DirectionsService,
      DirectionsStatus: {
        OK: 'OK',
        ZERO_RESULTS: 'ZERO_RESULTS',
        NOT_FOUND: 'NOT_FOUND',
        INVALID_REQUEST: 'INVALID_REQUEST',
        OVER_QUERY_LIMIT: 'OVER_QUERY_LIMIT',
        REQUEST_DENIED: 'REQUEST_DENIED',
        UNKNOWN_ERROR: 'UNKNOWN_ERROR',
      },
      TravelMode: {
        DRIVING: 'DRIVING',
        WALKING: 'WALKING',
        BICYCLING: 'BICYCLING',
        TRANSIT: 'TRANSIT',
      },
      TrafficModel: {
        BEST_GUESS: 'bestguess',
        OPTIMISTIC: 'optimistic',
        PESSIMISTIC: 'pessimistic',
      },
      LatLng: MockLatLng,
      LatLngBounds: MockLatLngBounds,
      geometry: {
        encoding: {
          decodePath: vi.fn((encoded) => resolve(config.decodedPath, encoded)),
        },
      },
      SymbolPath: {
        CIRCLE: 0,
        FORWARD_CLOSED_ARROW: 1,
        FORWARD_OPEN_ARROW: 2,
        BACKWARD_CLOSED_ARROW: 3,
        BACKWARD_OPEN_ARROW: 4,
      },
    },
  };
}

/**
 * Install a Google Maps mock onto `window.google`.
 *
 * @param {Partial<typeof DEFAULTS>} overrides per-test response overrides.
 * @returns the installed mock `google` namespace object.
 */
export function installGoogleMapsMock(overrides = {}) {
  const mock = createGoogleMapsMock(overrides);
  window.google = mock;
  return mock;
}

/** Remove any installed Google Maps mock from `window`. */
export function clearGoogleMapsMock() {
  delete window.google;
}

/**
 * Reset the Google Maps mock between tests.
 *
 * Removes any installed `window.google` mock and clears Vitest mock state so a
 * subsequent `installGoogleMapsMock()` starts from a clean slate. This is the
 * canonical teardown helper component tests should import alongside
 * `installGoogleMapsMock()`.
 */
export function resetGoogleMapsMock() {
  clearGoogleMapsMock();
  vi.clearAllMocks();
}

// Expose the value objects for tests that need to construct SDK-shaped values.
export { MockLatLng, MockLatLngBounds };

// Clean up the DOM and any installed map mock between tests.
afterEach(() => {
  cleanup();
  clearGoogleMapsMock();
});
