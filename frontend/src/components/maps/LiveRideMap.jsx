import React, { useEffect, useRef } from 'react';
import {
    GoogleMap,
    Marker,
    Polyline
} from '@react-google-maps/api';
import { useMaps } from './MapsProvider';
import { DARK_MAP_STYLE } from '../../config/googleMapsConfig';
import { haversineKm, formatNearby } from '../../utils/mapUtils';

// Premium teardrop pin as a data-URI SVG. `color` fills the pin body; `glyph`
// is a small white path drawn in the pin head.
const buildPinIcon = (color, glyph) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="52" viewBox="0 0 42 52">
        <defs>
            <filter id="s" x="-30%" y="-20%" width="160%" height="150%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.5)"/>
            </filter>
        </defs>
        <path filter="url(#s)" fill="${color}" stroke="#ffffff" stroke-width="2.5"
            d="M21 3C12.7 3 6 9.7 6 18c0 10.5 13.2 24.6 14.1 25.6.5.5 1.3.5 1.8 0C22.8 42.6 36 28.5 36 18 36 9.7 29.3 3 21 3z"/>
        <g fill="#ffffff" transform="translate(11 8)">${glyph}</g>
    </svg>`;
    const icon = {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    };
    // Guard SDK value-objects (absent in the test mock).
    if (window.google?.maps?.Size) icon.scaledSize = new window.google.maps.Size(42, 52);
    if (window.google?.maps?.Point) icon.anchor = new window.google.maps.Point(21, 48);
    return icon;
};

// Google-Maps-style "you are here" blue dot (with soft accuracy halo).
const buildUserDot = () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
        <circle cx="13" cy="13" r="12" fill="#4285F4" fill-opacity="0.18"/>
        <circle cx="13" cy="13" r="6.5" fill="#4285F4" stroke="#ffffff" stroke-width="2.5"/>
    </svg>`;
    const icon = { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg) };
    if (window.google?.maps?.Size) icon.scaledSize = new window.google.maps.Size(26, 26);
    if (window.google?.maps?.Point) icon.anchor = new window.google.maps.Point(13, 13);
    return icon;
};

// Glyphs (20x20 viewport, drawn in the pin head).
const PICKUP_GLYPH = '<circle cx="10" cy="10" r="5" fill="#ffffff"/><circle cx="10" cy="10" r="2.4" fill="#10B981"/>';
const DEST_GLYPH = '<path d="M5 4h11l-2.2 3.2L16 10.4H6.8V16H5z"/>';
const CAR_GLYPH = '<path d="M3 11l1.5-4h11L17 11M4 11h12v4a1 1 0 0 1-1 1h-1a1.5 1.5 0 0 1-3 0H9a1.5 1.5 0 0 1-3 0H5a1 1 0 0 1-1-1z"/>';

