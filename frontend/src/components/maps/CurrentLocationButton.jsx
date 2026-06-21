import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { useMaps } from './MapsProvider';

/**
 * CurrentLocationButton — "Use My Current Location".
 *
 * Uses the browser Geolocation API to detect the user's position, then
 * reverse-geocodes it (via the already-loaded Google Maps SDK) to a readable
 * address. Calls `onLocate({ coords, address })`.
 *
 * Graceful behavior:
 *   - If permission is denied or geolocation is unavailable, it shows a gentle
 *     message and does NOT block the normal flow.
 *   - Must be rendered inside <MapsProvider> so window.google is available for
 *     reverse geocoding; if the SDK isn't ready it still returns coordinates.
 */
const CurrentLocationButton = ({ onLocate, disabled = false }) => {
    const { isLoaded } = useMaps();
    const [busy, setBusy] = useState(false);

    const handleClick = () => {
        if (busy || disabled) return;

        if (!('geolocation' in navigator)) {
            toast.info('Location is not supported on this device.');
            return;
        }

        setBusy(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const coords = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                };

                // Try to reverse-geocode to a readable address. If the SDK isn't
                // ready, fall back to the raw coordinates so the flow continues.
                if (isLoaded && window.google?.maps?.Geocoder) {
                    const geocoder = new window.google.maps.Geocoder();
                    geocoder.geocode({ location: coords }, (results, status) => {
                        const address =
                            status === 'OK' && results && results[0]
                                ? results[0].formatted_address
                                : `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
                        onLocate?.({ coords, address });
                        setBusy(false);
                        toast.success('Pickup set to your current location');
                    });
                } else {
                    onLocate?.({ coords, address: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` });
                    setBusy(false);
                    toast.success('Pickup set to your current location');
                }
            },
            (error) => {
                setBusy(false);
                // Permission denied or unavailable — continue the normal flow.
                if (error.code === error.PERMISSION_DENIED) {
                    toast.info('Location permission denied. You can type your pickup instead.');
                } else {
                    toast.info("Couldn't get your location. Please enter it manually.");
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={busy || disabled}
            className="lsb-cloc-btn inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
            {busy ? (
                <span className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                </svg>
            )}
            {busy ? 'Detecting…' : 'Use my current location'}
        </button>
    );
};

export default CurrentLocationButton;
