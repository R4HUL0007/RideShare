import React, { useEffect, useState } from 'react';
import { estimateFare, formatDistanceKm, formatDurationMinutes } from '../../utils/mapUtils';
import { useMaps } from './MapsProvider';

const RoutePreview = ({ sourceCoords, destinationCoords, onRouteInfo, showFare = true, source = '', destination = '' }) => {
    const [routeInfo, setRouteInfo] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const { isLoaded } = useMaps();

    useEffect(() => {
        // Need both coordinates and a ready SDK before requesting a route.
        // Gate on MapsProvider's `isLoaded` (Req 8.1) and keep the defensive
        // `window.google` guard so we never touch the SDK before it exists.
        if (!sourceCoords || !destinationCoords) {
            setRouteInfo(null);
            return;
        }
        if (!isLoaded || !window.google) {
            return;
        }

        setIsLoading(true);
        setError(null);

        const directionsService = new window.google.maps.DirectionsService();

        directionsService.route(
            {
                origin: new window.google.maps.LatLng(sourceCoords.lat, sourceCoords.lng),
                destination: new window.google.maps.LatLng(destinationCoords.lat, destinationCoords.lng),
                travelMode: window.google.maps.TravelMode.DRIVING,
                // Req 9.1 — current departure time + best-guess traffic model.
                drivingOptions: {
                    departureTime: new Date(),
                    trafficModel: window.google.maps.TrafficModel.BEST_GUESS
                }
            },
            (result, status) => {
                setIsLoading(false);

                if (status === window.google.maps.DirectionsStatus.OK) {
                    // Req 11 (OK) — render distance/time/fare and clear any prior error.
                    const leg = result.routes[0].legs[0];
                    const info = {
                        distance: leg.distance,
                        duration: leg.duration,
                        distanceText: leg.distance.text,
                        durationText: leg.duration.text
                    };
                    setError(null);
                    setRouteInfo(info);
                    onRouteInfo?.(info);
                } else if (status === window.google.maps.DirectionsStatus.ZERO_RESULTS) {
                    // Req 11.2 — no route available: retain previous displayed state,
                    // do not clear routeInfo and do not surface a calculation error.
                } else {
                    // Req 11.1 — any other status is a calculation failure.
                    setError('Could not calculate route');
                }
            }
        );
    }, [sourceCoords, destinationCoords, onRouteInfo, isLoaded]);

    // Req 10.3 — placeholder until both pickup and drop coordinates are present.
    if (!sourceCoords || !destinationCoords) {
        return (
            <div className="flex gap-4 mb-6">
                <div className="flex-1 bg-gray-100 h-20 rounded-lg flex items-center justify-center">
                    <p className="text-gray-400 text-sm text-center px-4">Distance info will appear here</p>
                </div>
            </div>
        );
    }

    // Req 8.3 — loading indicator while a route calculation is in flight.
    if (isLoading) {
        return (
            <div className="flex gap-4 mb-6">
                <div className="flex-1 bg-gradient-to-r from-blue-50 to-blue-100 h-20 rounded-lg flex items-center justify-center">
                    <div className="flex items-center gap-3">
                        <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                        <p className="text-blue-600 text-sm font-medium">Calculating route...</p>
                    </div>
                </div>
            </div>
        );
    }

    // Req 11.1 — surface a calculation failure.
    if (error) {
        return (
            <div className="flex gap-4 mb-6">
                <div className="flex-1 bg-red-50 h-20 rounded-lg flex items-center justify-center border border-red-200">
                    <p className="text-red-600 text-sm font-medium">{error}</p>
                </div>
            </div>
        );
    }

    if (!routeInfo) {
        return null;
    }

    // Shared, dependency-free formatting keeps display and fare consistent.
    // Distance display: meters → km, one decimal (Req 8.2).
    const distanceKm = formatDistanceKm(routeInfo.distance.value);
    // Duration display: seconds → ceil minutes (Req 9.2).
    const durationMinutes = formatDurationMinutes(routeInfo.duration.value);
    // Fare derived from the same numeric km used for display (Req 10.2).
    const estimatedFare = estimateFare(parseFloat(distanceKm));

    return (
        <div className="mb-6">
            {/* Pickup / destination labels (clean, compact) */}
            {(source || destination) && (
                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                    <div className="flex-1 flex items-start gap-2 bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <span className="mt-0.5 w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                        <div className="min-w-0">
                            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Pickup</p>
                            <p className="text-sm text-gray-700 truncate" title={source}>{source || '—'}</p>
                        </div>
                    </div>
                    <div className="flex-1 flex items-start gap-2 bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <span className="mt-0.5 w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                        <div className="min-w-0">
                            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Destination</p>
                            <p className="text-sm text-gray-700 truncate" title={destination}>{destination || '—'}</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex gap-3 flex-col sm:flex-row">
            {/* Distance Box */}
            <div className="flex-1 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                <p className="text-blue-600 text-xs font-semibold uppercase tracking-wide mb-2">Distance</p>
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-blue-900">{distanceKm}</span>
                    <span className="text-sm text-blue-700">km</span>
                </div>
                <p className="text-xs text-blue-600 mt-1">{routeInfo.distanceText}</p>
            </div>

            {/* Duration Box */}
            <div className="flex-1 bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                <p className="text-green-600 text-xs font-semibold uppercase tracking-wide mb-2">Est. Time</p>
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-green-900">{durationMinutes}</span>
                    <span className="text-sm text-green-700">min</span>
                </div>
                <p className="text-xs text-green-600 mt-1">{routeInfo.durationText}</p>
            </div>

            {/* Estimated Fare Box — hidden where pricing should not be shown */}
            {showFare && (
            <div className="flex-1 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                <p className="text-purple-600 text-xs font-semibold uppercase tracking-wide mb-2">Est. Fare</p>
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-purple-900">₹{estimatedFare}</span>
                    <span className="text-xs text-purple-600">approx</span>
                </div>
                <p className="text-xs text-purple-600 mt-1">per person</p>
            </div>
            )}
            </div>
        </div>
    );
};

export default RoutePreview;
