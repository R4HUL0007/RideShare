// Component tests for RoutePreview (Task 5.2).
//
// RoutePreview consumes `useMaps()` to gate on `isLoaded`, then drives the
// Google Maps DirectionsService to fetch a driving route and renders the
// distance, estimated time, and estimated fare (via shared mapUtils).
//
// Two things are controlled here:
//   1. `useMaps` from './MapsProvider' is mocked so `isLoaded` is always true,
//      isolating these tests from the real SDK loader.
//   2. `window.google` is installed per-test via `installGoogleMapsMock`, whose
//      DirectionsService.route mock invokes the (result, status) callback
//      synchronously. Overrides let each test pick the directions status/result.
//
// user-event is not a dependency in this project, so no interactions are needed
// beyond rendering with props. Assertions that depend on the directions
// callback use findBy/waitFor to flush the resulting React state update.
//
// Covers Requirements 8.3, 10.1, 10.3, 11.1, 11.2 (and supporting 8.2, 9.2, 10.2).

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import RoutePreview from './RoutePreview.jsx';
import { useMaps } from './MapsProvider';
import { installGoogleMapsMock, resetGoogleMapsMock } from '../../test/setup.js';

// `useMaps` is read on every render to gate route calculation on a loaded SDK.
// Mock it so the default path is "SDK loaded successfully".
vi.mock('./MapsProvider', () => ({
  useMaps: vi.fn(() => ({ isLoaded: true, loadError: null, hasKey: true })),
}));

const HEALTHY_MAPS = { isLoaded: true, loadError: null, hasKey: true };

// Coordinates fed to the component. The DirectionsService mock ignores them and
// returns whatever directionsResult/directionsStatus override is installed.
const SOURCE = { lat: 28.61, lng: 77.2 };
const DESTINATION = { lat: 28.53, lng: 77.39 };

// A successful directions response: 12.3 km / 25 mins.
//   formatDistanceKm(12300)      -> "12.3"
//   formatDurationMinutes(1500)  -> Math.ceil(1500/60) = 25
//   estimateFare(12.3)           -> Math.round(10 + 15*12.3) = Math.round(194.5) = 195
const OK_RESULT = {
  routes: [
    {
      legs: [
        {
          distance: { text: '12.3 km', value: 12300 },
          duration: { text: '25 mins', value: 1500 },
        },
      ],
    },
  ],
};

beforeEach(() => {
  useMaps.mockReturnValue(HEALTHY_MAPS);
});

afterEach(() => {
  resetGoogleMapsMock();
});

describe('RoutePreview', () => {
  it('renders distance, time, and fare together on an OK route (Reqs 10.1, 8.2, 9.2, 10.2)', async () => {
    installGoogleMapsMock({ directionsStatus: 'OK', directionsResult: OK_RESULT });

    render(<RoutePreview sourceCoords={SOURCE} destinationCoords={DESTINATION} />);

    // The route callback fires synchronously; wait for the resulting state to
    // render the distance value.
    expect(await screen.findByText('12.3')).toBeInTheDocument();

    // Distance (Req 8.2), estimated time (Req 9.2), and fare (Req 10.2) values.
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('₹195')).toBeInTheDocument();

    // All three summary labels are present together (Req 10.1).
    expect(screen.getByText('Distance')).toBeInTheDocument();
    expect(screen.getByText('Est. Time')).toBeInTheDocument();
    expect(screen.getByText('Est. Fare')).toBeInTheDocument();

    // No calculation error is shown on success.
    expect(screen.queryByText('Could not calculate route')).not.toBeInTheDocument();
  });

  it('shows no error on ZERO_RESULTS when there is no prior route (Req 11.2)', async () => {
    installGoogleMapsMock({ directionsStatus: 'ZERO_RESULTS', directionsResult: OK_RESULT });

    render(<RoutePreview sourceCoords={SOURCE} destinationCoords={DESTINATION} />);

    // ZERO_RESULTS must never surface the calculation-failure message; with no
    // prior state the component simply renders nothing.
    await waitFor(() => {
      expect(screen.queryByText('Could not calculate route')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('12.3')).not.toBeInTheDocument();
  });

  it('retains the previously displayed route and shows no error when a later request returns ZERO_RESULTS (Req 11.2)', async () => {
    // First, a successful route so distance/time/fare are displayed.
    installGoogleMapsMock({ directionsStatus: 'OK', directionsResult: OK_RESULT });

    const { rerender } = render(
      <RoutePreview sourceCoords={SOURCE} destinationCoords={DESTINATION} />
    );
    expect(await screen.findByText('12.3')).toBeInTheDocument();

    // Now a subsequent calculation (triggered by a changed destination) returns
    // ZERO_RESULTS. Swap the installed mock, then re-render with new coords so
    // the effect re-runs against the new DirectionsService.
    installGoogleMapsMock({ directionsStatus: 'ZERO_RESULTS', directionsResult: OK_RESULT });
    rerender(
      <RoutePreview sourceCoords={SOURCE} destinationCoords={{ lat: 28.54, lng: 77.4 }} />
    );

    // The previously displayed distance is retained and no error is shown.
    expect(screen.getByText('12.3')).toBeInTheDocument();
    expect(screen.queryByText('Could not calculate route')).not.toBeInTheDocument();
  });

  it('shows "Could not calculate route" on a non-ZERO_RESULTS failure (Req 11.1)', async () => {
    installGoogleMapsMock({ directionsStatus: 'REQUEST_DENIED', directionsResult: OK_RESULT });

    render(<RoutePreview sourceCoords={SOURCE} destinationCoords={DESTINATION} />);

    expect(await screen.findByText('Could not calculate route')).toBeInTheDocument();
  });

  it('shows the placeholder and issues no route request when coordinates are missing (Req 10.3)', () => {
    const google = installGoogleMapsMock({ directionsStatus: 'OK', directionsResult: OK_RESULT });

    // Source coordinates absent: the component must short-circuit to the
    // placeholder before constructing a DirectionsService.
    render(<RoutePreview sourceCoords={null} destinationCoords={DESTINATION} />);

    expect(screen.getByText('Distance info will appear here')).toBeInTheDocument();
    // No route request was made because a coordinate is missing.
    expect(google.maps.DirectionsService).not.toHaveBeenCalled();
    // Neither a route summary nor an error is shown.
    expect(screen.queryByText('Could not calculate route')).not.toBeInTheDocument();
    expect(screen.queryByText('Distance')).not.toBeInTheDocument();
  });

  it('shows a loading indicator while the route calculation is in progress (Req 8.3)', () => {
    // Install the base mock, then replace DirectionsService with one whose
    // route() never invokes its callback, so the component stays in isLoading.
    installGoogleMapsMock();
    window.google.maps.DirectionsService = function DirectionsService() {
      this.route = () => {};
    };

    render(<RoutePreview sourceCoords={SOURCE} destinationCoords={DESTINATION} />);

    expect(screen.getByText('Calculating route...')).toBeInTheDocument();
  });
});
