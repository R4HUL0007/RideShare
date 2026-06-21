// Smoke test for the shared test infrastructure (Task 1.1).
// Verifies jest-dom matchers are registered and the window.google mock
// factory exposes every SDK surface the map components rely on, including
// per-test override support.

import { describe, it, expect } from 'vitest';
import {
  createGoogleMapsMock,
  installGoogleMapsMock,
  clearGoogleMapsMock,
  MockLatLng,
} from './setup.js';

describe('test infrastructure', () => {
  it('registers jest-dom matchers', () => {
    const el = document.createElement('div');
    el.textContent = 'hello';
    document.body.appendChild(el);
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent('hello');
  });

  it('builds a google mock covering the SDK surfaces components use', () => {
    const google = createGoogleMapsMock();

    expect(google.maps.places.AutocompleteService).toBeTypeOf('function');
    expect(google.maps.places.AutocompleteSessionToken).toBeTypeOf('function');
    expect(google.maps.Geocoder).toBeTypeOf('function');
    expect(google.maps.DirectionsService).toBeTypeOf('function');
    expect(google.maps.DirectionsStatus.OK).toBe('OK');
    expect(google.maps.DirectionsStatus.ZERO_RESULTS).toBe('ZERO_RESULTS');
    expect(google.maps.TravelMode.DRIVING).toBe('DRIVING');
    expect(google.maps.TrafficModel.BEST_GUESS).toBe('bestguess');
    expect(google.maps.LatLng).toBe(MockLatLng);
    expect(google.maps.LatLngBounds).toBeTypeOf('function');
    expect(google.maps.geometry.encoding.decodePath).toBeTypeOf('function');
    expect(google.maps.SymbolPath.CIRCLE).toBe(0);
  });

  it('drives AutocompleteService predictions via callback', () => {
    const predictions = [{ place_id: 'abc', description: 'Test Place' }];
    const google = createGoogleMapsMock({ predictions });

    const service = new google.maps.places.AutocompleteService();
    const received = [];
    service.getPlacePredictions(
      { input: 'test', componentRestrictions: { country: 'in' } },
      (result) => received.push(...result)
    );
    expect(received).toEqual(predictions);
  });

  it('drives DirectionsService status via override (callback form)', () => {
    const google = createGoogleMapsMock({ directionsStatus: 'ZERO_RESULTS' });
    const service = new google.maps.DirectionsService();
    let status;
    service.route({}, (_result, s) => {
      status = s;
    });
    expect(status).toBe('ZERO_RESULTS');
  });

  it('reverse-geocodes a location request with an overridable address', () => {
    const google = createGoogleMapsMock({
      reverseGeocodeResults: [{ formatted_address: 'Dropped Pin, India' }],
    });
    const geocoder = new google.maps.Geocoder();
    let address;
    geocoder.geocode({ location: { lat: 1, lng: 2 } }, (results) => {
      address = results[0].formatted_address;
    });
    expect(address).toBe('Dropped Pin, India');
  });

  it('installs and clears the mock on window.google', () => {
    installGoogleMapsMock();
    expect(window.google).toBeDefined();
    clearGoogleMapsMock();
    expect(window.google).toBeUndefined();
  });
});
