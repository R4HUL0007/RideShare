import { useState, useEffect, useRef, useCallback } from "react";
import { GoogleMap, Marker, Polyline } from "@react-google-maps/api";
import axiosInstance from "../utils/axiosConfig";
import { toast } from "react-toastify";
import { API_BASE_URL } from "../utils/constants";
import { haversineKm, formatNearby } from "../utils/mapUtils";
import { DARK_MAP_STYLE } from "../config/googleMapsConfig";
import MapsProvider, { useMaps } from "./maps/MapsProvider";
import { getSocket, joinUser } from "../utils/socket";
import "../styles/liveTracking.css";

const hasCoords = (c) => c && typeof c.lat === "number" && typeof c.lng === "number" && Number.isFinite(c.lat) && Number.isFinite(c.lng);
const initials = (name = "") => name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "U";
const firstName = (name = "") => (name?.trim().split(/\s+/)[0] || "Driver");

// Human label + ordered index for each tracking state.
const STATES = ["scheduled", "enroute", "arriving", "arrived", "in_progress", "completed"];
const STATE_LABEL = {
    scheduled: "Scheduled",
    enroute: "Driver en route",
    arriving: "Driver arriving",
    arrived: "Driver arrived",
    in_progress: "Ride in progress",
    completed: "Ride completed",
};

/* ---------------- marker icons ---------------- */
const pinIcon = (color, glyph) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="48" viewBox="0 0 42 52"><defs><filter id="s" x="-30%" y="-20%" width="160%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.5)"/></filter></defs><path filter="url(#s)" fill="${color}" stroke="#ffffff" stroke-width="2.5" d="M21 3C12.7 3 6 9.7 6 18c0 10.5 13.2 24.6 14.1 25.6.5.5 1.3.5 1.8 0C22.8 42.6 36 28.5 36 18 36 9.7 29.3 3 21 3z"/><g fill="#ffffff" transform="translate(11 8)">${glyph}</g></svg>`;
    const icon = { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg) };
    if (window.google?.maps?.Size) icon.scaledSize = new window.google.maps.Size(38, 48);
    if (window.google?.maps?.Point) icon.anchor = new window.google.maps.Point(19, 44);
    return icon;
};
const PICKUP_GLYPH = '<circle cx="10" cy="10" r="5" fill="#ffffff"/><circle cx="10" cy="10" r="2.4" fill="#10B981"/>';
const FLAG_GLYPH = '<path d="M5 4h11l-2.2 3.2L16 10.4H6.8V16H5z"/>';
const carIcon = () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#3B82F6" fill-opacity="0.2"/><circle cx="20" cy="20" r="12" fill="#0a0a0b" stroke="#ffffff" stroke-width="2"/><g transform="translate(11 12)" fill="#ffffff"><path d="M2 9l1-3.5h12L16 9M3 9h12v3a1 1 0 0 1-1 1h-1a1.5 1.5 0 0 1-3 0H8a1.5 1.5 0 0 1-3 0H4a1 1 0 0 1-1-1z"/></g></svg>`;
    const icon = { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg) };
    if (window.google?.maps?.Size) icon.scaledSize = new window.google.maps.Size(40, 40);
    if (window.google?.maps?.Point) icon.anchor = new window.google.maps.Point(20, 20);
    return icon;
};

/* ---------------- tracking map ---------------- */
function TrackingMap({ pickup, destination, driver, route }) {
    const { isLoaded, loadError } = useMaps();
    const [mapRef, setMapRef] = useState(null);

    useEffect(() => {
        if (!isLoaded || !window.google || !mapRef) return;
        const bounds = new window.google.maps.LatLngBounds();
        let n = 0;
        [pickup, destination, driver].forEach((c) => { if (hasCoords(c)) { bounds.extend(c); n++; } });
        if (n > 0) {
            const t = setTimeout(() => {
                mapRef.fitBounds?.(bounds, { top: 70, right: 60, bottom: 180, left: 60 });
                if (n === 1) mapRef.setZoom?.(15);
            }, 80);
            return () => clearTimeout(t);
        }
    }, [isLoaded, mapRef, pickup, destination, driver]);

    if (loadError) return <div className="lt-map-msg">Map could not be loaded.</div>;
    if (!isLoaded) return <div className="lt-map-msg"><span className="lt-spin" /> Loading map…</div>;

    const center = driver || pickup || destination || { lat: 22.3, lng: 73.18 };
    return (
        <GoogleMap
            onLoad={setMapRef}
            center={center}
            zoom={13}
            mapContainerStyle={{ width: "100%", height: "100%" }}
            options={{ styles: DARK_MAP_STYLE, backgroundColor: "#0f0f10", disableDefaultUI: true, zoomControl: false, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, rotateControl: false, keyboardShortcuts: false, gestureHandling: "greedy", clickableIcons: false }}
        >
            {hasCoords(pickup) && <Marker position={pickup} icon={pinIcon("#10B981", PICKUP_GLYPH)} title="Pickup" zIndex={3} />}
            {hasCoords(destination) && <Marker position={destination} icon={pinIcon("#EF4444", FLAG_GLYPH)} title="Destination" zIndex={3} />}
            {hasCoords(driver) && <Marker position={driver} icon={carIcon()} title="Driver" zIndex={5} />}
            {route && (
                <>
                    <Polyline path={route} options={{ strokeColor: "#ffffff", strokeOpacity: 0.22, strokeWeight: 11, zIndex: 1 }} />
                    <Polyline path={route} options={{ strokeColor: "#ffffff", strokeOpacity: 0.98, strokeWeight: 5, zIndex: 2 }} />
                </>
            )}
        </GoogleMap>
    );
}

