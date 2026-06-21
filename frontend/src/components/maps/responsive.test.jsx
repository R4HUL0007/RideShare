// Responsive layout verification + lock-in (Task 9.1).
//
// This suite locks in the responsive presentation rules from Requirement 14
// (and design Property 10) across the three map surfaces:
//
//   - Req 14.1 / 14.2  RoutePreview summary boxes: single-column on mobile
//                      (<640px) and multi-column from the `sm` breakpoint
//                      (>=640px). Realized with Tailwind `flex-col sm:flex-row`.
//   - Req 14.3 / P10   LiveRideMap height = clamp(14rem, 35vw, 24rem) — i.e.
//                      bounded to [14rem, 24rem] — on every render branch.
//   - Req 14.4         LocationSearchBox prediction dropdown width equals the
//                      input's measured width (getBoundingClientRect().width).
//
// What jsdom CAN check vs. what it CANNOT:
//   * Tailwind class names are plain `className` string attributes, so the
//     RoutePreview `flex-col` / `sm:flex-row` rule is directly assertable from
//     the rendered DOM. The actual <640px vs >=640px breakpoint switch is a CSS
//     media-query concern that jsdom does not evaluate; presence of the classes
//     is the meaningful, non-brittle signal.
//   * The LiveRideMap clamp() height is applied as an *inline* style. jsdom's
//     CSS parser REJECTS `clamp()` as an invalid height value, so React's
//     assignment is dropped — `el.style.height` is "" and the serialized style
//     attribute omits height entirely. The clamp string therefore never appears
//     in the rendered DOM and cannot be asserted at runtime in jsdom. (Verified
//     empirically.) The same goes for the actual numeric height, which depends
//     on a real viewport jsdom does not lay out.
//   * The LocationSearchBox dropdown width is computed from
//     getBoundingClientRect(), which returns all-zero rects in jsdom (no
//     layout), so the measured width is not meaningfully assertable either.
//
// For the two rules jsdom cannot evaluate, this suite verifies them by
// deterministic source inspection (the realization is a literal in the
// component source), which is robust and non-brittle — it does not depend on
// layout, a media query, or the jsdom CSS parser. Visual breakpoint behavior is
// confirmed by code inspection and documented here.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import RoutePreview from './RoutePreview.jsx';
import LiveRideMap from './LiveRideMap.jsx';
import { useMaps } from './MapsProvider';
import { installGoogleMapsMock, resetGoogleMapsMock } from '../../test/setup.js';

// Raw component source for the rules that jsdom cannot evaluate at runtime
// (clamp() height is stripped by jsdom's CSS parser; getBoundingClientRect()
// returns zeroed rects with no layout engine). Vite's `?raw` suffix inlines the
// file's text, giving a deterministic, layout-independent lock-in.
import liveRideMapSource from './LiveRideMap.jsx?raw';
import locationSearchBoxSource from './LocationSearchBox.jsx?raw';

// `./MapsProvider` is mocked so `useMaps` returns a controllable SDK status.
vi.mock('./MapsProvider', () => ({
  useMaps: vi.fn(() => ({ isLoaded: true, loadError: null, hasKey: true })),
}));

// Minimal @react-google-maps/api doubles. RoutePreview does not import this
// package; LiveRideMap does, but the branch we render (!isLoaded) returns before
// any of these are used. The doubles keep the import cheap and side-effect free.
vi.mock('@react-google-maps/api', async () => {
  const React = await import('react');
  return {
    GoogleMap: ({ children }) => React.createElement('div', { 'data-testid': 'google-map' }, children),
    Marker: () => React.createElement('div', { 'data-testid': 'marker' }),
    Polyline: () => React.createElement('div', { 'data-testid': 'polyline' }),
  };
});

const HEALTHY_MAPS = { isLoaded: true, loadError: null, hasKey: true };

const SOURCE = { lat: 28.61, lng: 77.2 };
const DESTINATION = { lat: 28.53, lng: 77.39 };

// A successful directions response so RoutePreview reaches its summary render
// branch (the only branch that carries the responsive flex classes).
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

