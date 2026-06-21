// Component tests for MapsProvider / useMaps (Task 3.3).
//
// MapsProvider depends on two module-level things that must be mocked:
//   1. `useJsApiLoader` from '@react-google-maps/api' — drives isLoaded/loadError.
//   2. `GOOGLE_MAPS_API_KEY` / `GOOGLE_MAPS_LIBRARIES` from '../../config/googleMapsConfig'.
//
// Because `GOOGLE_MAPS_API_KEY` is read at module-evaluation time inside
// MapsProvider (via the import binding `hasKey = Boolean(GOOGLE_MAPS_API_KEY)`),
// we cannot vary it with a single static `vi.mock`. Instead each test resets the
// module registry, registers fresh mocks with `vi.doMock`, and dynamically
// imports MapsProvider + useMaps from the SAME fresh module so they share one
// MapsContext instance.
//
// Covers Requirements 1.3, 1.4 (isLoaded toggles loading state),
// 2.1 (missing key names VITE_GOOGLE_MAPS_API_KEY), and 2.2 (loadError exposed).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Load a fresh copy of MapsProvider + useMaps with the given config/loader mocks.
 *
 * @param {object} opts
 * @param {string} opts.apiKey        value exported as GOOGLE_MAPS_API_KEY
 * @param {boolean} opts.isLoaded     value returned by useJsApiLoader
 * @param {Error|null} opts.loadError value returned by useJsApiLoader
 */
async function loadMapsModule({ apiKey, isLoaded, loadError }) {
  vi.resetModules();

  vi.doMock('../../config/googleMapsConfig', () => ({
    GOOGLE_MAPS_API_KEY: apiKey,
    GOOGLE_MAPS_LIBRARIES: ['places', 'geometry'],
  }));

  vi.doMock('@react-google-maps/api', () => ({
    useJsApiLoader: vi.fn(() => ({ isLoaded, loadError })),
  }));

  // Dynamic import AFTER doMock so the mocks are in effect for this evaluation.
  return import('./MapsProvider.jsx');
}

/** Build a consumer bound to a specific (freshly imported) useMaps hook. */
function makeConsumer(useMaps) {
  return function TestConsumer() {
    const { isLoaded, loadError } = useMaps();
    return (
      <div>
        <span data-testid="loaded-state">{isLoaded ? 'loaded' : 'loading'}</span>
        <span data-testid="error-state">{loadError ? 'has-error' : 'no-error'}</span>
        {loadError ? <span data-testid="error-message">{loadError.message}</span> : null}
      </div>
    );
  };
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('MapsProvider', () => {
  it('renders a message naming VITE_GOOGLE_MAPS_API_KEY when the key is missing (Req 2.1)', async () => {
    const { MapsProvider } = await loadMapsModule({
      apiKey: '',
      isLoaded: false,
      loadError: null,
    });

    render(
      <MapsProvider>
        <div>child</div>
      </MapsProvider>
    );

    // The missing-key guard must name the exact env var.
    expect(screen.getByText(/VITE_GOOGLE_MAPS_API_KEY/)).toBeInTheDocument();
    // And it must NOT render its children when the key is absent.
    expect(screen.queryByText('child')).not.toBeInTheDocument();
  });

  it('exposes loadError from the loader to children (Req 2.2)', async () => {
    const { MapsProvider, useMaps } = await loadMapsModule({
      apiKey: 'test-key',
      isLoaded: false,
      loadError: new Error('boom'),
    });
    const TestConsumer = makeConsumer(useMaps);

    render(
      <MapsProvider>
        <TestConsumer />
      </MapsProvider>
    );

    // Consumer received a truthy loadError and can read its message.
    expect(screen.getByTestId('error-state')).toHaveTextContent('has-error');
    expect(screen.getByTestId('error-message')).toHaveTextContent('boom');
  });

  it('reports a loading state to consumers while the SDK is not loaded (Req 1.3)', async () => {
    const { MapsProvider, useMaps } = await loadMapsModule({
      apiKey: 'test-key',
      isLoaded: false,
      loadError: null,
    });
    const TestConsumer = makeConsumer(useMaps);

    render(
      <MapsProvider>
        <TestConsumer />
      </MapsProvider>
    );

    expect(screen.getByTestId('loaded-state')).toHaveTextContent('loading');
  });

  it('reports a loaded state to consumers once the SDK has loaded (Req 1.4)', async () => {
    const { MapsProvider, useMaps } = await loadMapsModule({
      apiKey: 'test-key',
      isLoaded: true,
      loadError: null,
    });
    const TestConsumer = makeConsumer(useMaps);

    render(
      <MapsProvider>
        <TestConsumer />
      </MapsProvider>
    );

    expect(screen.getByTestId('loaded-state')).toHaveTextContent('loaded');
  });
});