// Distance chip drawn directly on the route line (white pill, dark fill).
const buildDistanceChip = (text) => {
    const w = Math.max(54, Math.round(text.length * 8.5 + 22));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="28" viewBox="0 0 ${w} 28">
        <rect x="1.5" y="1.5" width="${w - 3}" height="25" rx="12.5" fill="rgba(12,12,14,0.92)" stroke="#ffffff" stroke-width="1.5"/>
        <text x="${w / 2}" y="15" dominant-baseline="central" text-anchor="middle" fill="#ffffff" font-family="Inter, system-ui, sans-serif" font-size="12.5" font-weight="700">${text}</text>
    </svg>`;
    const icon = { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg) };
    if (window.google?.maps?.Size) icon.scaledSize = new window.google.maps.Size(w, 28);
    if (window.google?.maps?.Point) icon.anchor = new window.google.maps.Point(w / 2, 14);
    return icon;
};

// Midpoint of the route path, tolerant of LatLng objects or plain {lat,lng}.
const getPathMidpoint = (path) => {
    if (!Array.isArray(path) || path.length === 0) return null;
    const mid = path[Math.floor(path.length / 2)];
    if (!mid) return null;
    const lat = typeof mid.lat === 'function' ? mid.lat() : mid.lat;
    const lng = typeof mid.lng === 'function' ? mid.lng() : mid.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return { lat, lng };
};

const LiveRideMap = ({
    sourceCoords,
    destinationCoords,
    source,
    destination,
    pricePerPerson,
    driverCoords,
    hideOverlay = false,
    fill = false,
    onRouteInfo,
    onSourceCoordsChange,
    onDestinationCoordsChange,
    onSourceAddressChange,
    onDestinationAddressChange
}) => {
    const mapRef = useRef(null);
    const { isLoaded, loadError } = useMaps();
    const [routeInfo, setRouteInfo] = React.useState(null);
    const [isMapLoading, setIsMapLoading] = React.useState(true);
    // Subtle loading state shown while a route is being recalculated (e.g. after
    // a marker drag) when a route is already on screen.
    const [isRecalculating, setIsRecalculating] = React.useState(false);

    // Live "my location" (Google-Maps-style blue dot). Populated on demand via
    // the locate button, then kept fresh with watchPosition so it tracks the
    // user in real time (like Uber showing where you are vs. the pickup).
    const [userLoc, setUserLoc] = React.useState(null);
    const [locating, setLocating] = React.useState(false);
    const watchIdRef = useRef(null);

    // Stop watching GPS (on unmount or toggle-off) to free the sensor.
    useEffect(() => () => {
        if (watchIdRef.current != null && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
    }, []);

    const locateMe = () => {
        if (!navigator.geolocation) { return; }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setUserLoc(loc);
                setLocating(false);
                if (mapRef.current?.panTo) mapRef.current.panTo(loc);
                if (mapRef.current?.setZoom) mapRef.current.setZoom(15);
                // Keep the dot live after the first fix.
                if (watchIdRef.current == null && navigator.geolocation.watchPosition) {
                    watchIdRef.current = navigator.geolocation.watchPosition(
                        (p) => setUserLoc({ lat: p.coords.latitude, lng: p.coords.longitude }),
                        () => {},
                        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
                    );
                }
            },
            () => setLocating(false),
            { enableHighAccuracy: true, timeout: 15000 }
        );
    };

    const reverseGeocode = (coords, onAddressChange) => {
        if (!coords || !window.google?.maps?.Geocoder) return;

        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: coords }, (results) => {
            if (results && results[0] && onAddressChange) {
                const address =
                    results[0].formatted_address ||
                    results[0].address_components?.[0]?.long_name ||
                    '';
                onAddressChange(address);
            }
        });
    };

    useEffect(() => {
        if (!isLoaded || !sourceCoords || !destinationCoords || !window.google) return;

        const bounds = new window.google.maps.LatLngBounds();
        bounds.extend(new window.google.maps.LatLng(sourceCoords.lat, sourceCoords.lng));
        bounds.extend(new window.google.maps.LatLng(destinationCoords.lat, destinationCoords.lng));

        // Fit bounds to map with generous padding so both markers + the floating
        // overlay stay clear of the route (Req: auto-fit route).
        if (mapRef.current && mapRef.current.fitBounds) {
            const timeoutId = setTimeout(() => {
                // Re-check the ref inside the callback: the component may have
                // unmounted (or the map been torn down) during the delay, which
                // would otherwise throw "Cannot read properties of null".
                if (mapRef.current && mapRef.current.fitBounds) {
                    mapRef.current.fitBounds(bounds, { top: 90, right: 60, bottom: 60, left: 60 });
                }
            }, 100);

            return () => clearTimeout(timeoutId);
        }
    }, [isLoaded, sourceCoords, destinationCoords]);

    // Get route polyline points + distance/ETA.
    useEffect(() => {
        if (!isLoaded || !sourceCoords || !destinationCoords || !window.google) return;

        const directionsService = new window.google.maps.DirectionsService();
        setIsRecalculating(true);

        directionsService.route(
            {
                origin: new window.google.maps.LatLng(sourceCoords.lat, sourceCoords.lng),
                destination: new window.google.maps.LatLng(destinationCoords.lat, destinationCoords.lng),
                travelMode: window.google.maps.TravelMode.DRIVING
            },
            (result, status) => {
                setIsRecalculating(false);
                if (status === window.google.maps.DirectionsStatus.OK && result && result.routes && result.routes.length > 0) {
                    try {
                        const route = result.routes[0];

                        // The Google Maps *JavaScript* API returns `overview_path`
                        // (an array of LatLng). The Directions *web service* returns
                        // an encoded `overview_polyline.points` string. Support both.
                        let points = null;
                        if (Array.isArray(route.overview_path) && route.overview_path.length > 0) {
                            points = route.overview_path;
                        } else if (route.overview_polyline?.points && window.google.maps.geometry?.encoding) {
                            points = window.google.maps.geometry.encoding.decodePath(
                                route.overview_polyline.points
                            );
                        }

                        const leg = route.legs && route.legs[0];
                        if (leg) {
                            const info = {
                                polyline: points,
                                distance: leg.distance?.text || '',
                                duration: leg.duration?.text || ''
                            };
                            setRouteInfo(info);

                            // Encoded polyline + numeric values for Smart Route
                            // Matching (stored on the ride at creation).
                            let polylineEncoded = '';
                            if (route.overview_polyline?.points) {
                                polylineEncoded = route.overview_polyline.points;
                            } else if (Array.isArray(route.overview_path) && window.google.maps.geometry?.encoding) {
                                polylineEncoded = window.google.maps.geometry.encoding.encodePath(route.overview_path);
                            }
                            onRouteInfo?.({
                                distance: info.distance,
                                duration: info.duration,
                                polylineEncoded,
                                distanceKm: leg.distance?.value != null ? leg.distance.value / 1000 : null,
                                durationMin: leg.duration?.value != null ? Math.round(leg.duration.value / 60) : null,
                            });
                        }
                    } catch (error) {
                        console.error('Error processing directions:', error);
                    }
                } else {
                    console.log('Directions error:', status, result);
                }
            }
        );
    }, [isLoaded, sourceCoords, destinationCoords, onRouteInfo]);

    const defaultCenter = sourceCoords || destinationCoords || { lat: 28.7041, lng: 77.1025 }; // Delhi default

    // Req 2.2 — SDK failed to load: show a small error box instead of the map.
    if (loadError) {
        return (
            <div
                className="w-full rounded-lg overflow-hidden flex items-center justify-center"
                style={{ height: fill ? '100%' : 'clamp(14rem, 35vw, 24rem)', background: '#161618', border: '1px solid rgba(244,63,94,0.4)' }}
            >
                <p className="text-sm font-medium px-4 text-center" style={{ color: '#fca5a5' }}>Map could not be loaded.</p>
            </div>
        );
    }

    // Reqs 1.3, 1.4 — gate on SDK readiness: while the Google Maps SDK has not
    // finished loading, show a loading indicator and do NOT render <GoogleMap>.
    if (!isLoaded) {
        return (
            <div
                className="w-full rounded-lg overflow-hidden flex items-center justify-center"
                style={{ height: fill ? '100%' : 'clamp(14rem, 35vw, 24rem)', background: '#161618', border: '1px solid rgba(255,255,255,0.08)' }}
            >
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 rounded-full" style={{ border: '3px solid rgba(255,255,255,0.18)', borderTopColor: '#f4f4f5', animation: 'spin 0.8s linear infinite' }}></div>
                    <p className="text-sm font-medium" style={{ color: '#9ca3af' }}>Loading map…</p>
                </div>
            </div>
        );
    }

    return (
        /* Responsive bounded height (see clamp on the container below);
           position:relative needed for the floating overlays. */
        <div
            className="w-full rounded-lg overflow-hidden relative"
            style={{ height: fill ? '100%' : 'clamp(14rem, 35vw, 24rem)', transition: 'height 0.3s ease', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 10px 30px rgba(0,0,0,0.45)' }}
        >
            {/* Loading overlay while map tiles load */}
            {isMapLoading && (
                <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#161618' }}>
                    <div className="flex flex-col items-center gap-3">
                        <div className="h-8 w-8 rounded-full" style={{ border: '3px solid rgba(255,255,255,0.18)', borderTopColor: '#f4f4f5', animation: 'spin 0.8s linear infinite' }}></div>
                        <p className="text-sm font-medium" style={{ color: '#9ca3af' }}>Loading map…</p>
                    </div>
                </div>
            )}

            <GoogleMap
                zoom={sourceCoords && destinationCoords ? 14 : 12}
                center={defaultCenter}
                mapContainerStyle={{
                    width: '100%',
                    height: '100%'
                }}
                options={{
                    styles: DARK_MAP_STYLE,
                    backgroundColor: '#0f0f10',
                    // Clean, Uber-style map: no on-screen buttons. Pinch / scroll
                    // still zooms (gestureHandling: 'greedy'); our own locate
                    // button below replaces the default controls.
                    disableDefaultUI: true,
                    zoomControl: false,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                    rotateControl: false,
                    keyboardShortcuts: false,
                    gestureHandling: 'greedy',
                    clickableIcons: false
                }}
                onLoad={(map) => { mapRef.current = map; setIsMapLoading(false); }}
            >
                {/* Route Polyline — glow (wide, translucent) + core (bright white) layers */}
                {routeInfo && routeInfo.polyline && (
                    <Polyline
                        path={routeInfo.polyline}
                        options={{
                            strokeColor: '#ffffff',
                            strokeOpacity: 0.22,
                            strokeWeight: 12,
                            geodesic: true,
                            zIndex: 1
                        }}
                    />
                )}
                {routeInfo && routeInfo.polyline && (
                    <Polyline
                        path={routeInfo.polyline}
                        options={{
                            strokeColor: '#ffffff',
                            strokeOpacity: 0.98,
                            strokeWeight: 5,
                            geodesic: true,
                            zIndex: 2
                        }}
                    />
                )}

                {/* Distance chip pinned to the middle of the route line */}
                {routeInfo && routeInfo.distance && getPathMidpoint(routeInfo.polyline) && (
                    <Marker
                        position={getPathMidpoint(routeInfo.polyline)}
                        icon={buildDistanceChip(routeInfo.distance)}
                        clickable={false}
                        zIndex={4}
                    />
                )}

                {/* Source / Pickup Marker (green) */}
                {sourceCoords && (
                    <Marker
                        position={sourceCoords}
                        draggable={true}
                        onDragEnd={(event) => {
                            const coords = {
                                lat: event.latLng.lat(),
                                lng: event.latLng.lng()
                            };
                            onSourceCoordsChange?.(coords);
                            reverseGeocode(coords, onSourceAddressChange);
                        }}
                        icon={buildPinIcon('#10B981', PICKUP_GLYPH)}
                        title={source}
                        zIndex={3}
                    />
                )}

                {/* Destination Marker (red) */}
                {destinationCoords && (
                    <Marker
                        position={destinationCoords}
                        draggable={true}
                        onDragEnd={(event) => {
                            const coords = {
                                lat: event.latLng.lat(),
                                lng: event.latLng.lng()
                            };
                            onDestinationCoordsChange?.(coords);
                            reverseGeocode(coords, onDestinationAddressChange);
                        }}
                        icon={buildPinIcon('#EF4444', DEST_GLYPH)}
                        title={destination}
                        zIndex={3}
                    />
                )}

                {/* Live driver position (blue car) — only when a moving driver
                    location is supplied (e.g. an active personalized ride). */}
                {driverCoords && Number.isFinite(driverCoords.lat) && Number.isFinite(driverCoords.lng) && (
                    <Marker
                        position={{ lat: driverCoords.lat, lng: driverCoords.lng }}
                        icon={buildPinIcon('#3B82F6', CAR_GLYPH)}
                        title="Driver"
                        zIndex={6}
                    />
                )}

                {/* Live "you are here" blue dot — set by the locate button, then
                    kept fresh via watchPosition so it tracks the user's movement. */}
                {userLoc && Number.isFinite(userLoc.lat) && Number.isFinite(userLoc.lng) && (
                    <Marker
                        position={userLoc}
                        icon={buildUserDot()}
                        title="Your location"
                        zIndex={7}
                        clickable={false}
                    />
                )}
            </GoogleMap>

            {/* "My location" button (Google-Maps style). Centers the map on the
                user and starts live tracking of their position. */}
            <button
                type="button"
                onClick={locateMe}
                aria-label="Show my location"
                title="Show my location"
                style={{
                    position: 'absolute', right: '12px', bottom: '34px', width: '46px', height: '46px',
                    borderRadius: '50%', border: '1px solid rgba(255,255,255,0.3)',
                    background: 'rgba(20,20,22,0.96)', color: userLoc ? '#4285F4' : '#f4f4f5',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,0.6)', zIndex: 40
                }}
            >
                {locating ? (
                    <span className="rounded-full" style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
                ) : (
                    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3.2" /><line x1="12" y1="2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" />
                    </svg>
                )}
            </button>

            {/* Distance-from-pickup chip (Uber-style) — how far the user is from
                the pickup point, live as they move. */}
            {userLoc && sourceCoords && formatNearby(haversineKm(userLoc, sourceCoords)) && (
                <div
                    className="inline-flex items-center gap-2"
                    style={{
                        position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: '34px',
                        background: 'rgba(20,20,22,0.96)', border: '1px solid rgba(255,255,255,0.3)',
                        borderRadius: '999px', padding: '0.4rem 0.8rem', color: '#f4f4f5',
                        fontSize: '0.78rem', fontWeight: 700, boxShadow: '0 6px 18px rgba(0,0,0,0.6)', whiteSpace: 'nowrap', zIndex: 40
                    }}
                >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4285F4', boxShadow: '0 0 0 3px rgba(66,133,244,0.25)' }} />
                    {formatNearby(haversineKm(userLoc, sourceCoords))} from pickup
                </div>
            )}

            {/* Floating glass route-info overlay (top) — pickup → destination,
                distance, ETA, price. Updates whenever the route changes. */}
            {routeInfo && sourceCoords && destinationCoords && !hideOverlay && (
                <div
                    className="absolute z-20"
                    style={{
                        left: '12px',
                        right: '12px',
                        top: '12px',
                        maxWidth: '420px',
                        background: 'rgba(12, 12, 14, 0.78)',
                        backdropFilter: 'blur(14px)',
                        WebkitBackdropFilter: 'blur(14px)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '0.85rem',
                        padding: '0.7rem 0.85rem',
                        color: '#f4f4f5',
                        boxShadow: '0 12px 30px rgba(0,0,0,0.5)'
                    }}
                >
                    {/* Pickup */}
                    <div className="flex items-center gap-2" style={{ marginBottom: '0.3rem' }}>
                        <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#10B981', flexShrink: 0, boxShadow: '0 0 0 3px rgba(16,185,129,0.25)' }} />
                        <span className="text-xs" style={{ color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Pickup</span>
                        <span className="text-sm" style={{ color: '#f4f4f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }} title={source}>
                            {source || '—'}
                        </span>
                    </div>
                    {/* Destination */}
                    <div className="flex items-center gap-2" style={{ marginBottom: '0.55rem' }}>
                        <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#EF4444', flexShrink: 0, boxShadow: '0 0 0 3px rgba(239,68,68,0.25)' }} />
                        <span className="text-xs" style={{ color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Drop</span>
                        <span className="text-sm" style={{ color: '#f4f4f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }} title={destination}>
                            {destination || '—'}
                        </span>
                    </div>

                    {/* Distance · ETA · Price */}
                    <div className="flex items-center" style={{ gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.55rem' }}>
                        <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: '#e5e7eb' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
                                <polygon points="12 15 17 21 7 21 12 15" />
                            </svg>
                            <span style={{ fontWeight: 700 }}>{routeInfo.distance}</span>
                        </span>
                        <span style={{ color: 'rgba(255,255,255,0.2)' }}>•</span>
                        <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: '#e5e7eb' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="9" />
                                <polyline points="12 7 12 12 15 14" />
                            </svg>
                            <span style={{ fontWeight: 700 }}>{routeInfo.duration}</span>
                        </span>
                        {pricePerPerson !== undefined && pricePerPerson !== null && `${pricePerPerson}`.trim() !== '' && Number(pricePerPerson) > 0 && (
                            <span
                                className="inline-flex items-center gap-1 text-sm"
                                style={{ marginLeft: 'auto', fontWeight: 800, color: '#0a0a0b', background: '#f4f4f5', borderRadius: '999px', padding: '0.15rem 0.6rem' }}
                            >
                                ₹{Number(pricePerPerson)}/seat
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Recalculating badge (subtle) — shown while a drag-triggered route
                request is in flight and a route is already displayed. */}
            {isRecalculating && routeInfo && (
                <div
                    className="absolute z-20 inline-flex items-center gap-2"
                    style={{
                        left: '50%', transform: 'translateX(-50%)', bottom: '12px',
                        background: 'rgba(12,12,14,0.82)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255,255,255,0.12)', borderRadius: '999px',
                        padding: '0.35rem 0.8rem', color: '#f4f4f5', fontSize: '0.78rem', fontWeight: 600,
                        boxShadow: '0 8px 20px rgba(0,0,0,0.5)'
                    }}
                >
                    <span className="rounded-full" style={{ width: '13px', height: '13px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
                    Updating route…
                </div>
            )}

            {/* No Location placeholder — shown only when map hasn't loaded locations */}
            {!sourceCoords && !destinationCoords && !isMapLoading && (
                <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'radial-gradient(120% 120% at 50% 0%, #1a1a1d 0%, #0f0f10 60%)' }}>
                    <div className="text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto mb-3" width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.25)">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <p className="text-sm font-medium" style={{ color: '#9ca3af' }}>Select pickup and drop locations</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LiveRideMap;
