// Component tests for OpenInMapsButton (Task 7.2).
//
// OpenInMapsButton is the Navigation_Service control. It is intentionally
// dependency-free of the Google Maps SDK: it only needs both coordinate pairs
// and the pure `buildDirectionsUrl` helper from mapUtils, so these tests do not
// install a `window.google` mock.
//
// Behavior under test:
//   - Req 12.1: the button is rendered only when BOTH source and destination
//     coordinates are present, with the label "Open in Google Maps".
//   - Reqs 12.2, 12.3: clicking the button builds the directions URL from both
//     coordinate pairs and opens it in a new browser context (`_blank`,
//     `noopener`).
//
// user-event is not a dependency in this project, so interactions use fireEvent.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import OpenInMapsButton from './OpenInMapsButton.jsx';
import { buildDirectionsUrl } from '../../utils/mapUtils';

const SOURCE = { lat: 28.61, lng: 77.2 };
const DESTINATION = { lat: 28.53, lng: 77.39 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OpenInMapsButton', () => {
  // ---- Req 12.1: hidden when either coordinate pair is missing ----
  it('renders nothing when the source coordinates are missing (Req 12.1)', () => {
    render(
      <OpenInMapsButton sourceCoords={null} destinationCoords={DESTINATION} />
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Open in Google Maps')).not.toBeInTheDocument();
  });

  it('renders nothing when the destination coordinates are missing (Req 12.1)', () => {
    render(<OpenInMapsButton sourceCoords={SOURCE} destinationCoords={null} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Open in Google Maps')).not.toBeInTheDocument();
  });

  it('renders nothing when both coordinate pairs are missing (Req 12.1)', () => {
    render(<OpenInMapsButton sourceCoords={null} destinationCoords={null} />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  // ---- Req 12.1: visible with the correct label when both are present ----
  it('renders a button labeled "Open in Google Maps" when both coordinate pairs are present (Req 12.1)', () => {
    render(
      <OpenInMapsButton sourceCoords={SOURCE} destinationCoords={DESTINATION} />
    );

    const button = screen.getByRole('button', { name: /open in google maps/i });
    expect(button).toBeInTheDocument();
  });

  // ---- Reqs 12.2, 12.3: click opens the generated URL in a new context ----
  it('opens the generated directions URL in a new browser context on click (Reqs 12.2, 12.3)', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <OpenInMapsButton sourceCoords={SOURCE} destinationCoords={DESTINATION} />
    );

    fireEvent.click(screen.getByRole('button', { name: /open in google maps/i }));

    // Opened exactly once.
    expect(openSpy).toHaveBeenCalledTimes(1);

    // Req 12.2 — the URL is built from both coordinate pairs via the shared,
    // documented helper. Assert the exact arguments: url, '_blank', 'noopener'.
    const expectedUrl = buildDirectionsUrl(SOURCE, DESTINATION);
    expect(openSpy).toHaveBeenCalledWith(expectedUrl, '_blank', 'noopener');

    // The URL contains both coordinate pairs and the driving travel mode.
    const calledUrl = openSpy.mock.calls[0][0];
    expect(calledUrl).toContain('28.61,77.2');
    expect(calledUrl).toContain('28.53,77.39');
    expect(calledUrl).toContain('travelmode=driving');

    // Parse the URL and assert the origin/destination params round-trip the
    // coordinates (Reqs 12.2, 12.3).
    const parsed = new URL(calledUrl);
    expect(parsed.searchParams.get('origin')).toBe('28.61,77.2');
    expect(parsed.searchParams.get('destination')).toBe('28.53,77.39');
    expect(parsed.searchParams.get('travelmode')).toBe('driving');
  });
});