/* ---------------- status flow strip ---------------- */
function StatusFlow({ state }) {
    const idx = STATES.indexOf(state);
    const steps = [
        { key: "enroute", label: "En route" },
        { key: "arriving", label: "Arriving" },
        { key: "arrived", label: "Arrived" },
        { key: "in_progress", label: "Started" },
        { key: "completed", label: "Completed" },
    ];
    return (
        <div className="lt-flow">
            {steps.map((s) => {
                const sIdx = STATES.indexOf(s.key);
                const done = idx >= sIdx;
                const current = state === s.key;
                return (
                    <div key={s.key} className={`lt-flow-step${done ? " done" : ""}${current ? " current" : ""}`}>
                        <span className="lt-flow-dot" />
                        <span className="lt-flow-label">{s.label}</span>
                    </div>
                );
            })}
        </div>
    );
}

/* =======================================================
   LiveTracking (main)
   ======================================================= */
function LiveTrackingInner({ rideId, user, onBack }) {
    const { isLoaded } = useMaps();
    const [info, setInfo] = useState(null);     // tracking snapshot from API
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [driverLoc, setDriverLoc] = useState(null);
    const [state, setState] = useState("scheduled");
    const [eta, setEta] = useState(null);
    const [distanceKm, setDistanceKm] = useState(null);
    const [route, setRoute] = useState(null);
    const [sharing, setSharing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [completed, setCompleted] = useState(null); // { durationMin }
    const watchIdRef = useRef(null);
    const lastSentRef = useRef(0);
    const userId = user?.id || user?._id;

    const isDriver = Boolean(info?.isDriver);
    const pickup = info?.sourceCoords && hasCoords(info.sourceCoords) ? info.sourceCoords : null;
    const destination = info?.destinationCoords && hasCoords(info.destinationCoords) ? info.destinationCoords : null;

    // ---- load snapshot ----
    const load = useCallback(async () => {
        setLoading(true); setError("");
        try {
            const res = await axiosInstance.get(`${API_BASE_URL}/rides/${rideId}/tracking`);
            setInfo(res.data);
            setState(res.data.tracking?.state || "scheduled");
            if (hasCoords(res.data.tracking?.driverLocation)) setDriverLoc(res.data.tracking.driverLocation);
        } catch (err) {
            setError(err.response?.data?.message || "Unable to load tracking.");
        } finally {
            setLoading(false);
        }
    }, [rideId]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { if (userId) joinUser(userId); }, [userId]);

    // ---- passenger: subscribe to live driver location + status ----
    useEffect(() => {
        if (isDriver) return; // driver doesn't track itself via socket
        const socket = getSocket();
        const onLoc = (p) => {
            if (String(p.rideId) !== String(rideId)) return;
            if (hasCoords(p.location)) setDriverLoc(p.location);
            if (p.state) setState(p.state);
            if (p.eta != null) setEta(p.eta);
            if (p.distance != null) setDistanceKm(p.distance);
        };
        const onStatus = (p) => {
            if (String(p.rideId) !== String(rideId)) return;
            if (p.state) setState(p.state);
            if (p.state === "completed") setCompleted({ durationMin: p.durationMin });
        };
        socket.on("ride:location", onLoc);
        socket.on("ride:status", onStatus);
        return () => { socket.off("ride:location", onLoc); socket.off("ride:status", onStatus); };
    }, [isDriver, rideId]);

    // ---- compute route polyline + ETA/distance from driver→destination (or pickup) ----
    useEffect(() => {
        if (!isLoaded || !window.google) return;
        const origin = driverLoc && hasCoords(driverLoc) ? driverLoc : pickup;
        // Before the ride starts, target the pickup; after, target the destination.
        const target = (state === "in_progress" || state === "completed") ? destination : (driverLoc ? pickup : destination);
        const dest = target || destination;
        if (!hasCoords(origin) || !hasCoords(dest)) { setRoute(null); return; }

        const svc = new window.google.maps.DirectionsService();
        svc.route(
            { origin, destination: dest, travelMode: window.google.maps.TravelMode.DRIVING },
            (result, status) => {
                if (status === window.google.maps.DirectionsStatus.OK && result?.routes?.[0]) {
                    const r = result.routes[0];
                    const path = Array.isArray(r.overview_path) && r.overview_path.length
                        ? r.overview_path
                        : (r.overview_polyline?.points && window.google.maps.geometry?.encoding
                            ? window.google.maps.geometry.encoding.decodePath(r.overview_polyline.points)
                            : null);
                    setRoute(path);
                    const leg = r.legs?.[0];
                    if (leg) {
                        // For passengers we trust socket-provided eta/distance when present.
                        if (isDriver || eta == null) setEta(leg.duration?.text || null);
                        if (isDriver || distanceKm == null) setDistanceKm(leg.distance ? leg.distance.value / 1000 : null);
                    }
                } else {
                    setRoute(null);
                }
            }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, driverLoc, pickup, destination, state, isDriver]);

    // ---- driver: share live location while ride is active ----
    const pushLocation = useCallback(async (coords) => {
        // Derive a proximity-based pre-start state (arriving < 800m, arrived < 120m).
        let derived;
        if (state !== "in_progress" && state !== "completed" && pickup) {
            const dKm = haversineKm(coords, pickup);
            if (dKm != null) {
                if (dKm < 0.12) derived = "arrived";
                else if (dKm < 0.8) derived = "arriving";
                else derived = "enroute";
            }
        }
        try {
            await axiosInstance.post(`${API_BASE_URL}/rides/${rideId}/tracking/location`, {
                lat: coords.lat, lng: coords.lng,
                state: derived,
                eta: typeof eta === "string" ? eta : null,
                distance: distanceKm,
            });
            if (derived) setState((s) => (s === "in_progress" || s === "completed" ? s : derived));
        } catch { /* transient network error — keep watching */ }
    }, [rideId, state, pickup, eta, distanceKm]);

    const startSharing = useCallback(() => {
        if (!("geolocation" in navigator)) { toast.info("Location isn't supported on this device."); return; }
        if (watchIdRef.current != null) return;
        setSharing(true);
        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setDriverLoc(coords);
                // Throttle network writes to ~once every 4s.
                const now = Date.now();
                if (now - lastSentRef.current > 4000) { lastSentRef.current = now; pushLocation(coords); }
            },
            () => { toast.info("Couldn't access your location. Tracking needs location permission."); setSharing(false); },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 }
        );
    }, [pushLocation]);

    const stopSharing = useCallback(() => {
        if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
        setSharing(false);
    }, []);

    // Auto-start sharing once the ride is in progress (driver). Cleanup on unmount.
    useEffect(() => {
        if (isDriver && state === "in_progress") startSharing();
        return () => stopSharing();
    }, [isDriver, state, startSharing, stopSharing]);

    const startRide = async () => {
        setBusy(true);
        try {
            await axiosInstance.post(`${API_BASE_URL}/rides/${rideId}/tracking/start`, {});
            setState("in_progress");
            startSharing();
            toast.success("Ride started — sharing your live location.");
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to start ride.");
        } finally { setBusy(false); }
    };

    const endRide = async () => {
        if (!window.confirm("End this ride? This marks it completed for everyone.")) return;
        setBusy(true);
        try {
            const res = await axiosInstance.post(`${API_BASE_URL}/rides/${rideId}/tracking/end`, {});
            stopSharing();
            setState("completed");
            setCompleted({ durationMin: res.data?.durationMin });
            toast.success("Ride completed.");
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to end ride.");
        } finally { setBusy(false); }
    };

    // ---- render ----
    if (loading) {
        return <div className="lt-root"><div className="lt-center"><span className="lt-spin lg" /> Loading tracking…</div></div>;
    }
    if (error) {
        return (
            <div className="lt-root"><div className="lt-center">
                <p className="lt-error">{error}</p>
                <button className="lt-btn ghost" onClick={onBack}>Go Back</button>
            </div></div>
        );
    }

    const driver = info?.driver || {};
    const vehicle = info?.vehicle || {};
    const distLabel = distanceKm != null ? (distanceKm < 1 ? formatNearby(distanceKm) : `${distanceKm.toFixed(1)} km`) : "—";
    const totalKm = hasCoords(pickup) && hasCoords(destination) ? haversineKm(pickup, destination) : null;

    return (
        <div className="lt-root">
            {/* top bar */}
            <div className="lt-topbar">
                <button className="lt-back" onClick={onBack} aria-label="Back">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                </button>
                <div className="lt-topbar-meta">
                    <span className="lt-topbar-title">Live Tracking</span>
                    <span className="lt-topbar-route">{info?.source} → {info?.destination}</span>
                </div>
                <span className={`lt-state-pill ${state}`}>{STATE_LABEL[state]}</span>
            </div>

            {/* map */}
            <div className="lt-map">
                <TrackingMap pickup={pickup} destination={destination} driver={hasCoords(driverLoc) ? driverLoc : null} route={route} />

                {/* status flow overlay */}
                <div className="lt-flow-wrap"><StatusFlow state={state} /></div>
            </div>

            {/* info panel */}
            <div className="lt-panel">
                <div className="lt-panel-driver">
                    {driver.profilePicture ? <img className="lt-avatar" src={driver.profilePicture} alt={driver.name} /> : <span className="lt-avatar lt-avatar-fallback">{initials(driver.name)}</span>}
                    <div className="lt-driver-meta">
                        <span className="lt-driver-name">{isDriver ? "You (driver)" : firstName(driver.name)}</span>
                        <span className="lt-driver-sub">{vehicle.make ? `${vehicle.make} ${vehicle.model}${vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}` : "Vehicle"}</span>
                    </div>
                    {!isDriver && driver.phoneNumber && (
                        <a className="lt-call" href={`tel:${driver.phoneNumber}`} aria-label="Call driver">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                        </a>
                    )}
                </div>

                <div className="lt-stats">
                    <div className="lt-stat"><span className="lt-stat-k">Status</span><span className="lt-stat-v">{STATE_LABEL[state]}</span></div>
                    <div className="lt-stat"><span className="lt-stat-k">{state === "in_progress" ? "To destination" : "Driver distance"}</span><span className="lt-stat-v">{distLabel}</span></div>
                    <div className="lt-stat"><span className="lt-stat-k">ETA</span><span className="lt-stat-v">{eta || "—"}</span></div>
                    <div className="lt-stat"><span className="lt-stat-k">Trip length</span><span className="lt-stat-v">{totalKm != null ? `${totalKm.toFixed(1)} km` : "—"}</span></div>
                </div>

                {/* route addresses */}
                <div className="lt-route">
                    <div className="lt-route-line"><span className="lt-dot pickup" /><span className="lt-route-text">{info?.source}</span></div>
                    <div className="lt-route-conn" />
                    <div className="lt-route-line"><span className="lt-dot drop" /><span className="lt-route-text">{info?.destination}</span></div>
                </div>

                {/* driver controls */}
                {isDriver && state !== "completed" && (
                    <div className="lt-actions">
                        {state !== "in_progress" ? (
                            <button className="lt-btn start" onClick={startRide} disabled={busy}>
                                {busy ? <span className="lt-spin" /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4" /></svg>}
                                Start Ride
                            </button>
                        ) : (
                            <>
                                <span className={`lt-sharing${sharing ? " on" : ""}`}>
                                    <span className="lt-sharing-dot" /> {sharing ? "Sharing live location" : "Location paused"}
                                </span>
                                <button className="lt-btn end" onClick={endRide} disabled={busy}>
                                    {busy ? <span className="lt-spin" /> : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>}
                                    End Ride
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* passenger waiting hint */}
                {!isDriver && state === "scheduled" && (
                    <p className="lt-hint">Waiting for the driver to start the ride. You'll see their live location here.</p>
                )}
                {!isDriver && (state === "enroute" || state === "arriving") && (
                    <p className="lt-hint">Your driver is on the way to the pickup point.</p>
                )}
                {!isDriver && state === "arrived" && (
                    <p className="lt-hint highlight">Your driver has arrived at the pickup point.</p>
                )}
            </div>

            {/* completion overlay */}
            {(state === "completed" || completed) && (
                <div className="lt-done-overlay">
                    <div className="lt-done">
                        <div className="lt-done-badge"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#0a0a0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></div>
                        <h2 className="lt-done-title">🎉 Ride Completed</h2>
                        <div className="lt-done-rows">
                            <div className="lt-done-row"><span>Route</span><span>{info?.source} → {info?.destination}</span></div>
                            <div className="lt-done-row"><span>Total distance</span><span>{totalKm != null ? `${totalKm.toFixed(1)} km` : "—"}</span></div>
                            <div className="lt-done-row"><span>Duration</span><span>{completed?.durationMin != null ? `${completed.durationMin} min` : "—"}</span></div>
                        </div>
                        <p className="lt-done-future">Ratings & reviews coming soon.</p>
                        <button className="lt-btn" onClick={onBack}>Done</button>
                    </div>
                </div>
            )}
        </div>
    );
}

const LiveTracking = ({ rideId, user, onBack }) => (
    <MapsProvider>
        <LiveTrackingInner rideId={rideId} user={user} onBack={onBack} />
    </MapsProvider>
);

export default LiveTracking;
