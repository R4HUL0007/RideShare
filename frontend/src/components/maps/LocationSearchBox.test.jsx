// Component tests for LocationSearchBox (Task 4.4).
//
// LocationSearchBox is a controlled component: it receives `value` + `onChange`
// (and `onCoordinatesChange`). We render it through a small stateful Harness so
// that typing actually updates the `value` prop, mirroring real usage.
//
// Two things are mocked:
//   1. `useMaps` from './MapsProvider' — drives the `loadError` branch (Req 2.2).
//      Default return is a healthy { isLoaded:true, loadError:null, hasKey:true }.
//   2. `window.google` — installed per-test via installGoogleMapsMock so we can
//      control predictions (AutocompleteService) and geocode results (Geocoder),
//      and inspect the AutocompleteService / AutocompleteSessionToken mocks.
//
// The 300ms debounce is driven with fake timers (vi.advanceTimersByTimeAsync)
// wrapped in act(), which is deterministic because the mock's getPlacePredictions
// and geocode callbacks resolve synchronously. user-event is not a dependency in
// this project, so fireEvent is used for all interactions.
//
// Covers Requirements 2.2, 3.1, 3.2, 3.5, 3.6, 4.2, 4.3, 4.4, 5.2.

import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import LocationSearchBox from './LocationSearchBox.jsx';
import { useMaps } from './MapsProvider';
import {
  installGoogleMapsMock,
  resetGoogleMapsMock,
  MockLatLng,
} from '../../test/setup.js';

// `useMaps` is read on every render to decide whether to show the load-failure
// UI. Mock it so the default path is "SDK loaded successfully".
vi.mock('./MapsProvider', () => ({
  useMaps: vi.fn(() => ({ isLoaded: true, loadError: null, hasKey: true })),
}));

const HEALTHY_MAPS = { isLoaded: true, loadError: null, hasKey: true };

/**
 * Stateful wrapper so that `onChange` updates the controlled `value` prop the
 * same way a real parent form would. Test spies are invoked in addition to the
 * internal state update so assertions can observe emitted values.
 */
function Harness({
  onChangeSpy,
  onCoordsSpy,
  initialValue = '',
  label = 'Pickup',
  placeholder = 'Enter location',
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <LocationSearchBox
      label={label}
      placeholder={placeholder}
      value={value}
      onChange={(v) => {
        setValue(v);
        if (onChangeSpy) onChangeSpy(v);
      }}
      onCoordinatesChange={onCoordsSpy}
    />
  );
}

/** Advance fake timers by `ms`, flushing React state updates inside act(). */
async function advance(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  useMaps.mockReturnValue(HEALTHY_MAPS);
});

afterEach(() => {
  // Clear any pending debounce/blur timers before restoring real timers.
  vi.clearAllTimers();
  vi.useRealTimers();
  resetGoogleMapsMock();
});

