// NOTE: RideMapPreview must be rendered within a <MapsProvider> by its
// consumers. It relies on the Google Maps SDK being loaded centrally by the
// provider (via useMaps) and no longer loads the SDK itself. When rendered
// without a MapsProvider ancestor, useMaps returns its default
// { isLoaded: false, ... }, so this component simply shows the loading state.
import { useState, useEffect } from "react";
import { GoogleMap, Marker, Polyline, InfoWindow } from "@react-google-maps/api";
import { useMaps } from "./MapsProvider";
import OpenInMapsButton from "./OpenInMapsButton";

const RideMapPreview = ({
  source,
  destination,
  sourceCoords,
  destinationCoords,
  showDistance = true,
}) => {
  const [mapCenter, setMapCenter] = useState({ lat: 28.5244, lng: 77.1855 }); // Default to Delhi
  const zoom = 12;
  const [distance, setDistance] = useState(null);
  const [duration, setDuration] = useState(null);
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);

  // Consume the centralized SDK load status from MapsProvider (Reqs 1.3, 1.4).
  const { isLoaded, loadError } = useMaps();

  // Fetch route and distance information
  useEffect(() => {
    if (!sourceCoords || !destinationCoords) {
      setRoute(null);
      setDistance(null);
      setDuration(null);
      return;
    }

    // Wait for the SDK to be loaded by the surrounding MapsProvider before
    // touching window.google (Reqs 1.3, 1.4).
    if (!isLoaded) {
      return;
    }

    const calculateRoute = async () => {
      setLoading(true);
      setError(null);

      try {
        const directionsService = new window.google.maps.DirectionsService();

        const result = await directionsService.route({
          origin: { lat: sourceCoords.lat, lng: sourceCoords.lng },
          destination: {
            lat: destinationCoords.lat,
            lng: destinationCoords.lng,
          },
          travelMode: window.google.maps.TravelMode.DRIVING,
        });

        if (result.routes && result.routes.length > 0) {
          const leg = result.routes[0].legs[0];
          setRoute(result.routes[0]);
          setDistance(leg.distance.text);
          setDuration(leg.duration.text);

          // Calculate center point for map
          const bounds = new window.google.maps.LatLngBounds();
          bounds.extend({ lat: sourceCoords.lat, lng: sourceCoords.lng });
          bounds.extend({
            lat: destinationCoords.lat,
            lng: destinationCoords.lng,
          });

          const center = bounds.getCenter();
          setMapCenter({ lat: center.lat(), lng: center.lng() });
        }
      } catch (err) {
        console.error("Error calculating route:", err);
        setError("Could not calculate route. Please check the locations.");
      } finally {
        setLoading(false);
      }
    };

    if (sourceCoords && destinationCoords) {
      calculateRoute();
    }
  }, [sourceCoords, destinationCoords, isLoaded]);

  // Req 1.4 / 2.2 — surface SDK load failure in a small error box.
  if (loadError) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-700">
          Map could not be loaded. Please try again later.
        </p>
      </div>
    );
  }

  if (!sourceCoords || !destinationCoords) {
    return (
      <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg text-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="mx-auto text-gray-400 mb-2"
          width="32"
          height="32"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
        </svg>
        <p className="text-sm text-gray-600">
          {source && destination
            ? "Loading map preview..."
            : "Enter source and destination to see map preview"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Distance and Duration Info */}
      {showDistance && (distance || duration) && (
        <div className="grid grid-cols-2 gap-3">
          {distance && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">
                Distance
              </p>
              <p className="text-lg font-bold text-blue-900 mt-1">{distance}</p>
            </div>
          )}
          {duration && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">
                Duration
              </p>
              <p className="text-lg font-bold text-green-900 mt-1">{duration}</p>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="flex justify-center items-center p-6 bg-gray-50 rounded-lg">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-sm text-gray-600">Calculating route...</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* SDK loading indicator (gated on MapsProvider's isLoaded, Reqs 1.3/1.4) */}
      {!isLoaded && !loading && (
        <div className="flex justify-center items-center p-6 bg-gray-50 rounded-lg">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-sm text-gray-600">Loading map...</span>
        </div>
      )}

      {/* Map Container */}
      {isLoaded && sourceCoords && destinationCoords && !loading && (
        <div className="space-y-3">
          <GoogleMap
              center={mapCenter}
              zoom={zoom}
              mapContainerStyle={{
                width: "100%",
                height: "300px",
                borderRadius: "0.5rem",
                border: "1px solid #e5e7eb",
              }}
              options={{
                streetViewControl: false,
                fullscreenControl: false,
                zoomControl: true,
                mapTypeControl: false,
              }}
            >
              {/* Source Marker */}
              <Marker
                position={{
                  lat: sourceCoords.lat,
                  lng: sourceCoords.lng,
                }}
                title="Source"
                onClick={() => setSelectedMarker("source")}
                icon={{
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: "#3b82f6",
                  fillOpacity: 1,
                  strokeColor: "#fff",
                  strokeWeight: 2,
                }}
              />

              {/* Destination Marker */}
              <Marker
                position={{
                  lat: destinationCoords.lat,
                  lng: destinationCoords.lng,
                }}
                title="Destination"
                onClick={() => setSelectedMarker("destination")}
                icon={{
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: "#10b981",
                  fillOpacity: 1,
                  strokeColor: "#fff",
                  strokeWeight: 2,
                }}
              />

              {/* Route Polyline */}
              {route && route.legs && (
                <Polyline
                  path={route.overview_path}
                  options={{
                    strokeColor: "#3b82f6",
                    strokeOpacity: 0.7,
                    strokeWeight: 3,
                  }}
                />
              )}

              {/* Info Windows */}
              {selectedMarker === "source" && (
                <InfoWindow
                  position={{
                    lat: sourceCoords.lat,
                    lng: sourceCoords.lng,
                  }}
                  onCloseClick={() => setSelectedMarker(null)}
                >
                  <div className="text-xs">
                    <p className="font-semibold">Source</p>
                    <p className="text-gray-600">{source}</p>
                  </div>
                </InfoWindow>
              )}

              {selectedMarker === "destination" && (
                <InfoWindow
                  position={{
                    lat: destinationCoords.lat,
                    lng: destinationCoords.lng,
                  }}
                  onCloseClick={() => setSelectedMarker(null)}
                >
                  <div className="text-xs">
                    <p className="font-semibold">Destination</p>
                    <p className="text-gray-600">{destination}</p>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>

          {/* Open in Google Maps Button */}
          <OpenInMapsButton
            sourceCoords={sourceCoords}
            destinationCoords={destinationCoords}
          />
        </div>
      )}
    </div>
  );
};

export default RideMapPreview;
