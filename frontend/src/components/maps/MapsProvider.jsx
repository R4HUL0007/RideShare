import { createContext, useContext } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
} from "../../config/googleMapsConfig";

// Single source of truth for Google Maps SDK load status.
// Default value used when a consumer reads the context without a provider.
const MapsContext = createContext({
  isLoaded: false,
  loadError: null,
  hasKey: false,
});

/**
 * Centralizes Google Maps SDK loading via `useJsApiLoader` (idempotent across
 * the app), guards the missing-API-key case, and exposes `{ isLoaded,
 * loadError, hasKey }` to descendants through `MapsContext`.
 *
 * Satisfies Requirements 1.1, 1.2, 2.1.
 */
export function MapsProvider({ children }) {
  const hasKey = Boolean(GOOGLE_MAPS_API_KEY);

  // Hooks must run unconditionally — call the loader first, branch afterwards.
  // `GOOGLE_MAPS_LIBRARIES` is a module-level constant so the array reference
  // is stable across renders, preventing the loader from reloading the SDK.
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES, // ['places', 'geometry']  (Req 1.2)
    preventGoogleFontsLoading: true,
  });

  // Req 2.1 — when no API key is configured, render a clear message that names
  // the VITE_GOOGLE_MAPS_API_KEY environment variable in place of map features.
  if (!hasKey) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800">
          <strong>Google Maps API Key Required:</strong> Set
          {" "}
          <code>VITE_GOOGLE_MAPS_API_KEY</code> in your environment to enable
          maps and location features.
        </p>
      </div>
    );
  }

  return (
    <MapsContext.Provider value={{ isLoaded, loadError, hasKey }}>
      {children}
    </MapsContext.Provider>
  );
}

/**
 * Read the shared Google Maps load status: `{ isLoaded, loadError, hasKey }`.
 */
export const useMaps = () => useContext(MapsContext);

export { MapsContext };

export default MapsProvider;
