// Component tests for LiveRideMap (Task 6.3).
//
// LiveRideMap consumes `useMaps()` to gate on `isLoaded`/`loadError`, then
// renders an interactive @react-google-maps/api map with source/destination
// markers, a driving-route polyline (built via DirectionsService +
// geometry.encoding.decodePath), and fits the viewport to the route. Dragging a
// marker emits updated coordinates and a reverse-geocoded address.
//
// Three things are controlled here:
//   1. `@react-google-maps/api` is mocked with lightweight test doubles. The
//      real GoogleMap/Marker/Polyline require a live SDK and a DOM map that
//      jsdom cannot provide, so the doubles instead let us:
//        - detect a rendered Polyline (confirms routeInfo.polyline was set),
//        - capture every Marker's props (draggable/onDragEnd/title) so a test
//          can invoke onDragEnd directly,
//        - expose a `fitBounds` spy through the GoogleMap ref and fire `onLoad`
//          (which clears the component's internal loading flag).
//   2. `./MapsProvider` is mocked so `useMaps` returns a healthy, loaded SDK by
//      default; individual tests override it for the loading/error branches.
//   3. `window.google` is installed per-test via `installGoogleMapsMock`, which
//      backs the DirectionsService/Geocoder/geometry/LatLng/LatLngBounds the
//      component constructs directly.
//
// Covers Requirements 6.3, 6.4, 6.5, 7.1, 7.2, 7.3.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

import LiveRideMap from './LiveRideMap.jsx';
import { useMaps } from './MapsProvider';
import { installGoogleMapsMock, resetGoogleMapsMock } from '../../test/setup.js';

// ---------------------------------------------------------------------------
// Mock @react-google-maps/api with test doubles.
//   - GoogleMap: forwards a ref whose `fitBounds` is a shared spy, and fires
//     `onLoad` once mounted so the component clears `isMapLoading`.
//   - Marker: records its props (per render) so a test can find a marker by
//     title and invoke its onDragEnd handler.
//   - Polyline: a detectable, prop-free test double.
// ---------------------------------------------------------------------------
vi.mock('@react-google-maps/api', async () => {
  const React = await import('react');
  return {
    GoogleMap: React.forwardRef(function GoogleMap({ children, onLoad }, ref) {
      // Expose the shared fitBounds spy through the ref so the component's
      // fitBounds effect (mapRef.current.fitBounds) can invoke it.
      React.useImperativeHandle(ref, () => ({ fitBounds: globalThis.__fitBoundsSpy }));
      React.useEffect(() => {
        if (onLoad) onLoad();
      }, []);
      return React.createElement('div', { 'data-testid': 'google-map' }, children);
    }),
    Marker: (props) => {
      (globalThis.__markers ||= []).push(props);
      return React.createElement('div', { 'data-testid': 'marker', title: props.title });
    },
    Polyline: () => React.createElement('div', { 'data-testid': 'polyline' }),
  };
});

// `useMaps` is read on every render to gate map rendering on a loaded SDK.
// Default path is "SDK loaded successfully".
vi.mock('./MapsProvider', () => ({
  useMaps: vi.fn(() => ({ isLoaded: true, loadError: null, hasKey: true })),
}));

const HEALTHY_MAPS = { isLoaded: true, loadError: null, hasKey: true };

const SOURCE = { lat: 28.61, lng: 77.2 };
const DESTINATION = { lat: 28.53, lng: 77.39 };

// A successful directions response with a non-empty overview polyline and legs.
// Combined with the default non-empty `decodedPath`, this drives the component
// to set routeInfo (and therefore render a Polyline).
const OK_DIRECTIONS = {
  routes: [
    {
      overview_polyline: { points: 'mock_encoded_polyline' },
      legs: [
        {
          distance: { text: '12.3 km', value: 12300 },
          duration: { text: '25 mins', value: 1500 },
        },
      ],
    },
  ],
};

/** Return the most recently rendered Marker whose `title` matches. */
function latestMarkerByTitle(title) {
  const matches = (globalThis.__markers || []).filter((m) => m.title === title);
  return matches[matches.length - 1];
}

beforeEach(() => {
  globalThis.__markers = [];
  globalThis.__fitBoundsSpy = vi.fn();
  useMaps.mockReturnValue(HEALTHY_MAPS);
});

afterEach(() => {
  resetGoogleMapsMock();
  globalThis.__markers = [];
  delete globalThis.__fitBoundsSpy;
});

