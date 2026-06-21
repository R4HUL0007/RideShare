// Navigation_Service — reusable "Open in Google Maps" control.
//
// Renders a button only when BOTH source and destination coordinates are
// present (Req 12.1). Clicking it builds a documented Google Maps directions
// deep link via `buildDirectionsUrl` (Req 12.2) and opens it in a new browser
// context (Req 12.3). It is intentionally dependency-free of the Maps SDK so
// it can be dropped onto any surface that already holds both coordinate pairs.
import { buildDirectionsUrl } from "../../utils/mapUtils";

const DEFAULT_CLASS_NAME =
  "w-full btn btn-outline flex items-center justify-center gap-2";

const hasNumericCoords = (coords) =>
  Boolean(coords) &&
  typeof coords.lat === "number" &&
  Number.isFinite(coords.lat) &&
  typeof coords.lng === "number" &&
  Number.isFinite(coords.lng);

const OpenInMapsButton = ({
  sourceCoords,
  destinationCoords,
  className = DEFAULT_CLASS_NAME,
}) => {
  // Req 12.1 — render nothing unless both coordinate pairs are present.
  if (!hasNumericCoords(sourceCoords) || !hasNumericCoords(destinationCoords)) {
    return null;
  }

  const handleOpenInGoogleMaps = () => {
    // Req 12.2 — build the documented directions URL from both coordinates.
    const url = buildDirectionsUrl(sourceCoords, destinationCoords);
    // Req 12.3 — open in a new browser context.
    window.open(url, "_blank", "noopener");
  };

  return (
    <button
      type="button"
      onClick={handleOpenInGoogleMaps}
      className={className}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className=""
        width="16"
        height="16"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
      Open in Google Maps
    </button>
  );
};

export default OpenInMapsButton;