describe('Responsive layout (Requirement 14, Property 10)', () => {
  // -------------------------------------------------------------------------
  // Req 14.1 / 14.2 — RoutePreview summary boxes: column on mobile, row on >=sm.
  // Directly assertable: Tailwind classes are plain className attributes.
  // -------------------------------------------------------------------------
  it('RoutePreview renders the summary boxes in a flex-col / sm:flex-row container (Reqs 14.1, 14.2)', async () => {
    installGoogleMapsMock({ directionsStatus: 'OK', directionsResult: OK_RESULT });

    const { container } = render(
      <RoutePreview sourceCoords={SOURCE} destinationCoords={DESTINATION} />
    );

    // Wait for the directions state update to render the summary branch.
    expect(await screen.findByText('Distance')).toBeInTheDocument();

    // The summary container carries both responsive classes: column by default
    // (mobile, <640px) and row at the `sm` breakpoint (>=640px).
    const flexContainer = container.querySelector('.flex-col.sm\\:flex-row');
    expect(flexContainer).not.toBeNull();
    expect(flexContainer.className).toContain('flex-col');
    expect(flexContainer.className).toContain('sm:flex-row');

    // The three summary boxes (Distance, Est. Time, Est. Fare) live inside that
    // flex container, each as a `flex-1` column so they share the row evenly.
    const labels = ['Distance', 'Est. Time', 'Est. Fare'];
    labels.forEach((label) => {
      const labelEl = screen.getByText(label);
      const box = labelEl.closest('.flex-1');
      expect(box).not.toBeNull();
      // The box is a child of the responsive flex container.
      expect(flexContainer.contains(box)).toBe(true);
    });

    // All three are direct children of the responsive container.
    expect(flexContainer.children.length).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Req 14.3 / Property 10 — LiveRideMap renders the !isLoaded branch as a
  // bounded-height container. jsdom strips the clamp() inline value, so the
  // height string is not present in the DOM; we still confirm the branch
  // renders a single container without throwing. The clamp value itself is
  // locked in by source inspection below.
  // -------------------------------------------------------------------------
  it('LiveRideMap renders a height-bounded container on the loading branch (Req 14.3)', () => {
    useMaps.mockReturnValue({ isLoaded: false, loadError: null, hasKey: true });
    installGoogleMapsMock();

    const { container } = render(
      <LiveRideMap sourceCoords={SOURCE} destinationCoords={DESTINATION} />
    );

    // The loading branch renders (no GoogleMap yet) and is the single styled
    // container that carries the clamp() height in source.
    expect(screen.getByText(/Loading map/)).toBeInTheDocument();
    expect(screen.queryByTestId('google-map')).not.toBeInTheDocument();
    const outer = container.firstChild;
    expect(outer).not.toBeNull();
    // Documented jsdom limitation: clamp() is rejected by jsdom's CSS parser, so
    // the height never reaches the rendered DOM (here `outer.style.height` is ""
    // and the clamp string is absent from the serialized style attribute, which
    // only keeps valid declarations). The clamp value is verified by source
    // inspection in the test below. We only confirm here that the branch renders
    // a single element and the clamp string is genuinely not DOM-visible.
    expect(outer.style.height).toBe('');
    expect(outer.outerHTML).not.toContain('clamp(14rem, 35vw, 24rem)');
  });

  // -------------------------------------------------------------------------
  // Req 14.3 / Property 10 — Source lock-in: clamp(14rem, 35vw, 24rem) is
  // applied on ALL THREE LiveRideMap render branches (loadError, !isLoaded,
  // main). Bounds = min 14rem, max 24rem. Not DOM-assertable in jsdom (clamp()
  // is stripped), so verified deterministically against the component source.
  // -------------------------------------------------------------------------
  it('LiveRideMap applies clamp(14rem, 35vw, 24rem) on every render branch (Req 14.3, Property 10)', () => {
    const occurrences = (liveRideMapSource.match(/clamp\(14rem, 35vw, 24rem\)/g) || []).length;
    // loadError branch + !isLoaded branch + main render branch.
    expect(occurrences).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Req 14.4 — LocationSearchBox prediction dropdown width tracks the input's
  // measured width. getBoundingClientRect() returns zeroed rects in jsdom (no
  // layout engine), so this is NOT meaningfully assertable at runtime. Per the
  // testing approach we verify the realization by source inspection and avoid a
  // brittle layout-dependent assertion.
  // -------------------------------------------------------------------------
  it('LocationSearchBox derives the dropdown width from the input rect (Req 14.4, code-inspection lock-in)', () => {
    // The dropdown position (incl. width) is measured from the input element.
    expect(locationSearchBoxSource).toContain('getBoundingClientRect()');
    expect(locationSearchBoxSource).toContain('width: rect.width');
    // The measured width is applied to the portal dropdown as an inline style.
    expect(locationSearchBoxSource).toContain('${dropdownPos.width}px');
  });
});
