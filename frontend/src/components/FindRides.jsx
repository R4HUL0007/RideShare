import { useState, useEffect, useRef, useCallback } from "react";
import { GoogleMap, Marker, Polyline } from "@react-google-maps/api";
import axiosInstance from "../utils/axiosConfig";
import { toast } from "react-toastify";
import { API_BASE_URL } from "../utils/constants";
import { haversineKm, formatNearby } from "../utils/mapUtils";
import { DARK_MAP_STYLE } from "../config/googleMapsConfig";
import MapsProvider, { useMaps as useMapsCtx } from "./maps/MapsProvider";
import LocationSearchBox from "./maps/LocationSearchBox";
import CurrentLocationButton from "./maps/CurrentLocationButton";
import LiveRideMap from "./maps/LiveRideMap";
import ThemedSelect from "./ThemedSelect";
import PhoneVerifyBanner from "./PhoneVerifyBanner";
import usePhoneGate from "../utils/usePhoneGate";
import { getPaymentConfig, payForRide } from "../services/paymentService";
import { recordSearch } from "../services/suggestionsService";
import { CheckoutModal, PaymentSuccess, PaymentFailure } from "./payments/PaymentDialogs";
import ReceiptModal from "./payments/ReceiptModal";
import "../styles/findRides.css";
import "../styles/payments.css";

/* ---------------- marker icon builders ---------------- */
const pinIcon = (color, glyph) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="48" viewBox="0 0 42 52">
        <defs><filter id="s" x="-30%" y="-20%" width="160%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.5)"/></filter></defs>
        <path filter="url(#s)" fill="${color}" stroke="#ffffff" stroke-width="2.5" d="M21 3C12.7 3 6 9.7 6 18c0 10.5 13.2 24.6 14.1 25.6.5.5 1.3.5 1.8 0C22.8 42.6 36 28.5 36 18 36 9.7 29.3 3 21 3z"/>
        <g fill="#ffffff" transform="translate(11 8)">${glyph}</g>
    </svg>`;
    const icon = { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg) };
    if (window.google?.maps?.Size) icon.scaledSize = new window.google.maps.Size(38, 48);
    if (window.google?.maps?.Point) icon.anchor = new window.google.maps.Point(19, 44);
    return icon;
};
const CAR_GLYPH = '<path d="M3 11l1.5-4h11L17 11M4 11h12v4a1 1 0 0 1-1 1h-1a1.5 1.5 0 0 1-3 0H9a1.5 1.5 0 0 1-3 0H5a1 1 0 0 1-1-1z"/>';
const FLAG_GLYPH = '<path d="M5 4h11l-2.2 3.2L16 10.4H6.8V16H5z"/>';
const userDot = () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="11" fill="#3B82F6" fill-opacity="0.22"/>
        <circle cx="12" cy="12" r="6" fill="#3B82F6" stroke="#ffffff" stroke-width="2.5"/>
    </svg>`;
    const icon = { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg) };
    if (window.google?.maps?.Size) icon.scaledSize = new window.google.maps.Size(24, 24);
    if (window.google?.maps?.Point) icon.anchor = new window.google.maps.Point(12, 12);
    return icon;
};

const hasCoords = (c) => c && typeof c.lat === "number" && typeof c.lng === "number";

// Short relative label for the availability pill's "Updated …" hint.
const relAvail = (ts) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 45) return "just now";
    const m = Math.floor(s / 60);
    return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
};

// Effective per-seat price for a ride: the distance-based SEGMENT fare when the
// passenger is dropping partway along the route (server-computed, in `_fare`),
// otherwise the driver's flat full-route price.
const effPerSeat = (ride) => {
    const f = ride && ride._fare;
    if (f && f.partial && Number.isFinite(Number(f.estimatedFare))) return Number(f.estimatedFare);
    return Number(ride && ride.pricePerPerson) || 0;
};
const isPartialFare = (ride) => Boolean(ride && ride._fare && ride._fare.partial);

// Match-score color tone for the 🎯 badge.
const matchTone = (score) => (score >= 90 ? "high" : score >= 75 ? "mid" : "low");

/* =======================================================
   Rides overview map (all pickups + selected route)
   ======================================================= */