describe('LocationSearchBox', () => {
  it('debounces 300ms and sends country:"in" + session token on the request (Reqs 3.1, 3.2, 5.2)', async () => {
    const google = installGoogleMapsMock(); // default predictions: []
    render(<Harness />);

    const input = screen.getByPlaceholderText('Enter location');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Main' } });

    // No request should fire before the 300ms quiet window elapses.
    expect(google.maps.places.AutocompleteService).not.toHaveBeenCalled();
    await advance(299);
    expect(google.maps.places.AutocompleteService).not.toHaveBeenCalled();

    // Exactly one request fires once the debounce window closes.
    await advance(1);
    expect(google.maps.places.AutocompleteService).toHaveBeenCalledTimes(1);

    const service = google.maps.places.AutocompleteService.mock.instances[0];
    expect(service.getPlacePredictions).toHaveBeenCalledTimes(1);

    const request = service.getPlacePredictions.mock.calls[0][0];
    expect(request.input).toBe('Main');
    expect(request.componentRestrictions).toEqual({ country: 'in' });
    // A session token (created on mount) must be attached to the request.
    expect(request.sessionToken).toBeTruthy();
  });

  it('renders predictions, and selecting one emits coords and issues a new session token (Reqs 4.2, 4.4)', async () => {
    const google = installGoogleMapsMock({
      predictions: [
        {
          place_id: 'p1',
          structured_formatting: { main_text: 'Main St', secondary_text: 'City' },
          description: 'Main St, City',
        },
      ],
      geocodeResults: [{ geometry: { location: new MockLatLng(12.34, 56.78) } }],
    });

    const onChangeSpy = vi.fn();
    const onCoordsSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} onCoordsSpy={onCoordsSpy} />);

    const input = screen.getByPlaceholderText('Enter location');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Main' } });
    await advance(300);

    // Prediction is shown with its primary text (Req 3.3 supporting context).
    const suggestion = screen.getByText('Main St');
    expect(suggestion).toBeInTheDocument();
    expect(screen.getByText('City')).toBeInTheDocument();

    // Session tokens created so far (one on mount). Selecting must add a fresh one.
    const tokensBefore =
      google.maps.places.AutocompleteSessionToken.mock.calls.length;

    fireEvent.click(suggestion.closest('button'));

    // Field value set to the place name (Req 4.1 supporting context) and
    // coordinates emitted from the geocode geometry (Req 4.2).
    expect(onChangeSpy).toHaveBeenCalledWith('Main St');
    expect(onCoordsSpy).toHaveBeenCalledWith({ lat: 12.34, lng: 56.78 });

    // A new session token was issued for the next autocomplete sequence (Req 4.4).
    expect(google.maps.places.AutocompleteSessionToken.mock.calls.length).toBe(
      tokensBefore + 1
    );
  });

  it('shows "No locations found" when a non-empty input returns zero predictions (Req 3.5)', async () => {
    installGoogleMapsMock({ predictions: [] });
    render(<Harness />);

    const input = screen.getByPlaceholderText('Enter location');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzzzzz' } });
    await advance(300);

    expect(screen.getByText('No locations found')).toBeInTheDocument();
  });

  it('clears coordinates and value when the clear button is clicked (Req 3.6)', async () => {
    installGoogleMapsMock();
    const onChangeSpy = vi.fn();
    const onCoordsSpy = vi.fn();
    render(
      <Harness
        onChangeSpy={onChangeSpy}
        onCoordsSpy={onCoordsSpy}
        initialValue="Somewhere"
      />
    );

    // With a value present and no in-flight request, the clear button is shown.
    const clearButton = screen.getByLabelText('Clear location');
    fireEvent.click(clearButton);

    expect(onCoordsSpy).toHaveBeenCalledWith(null);
    expect(onChangeSpy).toHaveBeenCalledWith('');
  });

  it('shows "Location service unavailable" and disables the input on SDK load failure (Req 2.2)', () => {
    useMaps.mockReturnValue({
      isLoaded: false,
      loadError: new Error('fail'),
      hasKey: true,
    });
    installGoogleMapsMock();
    render(<Harness initialValue="Anything" />);

    expect(screen.getByText('Location service unavailable')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter location')).toBeDisabled();
  });

  it('shows the invalid-location message and emits no coords when a selection has no geometry (Req 4.3)', async () => {
    installGoogleMapsMock({
      predictions: [{ place_id: 'p1', description: 'X' }],
      geocodeResults: [{}], // no geometry/location
    });

    const onCoordsSpy = vi.fn();
    render(<Harness onCoordsSpy={onCoordsSpy} />);

    const input = screen.getByPlaceholderText('Enter location');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'X' } });
    await advance(300);

    fireEvent.click(screen.getByText('X').closest('button'));

    expect(
      screen.getByText('Please select a valid location from the dropdown')
    ).toBeInTheDocument();
    expect(onCoordsSpy).not.toHaveBeenCalled();
  });
});