describe('LiveRideMap', () => {
  it('renders a route polyline and fits bounds when both coordinates are present (Reqs 6.3, 6.4)', async () => {
    installGoogleMapsMock({ directionsStatus: 'OK', directionsResult: OK_DIRECTIONS });

    render(
      <LiveRideMap
        sourceCoords={SOURCE}
        destinationCoords={DESTINATION}
        source="Source"
        destination="Destination"
      />
    );

    // The DirectionsService callback fires synchronously; the decoded path is
    // non-empty, so routeInfo.polyline is set and Polyline doubles render
    // (glow + core layers).
    const polylines = await screen.findAllByTestId('polyline');
    expect(polylines.length).toBeGreaterThanOrEqual(1);

    // fitBounds runs on a 100ms setTimeout inside an effect (Req 6.4).
    await waitFor(() => expect(globalThis.__fitBoundsSpy).toHaveBeenCalled(), {
      timeout: 500,
    });
  });

  it('emits updated coordinates and a reverse-geocoded address when the source marker is dragged (Reqs 7.1, 7.3)', async () => {
    installGoogleMapsMock({
      directionsStatus: 'OK',
      directionsResult: OK_DIRECTIONS,
      reverseGeocodeResults: [{ formatted_address: 'Dropped Pin, India' }],
    });

    const onSourceCoordsChange = vi.fn();
    const onSourceAddressChange = vi.fn();
    const onDestinationCoordsChange = vi.fn();
    const onDestinationAddressChange = vi.fn();

    render(
      <LiveRideMap
        sourceCoords={SOURCE}
        destinationCoords={DESTINATION}
        source="Source"
        destination="Destination"
        onSourceCoordsChange={onSourceCoordsChange}
        onSourceAddressChange={onSourceAddressChange}
        onDestinationCoordsChange={onDestinationCoordsChange}
        onDestinationAddressChange={onDestinationAddressChange}
      />
    );

    const sourceMarker = latestMarkerByTitle('Source');
    expect(sourceMarker).toBeTruthy();
    expect(sourceMarker.draggable).toBe(true);

    // Simulate the user finishing a drag of the source pin.
    act(() => {
      sourceMarker.onDragEnd({ latLng: { lat: () => 1.5, lng: () => 2.5 } });
    });

    // Updated coordinates emitted (Req 7.1) and reverse-geocoded address (Req 7.3).
    expect(onSourceCoordsChange).toHaveBeenCalledWith({ lat: 1.5, lng: 2.5 });
    expect(onSourceAddressChange).toHaveBeenCalledWith('Dropped Pin, India');
  });

  it('emits updated coordinates and a reverse-geocoded address when the destination marker is dragged (Reqs 7.2, 7.3)', async () => {
    installGoogleMapsMock({
      directionsStatus: 'OK',
      directionsResult: OK_DIRECTIONS,
      reverseGeocodeResults: [{ formatted_address: 'Dropped Pin, India' }],
    });

    const onSourceCoordsChange = vi.fn();
    const onSourceAddressChange = vi.fn();
    const onDestinationCoordsChange = vi.fn();
    const onDestinationAddressChange = vi.fn();

    render(
      <LiveRideMap
        sourceCoords={SOURCE}
        destinationCoords={DESTINATION}
        source="Source"
        destination="Destination"
        onSourceCoordsChange={onSourceCoordsChange}
        onSourceAddressChange={onSourceAddressChange}
        onDestinationCoordsChange={onDestinationCoordsChange}
        onDestinationAddressChange={onDestinationAddressChange}
      />
    );

    const destinationMarker = latestMarkerByTitle('Destination');
    expect(destinationMarker).toBeTruthy();
    expect(destinationMarker.draggable).toBe(true);

    act(() => {
      destinationMarker.onDragEnd({ latLng: { lat: () => 9.9, lng: () => 8.8 } });
    });

    // Updated coordinates emitted (Req 7.2) and reverse-geocoded address (Req 7.3).
    expect(onDestinationCoordsChange).toHaveBeenCalledWith({ lat: 9.9, lng: 8.8 });
    expect(onDestinationAddressChange).toHaveBeenCalledWith('Dropped Pin, India');
  });

  it('shows the placeholder prompting location selection when neither coordinate is present (Req 6.5)', async () => {
    installGoogleMapsMock();

    render(<LiveRideMap sourceCoords={null} destinationCoords={null} />);

    // The placeholder is gated on `!isMapLoading`; the GoogleMap double fires
    // onLoad on mount, clearing the loading flag. findBy lets that effect flush.
    expect(
      await screen.findByText('Select pickup and drop locations')
    ).toBeInTheDocument();
  });

  it('shows a loading indicator and no map while the SDK is still loading (Reqs 1.3)', () => {
    useMaps.mockReturnValue({ isLoaded: false, loadError: null, hasKey: true });
    installGoogleMapsMock();

    render(<LiveRideMap sourceCoords={SOURCE} destinationCoords={DESTINATION} />);

    expect(screen.getByText(/Loading map/)).toBeInTheDocument();
    expect(screen.queryByTestId('google-map')).not.toBeInTheDocument();
  });

  it('shows an error box when the SDK fails to load (Req 2.2 supporting)', () => {
    useMaps.mockReturnValue({ isLoaded: false, loadError: new Error('fail'), hasKey: true });
    installGoogleMapsMock();

    render(<LiveRideMap sourceCoords={SOURCE} destinationCoords={DESTINATION} />);

    expect(screen.getByText('Map could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByTestId('google-map')).not.toBeInTheDocument();
  });
});