function RidesMap({ rides, userLocation, selectedRide, onSelectRide, onLocate }) {
    const { isLoaded, loadError } = useMapsCtx();
    const mapRef = useRef(null);
    const [route, setRoute] = useState(null);
    // Leg from the user's current location → the selected ride's pickup, so the
    // passenger sees exactly how to reach the pickup + how far it is.
    const [toPickup, setToPickup] = useState(null); // { path, distanceText, durationText }
    const [locating, setLocating] = useState(false);

    // "My location" button — pan to the user's live position (like Google Maps).
    const locateMe = () => {
        if (!navigator.geolocation) return;
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setLocating(false);
                onLocate?.(loc);
                if (mapRef.current?.panTo) mapRef.current.panTo(loc);
                if (mapRef.current?.setZoom) mapRef.current.setZoom(14);
            },
            () => setLocating(false),
            { enableHighAccuracy: true, timeout: 15000 }
        );
    };

    // Fit bounds to either the selected ride's route, or all ride pickups.
    useEffect(() => {
        if (!isLoaded || !mapRef.current || !window.google) return;
        const bounds = new window.google.maps.LatLngBounds();
        let added = 0;

        if (selectedRide && hasCoords(selectedRide.sourceCoords) && hasCoords(selectedRide.destinationCoords)) {
            bounds.extend(selectedRide.sourceCoords);
            bounds.extend(selectedRide.destinationCoords);
            // Include the user so the "you → pickup" leg is in view too.
            if (hasCoords(userLocation)) { bounds.extend(userLocation); }
            added = 2;
        } else {
            rides.forEach((r) => {
                if (hasCoords(r.sourceCoords)) { bounds.extend(r.sourceCoords); added++; }
                if (hasCoords(r.destinationCoords)) { bounds.extend(r.destinationCoords); added++; }
            });
            if (hasCoords(userLocation)) { bounds.extend(userLocation); added++; }
        }

        if (added > 0) {
            const t = setTimeout(() => {
                if (mapRef.current?.fitBounds) {
                    mapRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
                    if (added === 1) mapRef.current.setZoom?.(14);
                }
            }, 80);
            return () => clearTimeout(t);
        }
    }, [isLoaded, rides, userLocation, selectedRide]);

    // Build the route polyline for the selected ride.
    useEffect(() => {
        if (!isLoaded || !window.google || !selectedRide ||
            !hasCoords(selectedRide.sourceCoords) || !hasCoords(selectedRide.destinationCoords)) {
            setRoute(null);
            return;
        }
        const svc = new window.google.maps.DirectionsService();
        svc.route(
            {
                origin: selectedRide.sourceCoords,
                destination: selectedRide.destinationCoords,
                travelMode: window.google.maps.TravelMode.DRIVING,
            },
            (result, status) => {
                if (status === window.google.maps.DirectionsStatus.OK && result?.routes?.[0]) {
                    const r = result.routes[0];
                    const path = Array.isArray(r.overview_path) && r.overview_path.length
                        ? r.overview_path
                        : (r.overview_polyline?.points && window.google.maps.geometry?.encoding
                            ? window.google.maps.geometry.encoding.decodePath(r.overview_polyline.points)
                            : null);
                    setRoute(path);
                } else {
                    setRoute(null);
                }
            }
        );
    }, [isLoaded, selectedRide]);

    // Build the "you → pickup" leg (how the passenger reaches the pickup point)
    // + its distance/time. Falls back to a straight dashed line if directions
    // aren't available.
    useEffect(() => {
        if (!isLoaded || !window.google || !selectedRide ||
            !hasCoords(userLocation) || !hasCoords(selectedRide.sourceCoords)) {
            setToPickup(null);
            return;
        }
        const km = haversineKm(userLocation, selectedRide.sourceCoords);
        const fallback = {
            path: [userLocation, selectedRide.sourceCoords],
            distanceText: `${km.toFixed(km < 10 ? 1 : 0)} km`,
            durationText: null,
        };
        const svc = new window.google.maps.DirectionsService();
        svc.route(
            {
                origin: userLocation,
                destination: selectedRide.sourceCoords,
                travelMode: window.google.maps.TravelMode.DRIVING,
            },
            (result, status) => {
                if (status === window.google.maps.DirectionsStatus.OK && result?.routes?.[0]) {
                    const r = result.routes[0];
                    const leg = r.legs?.[0];
                    const path = Array.isArray(r.overview_path) && r.overview_path.length
                        ? r.overview_path
                        : (r.overview_polyline?.points && window.google.maps.geometry?.encoding
                            ? window.google.maps.geometry.encoding.decodePath(r.overview_polyline.points)
                            : fallback.path);
                    setToPickup({
                        path,
                        distanceText: leg?.distance?.text || fallback.distanceText,
                        durationText: leg?.duration?.text || null,
                    });
                } else {
                    setToPickup(fallback);
                }
            }
        );
    }, [isLoaded, selectedRide, userLocation]);

    if (loadError) {
        return <div className="fr-map-msg">Map could not be loaded.</div>;
    }
    if (!isLoaded) {
        return (
            <div className="fr-map-msg">
                <span className="fr-spin" /> Loading map…
            </div>
        );
    }

    const center = hasCoords(userLocation)
        ? userLocation
        : (rides.find((r) => hasCoords(r.sourceCoords))?.sourceCoords || { lat: 22.3, lng: 73.18 });

    return (
        <>
        <GoogleMap
            onLoad={(map) => { mapRef.current = map; }}
            center={center}
            zoom={12}
            mapContainerStyle={{ width: "100%", height: "100%" }}
            options={{
                styles: DARK_MAP_STYLE,
                backgroundColor: "#0f0f10",
                disableDefaultUI: true,
                zoomControl: false,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false,
                rotateControl: false,
                keyboardShortcuts: false,
                gestureHandling: "greedy",
                clickableIcons: false,
            }}
        >
            {hasCoords(userLocation) && (
                <Marker position={userLocation} icon={userDot()} title="You" zIndex={5} />
            )}

            {rides.map((r) =>
                hasCoords(r.sourceCoords) ? (
                    <Marker
                        key={r._id}
                        position={r.sourceCoords}
                        icon={pinIcon(selectedRide?._id === r._id ? "#ffffff" : "#10B981", CAR_GLYPH)}
                        title={r.source}
                        onClick={() => onSelectRide(r)}
                        zIndex={selectedRide?._id === r._id ? 6 : 3}
                    />
                ) : null
            )}

            {selectedRide && hasCoords(selectedRide.destinationCoords) && (
                <Marker
                    position={selectedRide.destinationCoords}
                    icon={pinIcon("#EF4444", FLAG_GLYPH)}
                    title={selectedRide.destination}
                    zIndex={4}
                />
            )}

            {route && (
                <>
                    <Polyline path={route} options={{ strokeColor: "#ffffff", strokeOpacity: 0.22, strokeWeight: 11, zIndex: 1 }} />
                    <Polyline path={route} options={{ strokeColor: "#ffffff", strokeOpacity: 0.98, strokeWeight: 5, zIndex: 2 }} />
                </>
            )}

            {/* You → pickup leg (dashed blue), shown when a ride is selected. */}
            {toPickup?.path && window.google?.maps && (
                <Polyline
                    path={toPickup.path}
                    options={{
                        strokeColor: "#3B82F6",
                        strokeOpacity: 0,
                        zIndex: 3,
                        icons: [{
                            icon: { path: "M 0,-1 0,1", strokeOpacity: 0.95, strokeWeight: 3, scale: 3 },
                            offset: "0", repeat: "14px",
                        }],
                    }}
                />
            )}
        </GoogleMap>

        {/* Distance-to-pickup chip (top-left) when a ride is selected. */}
        {toPickup && (
            <div
                style={{
                    position: "absolute", left: "12px", top: "12px", zIndex: 6,
                    display: "inline-flex", alignItems: "center", gap: "0.4rem",
                    padding: "0.4rem 0.7rem", borderRadius: "999px",
                    background: "rgba(20,20,22,0.94)", border: "1px solid rgba(59,130,246,0.5)",
                    color: "#dbeafe", fontSize: "0.8rem", fontWeight: 700,
                    boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
                }}
            >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3B82F6" }} />
                {toPickup.distanceText} to pickup{toPickup.durationText ? ` · ${toPickup.durationText}` : ""}
            </div>
        )}
        {/* "My location" FAB (Google-Maps style, bottom-right) */}
        <button
            type="button"
            onClick={locateMe}
            aria-label="Show my location"
            title="Show my location"
            style={{
                position: "absolute", right: "12px", bottom: "34px", width: "46px", height: "46px",
                borderRadius: "50%", border: "1px solid rgba(255,255,255,0.3)",
                background: "rgba(20,20,22,0.96)", color: hasCoords(userLocation) ? "#4285F4" : "#f4f4f5",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", boxShadow: "0 6px 18px rgba(0,0,0,0.6)", zIndex: 5,
            }}
        >
            {locating ? (
                <span style={{ width: "18px", height: "18px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            ) : (
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3.2" /><line x1="12" y1="2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" />
                </svg>
            )}
        </button>
        </>
    );
}

/* ---------------- helpers ---------------- */
const fmtDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
const fmtTime = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};
const initials = (name = "") =>
    name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "U";

// Compact driver rating chip. Falls back to "New" when the driver has no
// reviews yet. `ratings.driver` is the denormalized aggregate from the API.
function DriverRating({ driver }) {
    const d = driver?.ratings?.driver;
    if (d && d.count > 0) {
        return (
            <span className="fr-rating" title={`${d.average} from ${d.count} review${d.count === 1 ? "" : "s"}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#facc15" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" /></svg>
                {d.average.toFixed(1)}
                <span style={{ color: "#9ca3af", fontWeight: 600, marginLeft: 2 }}>({d.count})</span>
            </span>
        );
    }
    return (
        <span className="fr-rating" title="No reviews yet">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#facc15" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" /></svg>
            New
        </span>
    );
}

/* ---------------- ride card ---------------- */
function RideCard({ ride, nearbyKm, selected, onSelect, onView }) {
    const driver = ride.user_id || {};
    const v = ride.vehicle_id || {};
    const nearby = formatNearby(nearbyKm);
    return (
        <article
            className={`fr-card${selected ? " selected" : ""}`}
            onClick={() => onSelect(ride)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(ride)}
        >
            <div className="fr-card-top">
                <div className="fr-driver">
                    {driver.profilePicture
                        ? <img className="fr-avatar" src={driver.profilePicture} alt={driver.name} />
                        : <span className="fr-avatar fr-avatar-fallback">{initials(driver.name)}</span>}
                    <div className="fr-driver-meta">
                        <span className="fr-driver-name">
                            {driver.name || "Driver"}
                            {driver.isDriverVerified && <span className="fr-verified-badge" title="Verified Driver">✅</span>}
                        </span>
                        <DriverRating driver={driver} />
                    </div>
                </div>
                {ride._match ? (
                    <span className={`fr-match ${matchTone(ride._match.score)}`} title={ride._match.reason}>🎯 {ride._match.score}%</span>
                ) : (nearby && <span className="fr-nearby">{nearby}</span>)}
            </div>

            {ride._match?.reason && (
                <div className="fr-match-reason">{ride._match.reason}</div>
            )}

            <div className="fr-route">
                <div className="fr-route-line">
                    <span className="fr-dot pickup" />
                    <span className="fr-route-text" title={ride.source}>{ride.source || "—"}</span>
                </div>
                <div className="fr-route-conn" />
                <div className="fr-route-line">
                    <span className="fr-dot drop" />
                    <span className="fr-route-text" title={ride.destination}>{ride.destination || "—"}</span>
                </div>
            </div>

            <div className="fr-meta-grid">
                <div className="fr-meta"><span className="fr-meta-k">Vehicle</span><span className="fr-meta-v">{v.make ? `${v.make} ${v.model}` : "—"}</span></div>
                <div className="fr-meta"><span className="fr-meta-k">Seats</span><span className="fr-meta-v">{ride.seatsAvailable} left</span></div>
                <div className="fr-meta"><span className="fr-meta-k">Date</span><span className="fr-meta-v">{fmtDate(ride.timing)}</span></div>
                <div className="fr-meta"><span className="fr-meta-k">Departs</span><span className="fr-meta-v">{fmtTime(ride.timing)}</span></div>
            </div>

            <div className="fr-card-foot">
                {isPartialFare(ride)
                    ? <span className="fr-price" title={`Full route ₹${ride._fare.fullPrice} · you ride ~${ride._fare.segmentKm} km`}>₹{effPerSeat(ride)} <span style={{ fontWeight: 600, fontSize: "0.7rem", opacity: 0.8 }}>for your trip</span></span>
                    : ride.pricePerPerson ? <span className="fr-price">₹{ride.pricePerPerson}/seat</span> : <span className="fr-price free">Free</span>}
                <button type="button" className="fr-view-btn" onClick={(e) => { e.stopPropagation(); onView(ride); }}>
                    View Ride
                </button>
            </div>
        </article>
    );
}

/* ---------------- Ride Details (dedicated full page) ---------------- */
function RideDetailsPage({ ride, nearbyKm, onClose, onBook, booking, phoneBlocked = false, onVerifyPhone }) {
    const driver = ride.user_id || {};
    const v = ride.vehicle_id || {};
    const nearby = formatNearby(nearbyKm);
    const max = Math.min(ride.seatsAvailable || 0, 4);
    const [seats, setSeats] = useState(max >= 1 ? 1 : 0);
    const [confirming, setConfirming] = useState(false);

    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && (confirming ? setConfirming(false) : onClose());
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose, confirming]);

    const memberSince = driver.createdAt
        ? new Date(driver.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })
        : null;
    const vehiclePhoto = Array.isArray(v.photos) && v.photos[0];
    const partial = isPartialFare(ride);
    const perSeat = effPerSeat(ride);
    const total = perSeat * seats;

    const seatOpts = [];
    for (let i = 1; i <= Math.max(1, max); i++) seatOpts.push({ value: String(i), label: `${i} seat${i > 1 ? "s" : ""}` });

    return (
        <div className="fr-detail-page">
            {/* Header */}
            <div className="fr-detail-head">
                <button className="fr-detail-back" onClick={onClose}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                    Back to results
                </button>
                <h1 className="fr-detail-title">Ride Details</h1>
            </div>

            <div className="fr-detail-grid">
                {/* LEFT: info */}
                <div className="fr-detail-main">
                    {/* Route map */}
                    {hasCoords(ride.sourceCoords) && hasCoords(ride.destinationCoords) ? (
                        <div className="fr-detail-map">
                            <LiveRideMap
                                sourceCoords={ride.sourceCoords}
                                destinationCoords={ride.destinationCoords}
                                source={ride.source}
                                destination={ride.destination}
                                pricePerPerson={ride.pricePerPerson}
                            />
                        </div>
                    ) : (
                        <div className="fr-panel">
                            <div className="fr-route">
                                <div className="fr-route-line"><span className="fr-dot pickup" /><span className="fr-route-text">{ride.source}</span></div>
                                <div className="fr-route-conn" />
                                <div className="fr-route-line"><span className="fr-dot drop" /><span className="fr-route-text">{ride.destination}</span></div>
                            </div>
                        </div>
                    )}

                    {/* Driver */}
                    <div className="fr-panel">
                        <h3 className="fr-panel-title">Driver</h3>
                        <div className="fr-sheet-driver" style={{ marginBottom: 0 }}>
                            {driver.profilePicture
                                ? <img className="fr-avatar lg" src={driver.profilePicture} alt={driver.name} />
                                : <span className="fr-avatar lg fr-avatar-fallback">{initials(driver.name)}</span>}
                            <div>
                                <div className="fr-driver-name lg">
                                    {driver.name || "Driver"}
                                    {driver.isDriverVerified && <span className="fr-verified-badge" title="Verified Driver">✅</span>}
                                </div>
                                <div className="fr-sheet-sub">
                                    <DriverRating driver={driver} />
                                    {memberSince ? ` · Member since ${memberSince}` : ""}
                                </div>
                                {driver.phoneNumber
                                    ? <div className="fr-sheet-sub">{driver.phoneNumber}</div>
                                    : <div className="fr-sheet-sub fr-contact-locked">🔒 Contact unlocks after you book</div>}
                            </div>
                        </div>
                    </div>

                    {/* Vehicle */}
                    <div className="fr-panel">
                        <h3 className="fr-panel-title">Vehicle</h3>
                        <div className="fr-vehicle-row">
                            <div className="fr-vehicle-img">
                                {vehiclePhoto
                                    ? <img src={vehiclePhoto} alt={`${v.make} ${v.model}`} />
                                    : <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" /></svg>}
                            </div>
                            <div className="fr-detail-stats">
                                <div className="fr-meta"><span className="fr-meta-k">Name</span><span className="fr-meta-v">{v.make || "—"}</span></div>
                                <div className="fr-meta"><span className="fr-meta-k">Model</span><span className="fr-meta-v">{v.model || "—"}</span></div>
                                <div className="fr-meta"><span className="fr-meta-k">Number</span><span className="fr-meta-v">{v.licensePlate || "—"}</span></div>
                                <div className="fr-meta"><span className="fr-meta-k">Type</span><span className="fr-meta-v">{v.vehicleType || "—"}</span></div>
                                <div className="fr-meta"><span className="fr-meta-k">Capacity</span><span className="fr-meta-v">{v.totalSeats ? `${v.totalSeats} seats` : "—"}</span></div>
                            </div>
                        </div>
                        {Array.isArray(v.amenities) && v.amenities.length > 0 && (
                            <div className="fr-amenities">{v.amenities.map((a) => <span key={a} className="fr-chip">{a}</span>)}</div>
                        )}
                    </div>

                    {/* Route + ride info */}
                    <div className="fr-panel">
                        <h3 className="fr-panel-title">Route & Schedule</h3>
                        <div className="fr-route" style={{ marginBottom: "0.9rem" }}>
                            <div className="fr-route-line"><span className="fr-dot pickup" /><span className="fr-route-text" title={ride.source}>{ride.source}</span></div>
                            <div className="fr-route-conn" />
                            <div className="fr-route-line"><span className="fr-dot drop" /><span className="fr-route-text" title={ride.destination}>{ride.destination}</span></div>
                        </div>
                        <div className="fr-detail-stats">
                            <div className="fr-meta"><span className="fr-meta-k">Date</span><span className="fr-meta-v">{fmtDate(ride.timing)}</span></div>
                            <div className="fr-meta"><span className="fr-meta-k">Departs</span><span className="fr-meta-v">{fmtTime(ride.timing)}</span></div>
                            <div className="fr-meta"><span className="fr-meta-k">Seats available</span><span className="fr-meta-v">{ride.seatsAvailable}</span></div>
                            {nearby && <div className="fr-meta"><span className="fr-meta-k">From you</span><span className="fr-meta-v">{nearby}</span></div>}
                        </div>
                    </div>
                </div>

                {/* RIGHT: booking card (sticky) */}
                <aside className="fr-booking-card">
                    <div className="fr-booking-price">
                        <span className="fr-booking-amount">{perSeat ? `₹${perSeat}` : "Free"}</span>
                        {perSeat ? <span className="fr-booking-unit">/ seat</span> : null}
                    </div>
                    {partial && (
                        <p className="fr-confirm-note" style={{ marginTop: "-0.4rem", marginBottom: "0.8rem", textAlign: "center" }}>
                            Distance-based fare for your stop (~{ride._fare.segmentKm} km of the {ride._fare.fullKm} km route). Full route is ₹{ride._fare.fullPrice}/seat.
                        </p>
                    )}

                    {ride.seatsAvailable > 0 ? (
                        <>
                            <div className="fr-booking-field">
                                <label className="fr-filter-label" htmlFor="fr-seat-qty">Seats required</label>
                                <ThemedSelect
                                    id="fr-seat-qty" theme="dark"
                                    value={String(seats)} onChange={(val) => setSeats(Number(val))}
                                    options={seatOpts} ariaLabel="Seats required"
                                />
                            </div>

                            <div className="fr-booking-summary">
                                <div className="fr-bs-row"><span>Selected seats</span><span>{seats}</span></div>
                                <div className="fr-bs-row"><span>Seats remaining</span><span>{ride.seatsAvailable}</span></div>
                                {perSeat ? (
                                    <div className="fr-bs-row total"><span>Total</span><span>₹{total}</span></div>
                                ) : (
                                    <div className="fr-bs-row total"><span>Total</span><span>Free</span></div>
                                )}
                            </div>

                            <button
                                className="fr-book-btn full"
                                disabled={booking || phoneBlocked || seats < 1 || seats > ride.seatsAvailable}
                                onClick={() => setConfirming(true)}
                                title={phoneBlocked ? "Verify your phone number to book a ride" : undefined}
                            >
                                {booking ? <><span className="fr-spin" /> Booking…</> : phoneBlocked ? "Verify phone to book" : "Book Ride"}
                            </button>
                            {phoneBlocked ? (
                                <p className="fr-confirm-note" style={{ textAlign: "center", marginTop: "0.6rem", marginBottom: 0 }}>
                                    📱 Verify your phone number to book.{" "}
                                    <button type="button" className="fr-linkbtn" onClick={() => onVerifyPhone?.()}>Verify now</button>
                                </p>
                            ) : (
                                <p className="fr-confirm-note" style={{ textAlign: "center", marginTop: "0.6rem", marginBottom: 0 }}>
                                    No payment now — you pay after the ride is completed. Free cancellation within 3 minutes.
                                </p>
                            )}
                        </>
                    ) : (
                        <div className="fr-booking-full">
                            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                            <p className="fr-empty-title" style={{ fontSize: "1rem" }}>This ride is full</p>
                            <p className="fr-empty-sub">No seats remaining. Try another ride.</p>
                        </div>
                    )}
                </aside>
            </div>

            {/* Confirmation modal */}
            {confirming && (
                <div className="fr-confirm-overlay" onMouseDown={(e) => e.target === e.currentTarget && !booking && setConfirming(false)}>
                    <div className="fr-confirm" role="dialog" aria-modal="true" aria-label="Confirm booking">
                        <h3 className="fr-confirm-title">Confirm booking?</h3>
                        <div className="fr-confirm-route">
                            <span className="fr-dot pickup" /> <span className="fr-confirm-route-text">{ride.source}</span>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 0.3rem" }}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                            <span className="fr-dot drop" /> <span className="fr-confirm-route-text">{ride.destination}</span>
                        </div>
                        <div className="fr-confirm-summary">
                            <div className="fr-meta"><span className="fr-meta-k">Driver</span><span className="fr-meta-v">{driver.name || "—"}</span></div>
                            <div className="fr-meta"><span className="fr-meta-k">Selected seats</span><span className="fr-meta-v">{seats}</span></div>
                            <div className="fr-meta"><span className="fr-meta-k">Date</span><span className="fr-meta-v">{fmtDate(ride.timing)}</span></div>
                            <div className="fr-meta"><span className="fr-meta-k">Time</span><span className="fr-meta-v">{fmtTime(ride.timing)}</span></div>
                            {perSeat ? <div className="fr-meta"><span className="fr-meta-k">Total</span><span className="fr-meta-v">₹{total}</span></div> : null}
                        </div>
                        <div className="fr-confirm-actions">
                            <button className="fr-btn ghost" onClick={() => setConfirming(false)} disabled={booking}>Cancel</button>
                            <button className="fr-book-btn" onClick={() => onBook(ride, seats)} disabled={booking || phoneBlocked}>
                                {booking ? <><span className="fr-spin" /> Booking…</> : "Confirm Booking"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ---------------- Booking success state ---------------- */
function BookingSuccess({ ride, seats, onViewBookings, onDone }) {
    const driver = ride.user_id || {};
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onDone();
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onDone]);
    return (
        <div className="fr-success-overlay">
            <div className="fr-success" role="dialog" aria-modal="true" aria-label="Booking confirmed">
                <div className="fr-success-badge">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#0a0a0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <h2 className="fr-success-title">🎉 Booking Confirmed</h2>
                <div className="fr-success-rows">
                    <div className="fr-bs-row"><span>Ride</span><span>{ride.source} → {ride.destination}</span></div>
                    <div className="fr-bs-row"><span>Driver</span><span>{driver.name || "—"}</span></div>
                    <div className="fr-bs-row"><span>Seats booked</span><span>{seats}</span></div>
                    <div className="fr-bs-row"><span>Date</span><span>{fmtDate(ride.timing)}</span></div>
                    <div className="fr-bs-row"><span>Time</span><span>{fmtTime(ride.timing)}</span></div>
                </div>
                <div className="fr-success-actions">
                    <button className="fr-btn ghost" onClick={onDone}>Back to Search</button>
                    <button className="fr-btn" onClick={onViewBookings}>View My Bookings</button>
                </div>
            </div>
        </div>
    );
}

/* =======================================================
   FindRides (main)
   ======================================================= */
// ---- Day grouping: present results as "what's available on which day" ----
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dayLabelFor = (iso) => {
    if (!iso) return "Date not set";
    const d = new Date(iso);
    if (isNaN(d)) return "Date not set";
    const diffDays = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};
const groupRidesByDay = (list) => {
    const map = new Map();
    for (const r of list) {
        const d = r.timing ? new Date(r.timing) : null;
        const valid = d && !isNaN(d);
        const key = valid ? d.toISOString().slice(0, 10) : "unknown";
        if (!map.has(key)) map.set(key, { key, ts: valid ? startOfDay(d).getTime() : Infinity, rides: [] });
        map.get(key).rides.push(r);
    }
    return [...map.values()].sort((a, b) => a.ts - b.ts);
};

const FindRidesInner = ({ onOpenSidebar, onNavigate, user }) => {
    const [filters, setFilters] = useState({
        source: "", sourceCoords: null,
        destination: "", destinationCoords: null,
        date: "", seats: "", vehicleType: "Any", gender: "Any",
    });
    const [rides, setRides] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [viewMode, setViewMode] = useState("split"); // split | list | map
    const [sortBy, setSortBy] = useState("earliest");   // nearest | earliest | seats
    const [userLocation, setUserLocation] = useState(null);
    const [selectedRide, setSelectedRide] = useState(null);
    const [detailsRide, setDetailsRide] = useState(null);
    const [bookingId, setBookingId] = useState(null);
    const [success, setSuccess] = useState(null); // { ride, seats }
    // Payments. payConfig: { enabled, keyId }. checkout: { ride, seats, breakdown }.
    const [payConfig, setPayConfig] = useState({ enabled: false });
    const [checkout, setCheckout] = useState(null);
    const [paying, setPaying] = useState(false);
    const [paySuccess, setPaySuccess] = useState(null); // { payment, ride }
    const [payFailure, setPayFailure] = useState(null);  // { reason, ride, seats }
    const [receiptId, setReceiptId] = useState(null);
    // Results anchor — lets us bring the rides into view after a search so
    // first-time users on mobile (where the form fills the screen) don't miss
    // the results sitting below the fold.
    const resultsRef = useRef(null);
    // Live availability pill — shows how many rides actually match the user's
    // ROUTE (same logic as search). Hidden until a destination is entered.
    const [avail, setAvail] = useState({ count: null, needsRoute: true, updatedAt: null, loading: true });

    // Phone-verification gate — disables the Book/Confirm buttons in the UI when
    // enforced and the user hasn't verified their phone (backend still enforces).
    const { blocked: phoneBlocked } = usePhoneGate();

    const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

    // Swap the From/To fields (and their coordinates).
    const swapEnds = () => setFilters((f) => ({
        ...f,
        source: f.destination, destination: f.source,
        sourceCoords: f.destinationCoords, destinationCoords: f.sourceCoords,
    }));

    // No rides found → hand the user's entered pickup/drop over to the Request
    // Ride page so they don't have to re-type them (PersonalRide reads this).
    const goRequestRide = () => {
        try {
            localStorage.setItem("rs_request_prefill", JSON.stringify({
                source: filters.source, sourceCoords: filters.sourceCoords,
                destination: filters.destination, destinationCoords: filters.destinationCoords,
                ts: Date.now(),
            }));
        } catch { /* ignore */ }
        onNavigate?.("requestRide");
    };

    // Load payment config once (whether online payments are enabled).
    useEffect(() => {
        let active = true;
        getPaymentConfig()
            .then(({ data }) => { if (active) setPayConfig(data || { enabled: false }); })
            .catch(() => { if (active) setPayConfig({ enabled: false }); });
        return () => { active = false; };
    }, []);

    // Live route-match count. Runs only once a destination is entered, using
    // the same matching as search, so it can never contradict the results.
    // Refreshes on route change (debounced) + every 60s. Never blocks the page.
    const srcLat = filters.sourceCoords?.lat ?? null;
    const srcLng = filters.sourceCoords?.lng ?? null;
    const dstLat = filters.destinationCoords?.lat ?? null;
    const dstLng = filters.destinationCoords?.lng ?? null;
    const destText = (filters.destination || "").trim();
    const fetchAvail = useCallback(async () => {
        // No destination yet → nothing meaningful to count; hide the pill.
        if (dstLat == null && !destText) {
            setAvail({ count: null, needsRoute: true, updatedAt: null, loading: false });
            return;
        }
        try {
            const params = {};
            if (srcLat != null && srcLng != null) { params.sourceLat = srcLat; params.sourceLng = srcLng; }
            if (dstLat != null && dstLng != null) { params.destLat = dstLat; params.destLng = dstLng; }
            if (destText) params.destination = destText;
            const { data } = await axiosInstance.get(`${API_BASE_URL}/rides/available-count`, { params });
            if (data?.needsRoute) {
                setAvail({ count: null, needsRoute: true, updatedAt: null, loading: false });
                return;
            }
            setAvail({ count: data?.count ?? 0, needsRoute: false, updatedAt: Date.now(), loading: false });
        } catch {
            setAvail((a) => ({ ...a, loading: false }));
        }
    }, [srcLat, srcLng, dstLat, dstLng, destText]);

    useEffect(() => {
        // Debounce so typing a destination doesn't spam the endpoint.
        const t = setTimeout(fetchAvail, 350);
        const iv = setInterval(fetchAvail, 60000);
        return () => { clearTimeout(t); clearInterval(iv); };
    }, [fetchAvail]);

    // Center the map on the user's real location on load (best-effort). Without
    // this the map falls back to a fixed Vadodara center; with it, the map opens
    // wherever the user actually is (like Uber/Google Maps). Silent if the user
    // denies the permission.
    useEffect(() => {
        if (!("geolocation" in navigator)) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => { /* denied/unavailable — keep the ride-based/default center */ },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    }, []);

    // One-tap prefill bridge from the homepage smart suggestions: prefill the
    // search fields and auto-run the search once. Mirrors the CREATE_PREFILL_KEY
    // pattern; purely additive.
    const [autoSearch, setAutoSearch] = useState(false);
    useEffect(() => {
        try {
            const raw = localStorage.getItem("rs_find_prefill");
            if (!raw) return;
            localStorage.removeItem("rs_find_prefill");
            const p = JSON.parse(raw);
            if (p.ts && Date.now() - p.ts > 5 * 60 * 1000) return;
            setFilters((f) => ({
                ...f,
                destination: p.destination || f.destination,
                destinationCoords: p.destinationCoords || f.destinationCoords,
                source: p.source || f.source,
                sourceCoords: p.sourceCoords || f.sourceCoords,
            }));
            if (p.destination) setAutoSearch(true);
        } catch { /* ignore */ }
    }, []);

    const doSearch = useCallback(async (e) => {
        if (e) e.preventDefault();
        if (!filters.destination.trim()) {
            toast.info("Enter a destination to search.");
            return;
        }
        setLoading(true);
        setSearched(true);
        setSelectedRide(null);
        // Record for Smart Suggestions (fire-and-forget; never blocks search).
        recordSearch(
            { label: filters.source || "", lat: filters.sourceCoords?.lat, lng: filters.sourceCoords?.lng },
            { label: filters.destination || "", lat: filters.destinationCoords?.lat, lng: filters.destinationCoords?.lng }
        );
        try {
            const params = { destination: filters.destination, gender_preference: filters.gender };
            if (filters.date) params.timing = filters.date;
            // Smart Route Matching: include coordinates when available so the
            // backend can match by route overlap / nearby destinations.
            if (filters.destinationCoords?.lat != null) {
                params.destLat = filters.destinationCoords.lat;
                params.destLng = filters.destinationCoords.lng;
            }
            if (filters.sourceCoords?.lat != null) {
                params.sourceLat = filters.sourceCoords.lat;
                params.sourceLng = filters.sourceCoords.lng;
            }
            const res = await axiosInstance.get(`${API_BASE_URL}/rides`, { params });
            const list = Array.isArray(res.data) ? res.data : [];
            setRides(list);
            // If the backend returned smart-match metadata, sort by best match.
            if (list.some((r) => r._match)) setSortBy("match");
            // Let the user know rides exist (they may be below the fold), then
            // bring them into view on narrow screens where the form fills the
            // viewport. No-op on desktop split view (results already visible).
            if (list.length > 0) {
                toast.success(`${list.length} ride${list.length !== 1 ? "s" : ""} available on this route`, { autoClose: 3000 });
                // Bring the RESULTS LIST into view after a search. Previously this
                // only ran on narrow screens, and on stacked layouts the map sits
                // between the form and the list — so users landed on the map
                // instead of the rides. Always scroll to the results list.
                if (typeof window !== "undefined") {
                    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
                }
            }
        } catch (error) {
            if (error.response?.status === 404) {
                setRides([]);
            } else {
                toast.error(error.response?.data?.message || "Failed to search rides.");
                setRides([]);
            }
        } finally {
            setLoading(false);
        }
    }, [filters.destination, filters.gender, filters.date, filters.sourceCoords, filters.destinationCoords]);

    // Auto-run the search once when arriving via a homepage one-tap prefill.
    useEffect(() => {
        if (autoSearch && filters.destination) {
            setAutoSearch(false);
            doSearch();
        }
    }, [autoSearch, filters.destination, doSearch]);

    const handleUseCurrentLocation = ({ coords, address }) => {
        setUserLocation(coords);
        setFilters((f) => ({ ...f, source: address || f.source, sourceCoords: coords }));
    };

    const clearFilters = () => {
        setFilters({ source: "", sourceCoords: null, destination: "", destinationCoords: null, date: "", seats: "", vehicleType: "Any", gender: "Any" });
        setRides([]);
        setSearched(false);
        setSelectedRide(null);
    };

    // Booking now ONLY reserves the seat — payment happens AFTER the ride is
    // completed (unified pay-after-completion model). The segment fare is locked
    // server-side from the passenger's drop-off (their searched destination).
    const directBook = async (ride, seats = 1) => {
        setBookingId(ride._id);
        try {
            const dropCoords = filters.destinationCoords || null;
            await axiosInstance.post(`${API_BASE_URL}/rides/book/${ride._id}`, { seats, dropCoords });
            setSuccess({ ride, seats });
            setDetailsRide(null);
            doSearch();
        } catch (error) {
            // 402 = the user has a completed ride they haven't paid for yet.
            if (error.response?.status === 402) {
                toast.error(error.response.data?.message || "Please pay for your last completed ride first.", { autoClose: 6000 });
            } else if (error.response?.data?.code === "PHONE_VERIFICATION_REQUIRED") {
                toast.info("📱 Please verify your phone number to book a ride.", { autoClose: 5000 });
                setTimeout(() => onNavigate?.("profile"), 1400);
            } else {
                toast.error(error.response?.data?.message || "Failed to book ride.");
            }
        } finally {
            setBookingId(null);
        }
    };

    // Entry point from the Ride Details "Book Ride" button. Always reserves the
    // seat with no upfront charge — the passenger pays once the ride is done.
    const bookRide = async (ride, seats = 1) => {
        await directBook(ride, seats);
    };

    // Runs the Razorpay pay→verify flow for the active checkout.
    const runPayment = async () => {
        if (!checkout) return;
        const { ride, seats } = checkout;
        setPaying(true);
        try {
            // Pass the passenger's searched destination so the server charges the
            // distance-based segment fare (partial ride), recomputed authoritatively.
            const dropCoords = isPartialFare(ride) ? filters.destinationCoords : null;
            const result = await payForRide({ rideId: ride._id, seats, user: user || {}, dropCoords });
            setCheckout(null);
            setDetailsRide(null);
            setPaySuccess({ payment: result.payment, ride: result.ride || ride });
            doSearch();
        } catch (err) {
            setCheckout(null);
            // Dismissing the modal is a soft cancel — just close quietly.
            if (err?.code === "dismissed") {
                toast.info("Payment cancelled.");
            } else {
                setPayFailure({ reason: err?.message || "Payment failed", ride, seats });
            }
        } finally {
            setPaying(false);
        }
    };

    // Origin used for "distance away": user location, else searched source coords.
    const originForNearby = userLocation || filters.sourceCoords;
    const nearbyFor = (ride) =>
        originForNearby && hasCoords(ride.sourceCoords)
            ? haversineKm(originForNearby, ride.sourceCoords)
            : null;

    // Client-side filters (backend handles destination/gender/date).
    let visible = rides.filter((r) => {
        if (filters.seats && r.seatsAvailable < Number(filters.seats)) return false;
        if (filters.vehicleType !== "Any" && r.vehicle_id?.vehicleType !== filters.vehicleType) return false;
        return true;
    });

    // Sorting.
    visible = [...visible].sort((a, b) => {
        if (sortBy === "match") return (b._match?.score || 0) - (a._match?.score || 0);
        if (sortBy === "seats") return (b.seatsAvailable || 0) - (a.seatsAvailable || 0);
        if (sortBy === "nearest") {
            const da = nearbyFor(a), db = nearbyFor(b);
            if (da == null && db == null) return 0;
            if (da == null) return 1;
            if (db == null) return -1;
            return da - db;
        }
        // earliest departure
        return new Date(a.timing) - new Date(b.timing);
    });

    const sortOptions = [
        { value: "match", label: "🎯 Best match" },
        { value: "earliest", label: "Earliest departure" },
        { value: "nearest", label: "Nearest first" },
        { value: "seats", label: "Most seats" },
    ];

    const resultsPanel = (
        <div className="fr-results" ref={resultsRef}>
            <div className="fr-results-head">
                <span className="fr-results-title">Available Rides</span>
                <div className="fr-results-right">
                    <span className="fr-results-count">
                        {loading ? "Searching…" : searched ? `${visible.length} ride${visible.length !== 1 ? "s" : ""} found` : "Search to see rides"}
                    </span>
                    {searched && visible.length > 0 && (
                        <div className="fr-sort">
                            <label className="fr-sort-label" htmlFor="fr-sort">Sort</label>
                            <ThemedSelect id="fr-sort" theme="dark" value={sortBy} onChange={setSortBy} options={sortOptions} ariaLabel="Sort rides" />
                        </div>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="fr-skeletons">
                    <div className="fr-skeleton" /><div className="fr-skeleton" /><div className="fr-skeleton" />
                </div>
            ) : !searched ? (
                <div className="fr-empty">
                    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    <p className="fr-empty-title">Find your next ride</p>
                    <p className="fr-empty-sub">Enter a destination and search to discover rides shared by fellow members.</p>
                </div>
            ) : visible.length === 0 ? (
                <div className="fr-empty">
                    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M8 15s1.5-2 4-2 4 2 4 2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
                    <p className="fr-empty-title">No rides found</p>
                    <p className="fr-empty-sub">No rides match this route yet. Request a ride and we'll alert nearby drivers to create one for you.</p>
                    <div className="fr-empty-actions">
                        <button className="fr-req-cta" onClick={goRequestRide}>🚗 Request a Ride</button>
                    </div>
                    <div className="fr-empty-actions" style={{ marginTop: "0.5rem" }}>
                        <button className="fr-btn ghost" onClick={clearFilters}>Clear Filters</button>
                        <button className="fr-btn ghost" onClick={() => document.getElementById("fr-destination")?.focus?.()}>Modify Search</button>
                    </div>
                </div>
            ) : (
                <div className="fr-day-groups">
                    {groupRidesByDay(visible).map((g) => (
                        <div className="fr-day-group" key={g.key}>
                            <div className="fr-day-head">
                                <span className="fr-day-label">{dayLabelFor(g.rides[0].timing)}</span>
                                <span className="fr-day-count">{g.rides.length} ride{g.rides.length !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="fr-card-list">
                                {g.rides.map((r) => (
                                    <RideCard
                                        key={r._id}
                                        ride={r}
                                        nearbyKm={nearbyFor(r)}
                                        selected={selectedRide?._id === r._id}
                                        onSelect={setSelectedRide}
                                        onView={setDetailsRide}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const mapPanel = (
        <div className="fr-mapcol">
            <div className="fr-panel-head"><span className="fr-panel-title2">Search on Map</span></div>
            <div className="fr-map">
                <RidesMap rides={visible} userLocation={userLocation} selectedRide={selectedRide} onSelectRide={setSelectedRide} onLocate={setUserLocation} />
            </div>
        </div>
    );

    // Dedicated Ride Details page (replaces the results view while open).
    if (detailsRide) {
        return (
            <div className="fr-root">
                <RideDetailsPage
                    ride={detailsRide}
                    nearbyKm={nearbyFor(detailsRide)}
                    onClose={() => setDetailsRide(null)}
                    onBook={bookRide}
                    booking={bookingId === detailsRide._id}
                    phoneBlocked={phoneBlocked}
                    onVerifyPhone={() => onNavigate?.("profile")}
                />
                {success && (
                    <BookingSuccess
                        ride={success.ride}
                        seats={success.seats}
                        onViewBookings={() => { setSuccess(null); onNavigate?.("myBookings"); }}
                        onDone={() => { setSuccess(null); setDetailsRide(null); }}
                    />
                )}
                {checkout && (
                    <CheckoutModal
                        ride={checkout.ride}
                        seats={checkout.seats}
                        breakdown={checkout.breakdown}
                        busy={paying}
                        onPay={runPayment}
                        onClose={() => !paying && setCheckout(null)}
                    />
                )}
                {paySuccess && (
                    <PaymentSuccess
                        payment={paySuccess.payment}
                        ride={paySuccess.ride}
                        onViewBooking={() => { setPaySuccess(null); onNavigate?.("myBookings"); }}
                        onReceipt={() => setReceiptId(paySuccess.payment?._id)}
                        onDone={() => { setPaySuccess(null); setDetailsRide(null); }}
                    />
                )}
                {payFailure && (
                    <PaymentFailure
                        reason={payFailure.reason}
                        onRetry={() => { const f = payFailure; setPayFailure(null); bookRide(f.ride, f.seats); }}
                        onClose={() => setPayFailure(null)}
                    />
                )}
                {receiptId && (
                    <ReceiptModal paymentId={receiptId} onClose={() => setReceiptId(null)} />
                )}
            </div>
        );
    }

    return (
        <div className="fr-root">
            {/* Top bar */}
            <div className="fr-topbar">
                {onOpenSidebar && (
                    <button type="button" className="fr-hamburger" onClick={onOpenSidebar} aria-label="Open menu">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                    </button>
                )}
                <div className="fr-heading">
                    <h1 className="fr-page-title">Find a Ride</h1>
                    <p className="fr-subtitle">Search, compare and book rides from fellow members</p>
                </div>
                <div className="fr-viewtoggle" role="tablist" aria-label="View mode">
                    {[["split", "Split"], ["list", "List"], ["map", "Map"]].map(([v, label]) => (
                        <button key={v} className={`fr-vt-btn${viewMode === v ? " active" : ""}`} onClick={() => setViewMode(v)} role="tab" aria-selected={viewMode === v}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Phone verification banner (only when enforced) */}
            <PhoneVerifyBanner action="book a ride" onNavigate={onNavigate} />

            {/* Search + filters */}
            <form className="fr-searchbar" onSubmit={doSearch}>
                <div className="fr-search-row">
                    <div className="fr-search-loc">
                        <LocationSearchBox
                            label="Source"
                            placeholder="Your starting point"
                            value={filters.source}
                            onChange={(v) => setF("source", v)}
                            onCoordinatesChange={(c) => { setF("sourceCoords", c); if (c) setUserLocation(c); }}
                            isSource
                        />
                        <div className="fr-currentloc">
                            <CurrentLocationButton onLocate={handleUseCurrentLocation} />
                        </div>
                    </div>
                    <button type="button" className="fr-swap" onClick={swapEnds} title="Swap pickup and destination" aria-label="Swap pickup and destination">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                    </button>
                    <div className="fr-search-loc">
                        <LocationSearchBox
                            label="Destination"
                            placeholder="Where do you want to go?"
                            value={filters.destination}
                            onChange={(v) => setF("destination", v)}
                            onCoordinatesChange={(c) => setF("destinationCoords", c)}
                        />
                    </div>
                </div>

                {/* Live availability for the entered ROUTE (same logic as search).
                    Hidden until a destination is given so it never shows a
                    misleading count for an unrelated route. */}
                {!avail.loading && !avail.needsRoute && avail.count != null && (
                    <div className={`fr-avail${avail.count > 0 ? " has" : " none"}`} aria-live="polite">
                        <span className="fr-avail-main">
                            {avail.count > 0 ? (
                                <>
                                    <span className="fr-avail-dot" />
                                    {avail.count} ride{avail.count !== 1 ? "s" : ""} available on this route
                                </>
                            ) : (
                                <>🚗 No rides on this route yet</>
                            )}
                        </span>
                        {avail.updatedAt && <span className="fr-avail-time">Updated {relAvail(avail.updatedAt)}</span>}
                    </div>
                )}

                {/* Just source + destination → search. Results are grouped by the
                    day they're available, so no seat/vehicle/gender/date filters
                    are needed to find a ride. */}
                <div className="fr-search-actions">
                    <button type="submit" className="fr-search-btn" disabled={loading}>
                        {loading ? <span className="fr-spin" /> : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                        )}
                        Search rides
                    </button>
                </div>
            </form>

            {/* Body: split / list / map */}
            <div className={`fr-body view-${viewMode}`}>
                {viewMode !== "list" && mapPanel}
                {viewMode !== "map" && resultsPanel}
            </div>

            {/* Feature strip */}
            <div className="fr-features">
                <div className="fr-feature">
                    <span className="fr-feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg></span>
                    <div className="fr-feature-text">
                        <span className="fr-feature-title">Verified Members</span>
                        <span className="fr-feature-sub">All members are verified for your safety</span>
                    </div>
                </div>
                <div className="fr-feature">
                    <span className="fr-feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></span>
                    <div className="fr-feature-text">
                        <span className="fr-feature-title">Secure Payments</span>
                        <span className="fr-feature-sub">Safe and secure payment system</span>
                    </div>
                </div>
                <div className="fr-feature">
                    <span className="fr-feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></svg></span>
                    <div className="fr-feature-text">
                        <span className="fr-feature-title">Eco Friendly</span>
                        <span className="fr-feature-sub">Share rides and reduce carbon footprint</span>
                    </div>
                </div>
                <div className="fr-feature">
                    <span className="fr-feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><circle cx="17" cy="14" r="1.5" /></svg></span>
                    <div className="fr-feature-text">
                        <span className="fr-feature-title">Save Money</span>
                        <span className="fr-feature-sub">Affordable rides at student prices</span>
                    </div>
                </div>
            </div>

            {success && (
                <BookingSuccess
                    ride={success.ride}
                    seats={success.seats}
                    onViewBookings={() => { setSuccess(null); onNavigate?.("myBookings"); }}
                    onDone={() => setSuccess(null)}
                />
            )}
        </div>
    );
};

const FindRides = ({ onOpenSidebar, onNavigate, user }) => (
    <MapsProvider>
        <FindRidesInner onOpenSidebar={onOpenSidebar} onNavigate={onNavigate} user={user} />
    </MapsProvider>
);

export default FindRides;
