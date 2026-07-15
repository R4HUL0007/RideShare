import { useState, useEffect, useRef, useCallback } from "react";
import { GoogleMap, Marker, Polyline } from "@react-google-maps/api";
import axiosInstance from "../utils/axiosConfig";
import { toast } from "react-toastify";
import { API_BASE_URL } from "../utils/constants";
import { DARK_MAP_STYLE } from "../config/googleMapsConfig";
import { haversineKm } from "../utils/mapUtils";
import { getSocket, joinChat } from "../utils/socket";
import MapsProvider, { useMaps } from "./maps/MapsProvider";
import SosButton from "./safety/SosButton";
import RideVerificationPanel from "./RideVerificationPanel";
import { shareTrip } from "../services/safetyService";
import { payForRide, payRideCash } from "../services/paymentService";
import "../styles/rideTracking.css";

const hasCoords = (c) => c && typeof c.lat === "number" && typeof c.lng === "number" && Number.isFinite(c.lat) && Number.isFinite(c.lng);
const idStr = (v) => (v == null ? null : typeof v === "string" ? v : v._id ? v._id.toString() : v.toString());
const firstName = (n = "") => n.trim().split(/\s+/)[0] || "Driver";
const initials = (n = "") => n.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "U";

// Human label + ordered step index for each tracking state.
const STATE_FLOW = ["scheduled", "enroute", "arriving", "arrived", "in_progress", "completed"];
const STATE_LABEL = {
    scheduled: "Scheduled",
    enroute: "Driver En Route",
    arriving: "Driver Arriving",
    arrived: "Driver Arrived",
    in_progress: "Ride In Progress",
    completed: "Ride Completed",
};

// Proximity thresholds (km).
const ARRIVING_KM = 1.0;
const ARRIVED_KM = 0.12;

/* ---------------- marker icons ---------------- */
const pin = (color, glyph) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 42 52"><defs><filter id="s" x="-30%" y="-20%" width="160%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.5)"/></filter></defs><path filter="url(#s)" fill="${color}" stroke="#fff" stroke-width="2.5" d="M21 3C12.7 3 6 9.7 6 18c0 10.5 13.2 24.6 14.1 25.6.5.5 1.3.5 1.8 0C22.8 42.6 36 28.5 36 18 36 9.7 29.3 3 21 3z"/><g fill="#fff" transform="translate(11 8)">${glyph}</g></svg>`;
    const icon = { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg) };
    if (window.google?.maps?.Size) icon.scaledSize = new window.google.maps.Size(36, 46);
    if (window.google?.maps?.Point) icon.anchor = new window.google.maps.Point(18, 42);
    return icon;
};
const CAR_GLYPH = '<path d="M3 11l1.5-4h11L17 11M4 11h12v4a1 1 0 0 1-1 1h-1a1.5 1.5 0 0 1-3 0H9a1.5 1.5 0 0 1-3 0H5a1 1 0 0 1-1-1z"/>';
const PIN_GLYPH = '<circle cx="10" cy="10" r="5" fill="#fff"/><circle cx="10" cy="10" r="2.4" fill="#10B981"/>';
const FLAG_GLYPH = '<path d="M5 4h11l-2.2 3.2L16 10.4H6.8V16H5z"/>';
const carIcon = () => pin("#3B82F6", CAR_GLYPH);
const pickupIcon = () => pin("#10B981", PIN_GLYPH);
const destIcon = () => pin("#EF4444", FLAG_GLYPH);

/* ---------------- live map ---------------- */
function TrackMap({ snapshot, driverLoc, routePath }) {
    const { isLoaded, loadError } = useMaps();
    const [mapRef, setMapRef] = useState(null);
    const src = snapshot.sourceCoords, dst = snapshot.destinationCoords;

    useEffect(() => {
        if (!isLoaded || !window.google || !mapRef) return;
        const b = new window.google.maps.LatLngBounds();
        let n = 0;
        [driverLoc, src, dst].forEach((c) => { if (hasCoords(c)) { b.extend(c); n++; } });
        if (n > 0) {
            const t = setTimeout(() => mapRef.fitBounds?.(b, { top: 70, right: 60, bottom: 70, left: 60 }), 80);
            return () => clearTimeout(t);
        }
    }, [isLoaded, mapRef, driverLoc, src, dst]);

    if (loadError) return <div className="rt-map-msg">Map could not be loaded.</div>;
    if (!isLoaded) return <div className="rt-map-msg"><span className="rt-spin" /> Loading map…</div>;

    const center = hasCoords(driverLoc) ? driverLoc : (hasCoords(src) ? src : { lat: 22.3, lng: 73.18 });
    return (
        <GoogleMap
            onLoad={setMapRef}
            center={center}
            zoom={13}
            mapContainerStyle={{ width: "100%", height: "100%" }}
            options={{ styles: DARK_MAP_STYLE, backgroundColor: "#0f0f10", disableDefaultUI: true, zoomControl: false, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, rotateControl: false, keyboardShortcuts: false, gestureHandling: "greedy", clickableIcons: false }}
        >
            {hasCoords(src) && <Marker position={src} icon={pickupIcon()} title="Pickup" zIndex={3} />}
            {hasCoords(dst) && <Marker position={dst} icon={destIcon()} title="Destination" zIndex={3} />}
            {hasCoords(driverLoc) && <Marker position={driverLoc} icon={carIcon()} title="Driver" zIndex={5} />}
            {routePath && routePath.length > 1 && (
                <>
                    <Polyline path={routePath} options={{ strokeColor: "#ffffff", strokeOpacity: 0.22, strokeWeight: 11, zIndex: 1 }} />
                    <Polyline path={routePath} options={{ strokeColor: "#ffffff", strokeOpacity: 0.98, strokeWeight: 5, zIndex: 2 }} />
                </>
            )}
        </GoogleMap>
    );
}

/* ---------------- status timeline ---------------- */
function StatusFlow({ state }) {
    const steps = [
        { key: "scheduled", label: "Scheduled" },
        { key: "enroute", label: "En Route" },
        { key: "arrived", label: "Arrived" },
        { key: "in_progress", label: "Started" },
        { key: "completed", label: "Completed" },
    ];
    const order = { scheduled: 0, enroute: 1, arriving: 1, arrived: 2, in_progress: 3, completed: 4 };
    const cur = order[state] ?? 0;
    return (
        <div className="rt-flow">
            {steps.map((s, i) => (
                <div key={s.key} className={`rt-flow-step${i <= cur ? " done" : ""}${i === cur ? " current" : ""}`}>
                    <span className="rt-flow-dot" />
                    <span className="rt-flow-label">{s.label}</span>
                </div>
            ))}
        </div>
    );
}

/* =======================================================
   RideTracking (main)
   ======================================================= */
function RideTrackingInner({ rideId, user, onClose }) {
    const { isLoaded } = useMaps();
    const [snapshot, setSnapshot] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [state, setState] = useState("scheduled");
    const [driverLoc, setDriverLoc] = useState(null);
    const [routePath, setRoutePath] = useState(null);
    const [eta, setEta] = useState(null);
    const [distance, setDistance] = useState(null);
    const [atDestination, setAtDestination] = useState(false);
    const [busy, setBusy] = useState(false);
    const [durationMin, setDurationMin] = useState(null);
    // Boarding verification: count of passengers verified + total roster size.
    const [verify, setVerify] = useState({ count: 0, total: 0 });
    // Post-completion settlement (fare/earnings) + local pay state so the
    // completion screen becomes the "pay + rate" moment (Uber-style).
    const [payState, setPayState] = useState(null); // null | "paying" | "paid"
    const settledRef = useRef(false);
    const watchIdRef = useRef(null);
    const userId = user?.id || user?._id;

    // Load the tracking snapshot.
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get(`${API_BASE_URL}/rides/${rideId}/tracking`);
            setSnapshot(res.data);
            setState(res.data.tracking?.state || "scheduled");
            if (hasCoords(res.data.tracking?.driverLocation)) setDriverLoc(res.data.tracking.driverLocation);
        } catch (err) {
            setError(err.response?.data?.message || "Couldn't load tracking.");
        } finally {
            setLoading(false);
        }
    }, [rideId]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { if (userId) joinChat(userId); }, [userId]);

    const isDriver = snapshot?.isDriver;

    // Refresh only the fare/settlement block (no loading flicker) — used when the
    // ride completes and after a payment so the completion screen stays accurate.
    const refreshSettlement = useCallback(async () => {
        try {
            const res = await axiosInstance.get(`${API_BASE_URL}/rides/${rideId}/tracking`);
            setSnapshot((prev) => (prev ? { ...prev, settlement: res.data.settlement } : prev));
        } catch { /* non-fatal */ }
    }, [rideId]);

    // When the ride flips to completed, pull the final settlement once.
    useEffect(() => {
        if (state === "completed" && !settledRef.current) {
            settledRef.current = true;
            refreshSettlement();
        }
    }, [state, refreshSettlement]);

    const settlement = snapshot?.settlement || {};
    const passengerOwes = !isDriver && settlement.role === "passenger"
        && settlement.paymentStatus !== "paid" && (settlement.fareAmount || 0) > 0
        && payState !== "paid";

    // Passenger: pay the completed-ride fare online (Razorpay), then rate/close.
    const payOnline = async () => {
        setPayState("paying");
        try {
            await payForRide({ rideId, seats: settlement.seats || 1, user });
            setPayState("paid");
            toast.success("Payment successful — thank you!");
            refreshSettlement();
        } catch (err) {
            setPayState(null);
            if (err?.code !== "dismissed") toast.error(err?.message || "Payment couldn't be completed.");
        }
    };

    // Passenger: settle in cash (paid in person to the driver).
    const payCash = async () => {
        setPayState("paying");
        try {
            await payRideCash(rideId);
            setPayState("paid");
            toast.success(`Please pay ₹${settlement.fareAmount} to your driver in cash.`);
            refreshSettlement();
        } catch (err) {
            setPayState(null);
            toast.error(err.response?.data?.message || "Couldn't mark cash payment.");
        }
    };

    // Passenger: subscribe to live location + status events.
    useEffect(() => {
        if (!snapshot || isDriver) return;
        const socket = getSocket();
        const onLoc = (p) => {
            if (idStr(p.rideId) !== idStr(rideId)) return;
            if (hasCoords(p.location)) setDriverLoc(p.location);
            if (p.state) setState(p.state);
            if (p.atDestination != null) setAtDestination(Boolean(p.atDestination));
            // Server-computed live metrics (pay-after lifecycle).
            if (p.remainingKm != null) setDistance(`${p.remainingKm} km`);
            if (p.etaMin != null) setEta(`${p.etaMin} min`);
        };
        const onStatus = (p) => {
            if (idStr(p.rideId) !== idStr(rideId)) return;
            if (p.state) setState(p.state);
            if (p.durationMin != null) setDurationMin(p.durationMin);
        };
        socket.on("ride:location", onLoc);
        socket.on("ride:status", onStatus);
        return () => { socket.off("ride:location", onLoc); socket.off("ride:status", onStatus); };
    }, [snapshot, isDriver, rideId]);

    // Driver: subscribe to STATUS changes too. If the passenger confirms arrival
    // (or auto-GPS completes) while the driver is still on this screen, the
    // driver must see the ride flip to "completed" instead of staying stuck on
    // "in progress" with a Complete button that now errors.
    useEffect(() => {
        if (!snapshot || !isDriver) return;
        const socket = getSocket();
        const onStatus = (p) => {
            if (idStr(p.rideId) !== idStr(rideId)) return;
            if (p.durationMin != null) setDurationMin(p.durationMin);
            if (p.state) setState(p.state);
            if (p.state === "completed") {
                stopSharing();
                toast.success("This ride has been completed.");
            }
        };
        socket.on("ride:status", onStatus);
        return () => socket.off("ride:status", onStatus);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [snapshot, isDriver, rideId]);

    // Recompute the route + ETA/distance whenever the driver position or the
    // active target (pickup before start, destination after) changes.
    useEffect(() => {
        if (!isLoaded || !window.google || !snapshot) return;
        const target = (state === "in_progress" || state === "completed") ? snapshot.destinationCoords : snapshot.sourceCoords;
        const origin = hasCoords(driverLoc) ? driverLoc : snapshot.sourceCoords;
        if (!hasCoords(origin) || !hasCoords(target)) {
            // Fallback: straight pickup→destination line if no driver loc yet.
            if (hasCoords(snapshot.sourceCoords) && hasCoords(snapshot.destinationCoords)) {
                drawRoute(snapshot.sourceCoords, snapshot.destinationCoords, false);
            }
            return;
        }
        drawRoute(origin, target, !isDriver); // passengers also get eta/distance from driver payloads
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, driverLoc, state, snapshot]);

    const drawRoute = (origin, target, skipMeta) => {
        const svc = new window.google.maps.DirectionsService();
        svc.route(
            { origin, destination: target, travelMode: window.google.maps.TravelMode.DRIVING },
            (result, status) => {
                if (status === window.google.maps.DirectionsStatus.OK && result?.routes?.[0]) {
                    const r = result.routes[0];
                    const path = Array.isArray(r.overview_path) && r.overview_path.length
                        ? r.overview_path
                        : (r.overview_polyline?.points && window.google.maps.geometry?.encoding
                            ? window.google.maps.geometry.encoding.decodePath(r.overview_polyline.points) : null);
                    setRoutePath(path);
                    const leg = r.legs?.[0];
                    if (leg && !skipMeta) {
                        setDistance(leg.distance?.text || null);
                        setEta(leg.duration?.text || null);
                    }
                }
            }
        );
    };

    // Driver: start ride + begin live location sharing.
    const startRide = async () => {
        setBusy(true);
        try {
            await axiosInstance.post(`${API_BASE_URL}/rides/${rideId}/tracking/start`, {});
            setState("in_progress");
            beginSharing();
            toast.success("Ride started — sharing your live location.");
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to start ride.");
        } finally { setBusy(false); }
    };

    const endRide = async (force = false) => {
        setBusy(true);
        try {
            // Send a fresh fix so the backend can validate destination proximity.
            const body = hasCoords(driverLoc) ? { lat: driverLoc.lat, lng: driverLoc.lng } : {};
            // Driver override: when GPS says the driver is far from the drop but
            // the driver confirms the trip has ended, bypass the proximity gate.
            if (force) body.force = true;
            const res = await axiosInstance.post(`${API_BASE_URL}/rides/${rideId}/tracking/end`, body);
            setState("completed");
            setDurationMin(res.data?.durationMin ?? null);
            stopSharing();
            toast.success("Ride completed.");
        } catch (err) {
            // Backend enforces destination/distance/duration — surface its message.
            toast.error(err.response?.data?.message || "Failed to end ride.");
        } finally { setBusy(false); }
    };

    // Driver taps Complete. If GPS says we're at the drop, complete normally;
    // otherwise ask for an explicit confirmation and force the completion so the
    // driver is never permanently stranded by an inaccurate/static GPS fix.
    const handleCompleteClick = () => {
        if (driverAtDest) { endRide(false); return; }
        const msg = destKm != null
            ? `You don't appear to be at the destination (about ${destKm.toFixed(1)} km away). Complete the ride anyway?`
            : "You don't appear to be at the destination. Complete the ride anyway?";
        if (window.confirm(msg)) endRide(true);
    };

    // Passenger GPS-fallback completion: confirm arrival → completes the ride.
    const confirmArrival = async () => {
        setBusy(true);
        try {
            const res = await axiosInstance.post(`${API_BASE_URL}/rides/${rideId}/tracking/arrived`, {});
            setState("completed");
            setDurationMin(res.data?.durationMin ?? null);
            toast.success("Arrival confirmed — ride completed.");
        } catch (err) {
            toast.error(err.response?.data?.message || "Couldn't confirm arrival.");
        } finally { setBusy(false); }
    };

    // Driver location sharing via geolocation watch.
    const beginSharing = () => {
        if (!("geolocation" in navigator) || watchIdRef.current != null) return;
        watchIdRef.current = navigator.geolocation.watchPosition(
            async (pos) => {
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setDriverLoc(loc);
                // Derive a pre-start proximity state from distance to pickup.
                let derived;
                if (state !== "in_progress" && state !== "completed" && hasCoords(snapshot?.sourceCoords)) {
                    const km = haversineKm(loc, snapshot.sourceCoords);
                    if (km != null) derived = km <= ARRIVED_KM ? "arrived" : km <= ARRIVING_KM ? "arriving" : "enroute";
                }
                try {
                    await axiosInstance.post(`${API_BASE_URL}/rides/${rideId}/tracking/location`, {
                        ...loc, state: derived, eta, distance,
                    });
                    if (derived) setState((s) => (s === "in_progress" || s === "completed" ? s : derived));
                } catch { /* network hiccup — keep watching */ }
            },
            () => toast.info("Couldn't read your location. Check permissions."),
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
    };
    const stopSharing = () => {
        if (watchIdRef.current != null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
    };
    // If a driver re-opens an already in-progress ride, resume sharing.
    useEffect(() => {
        if (isDriver && state === "in_progress") beginSharing();
        return stopSharing;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDriver, state]);

    if (loading) {
        return (
            <div className="rt-root"><div className="rt-center"><span className="rt-spin lg" /><p>Loading live tracking…</p></div></div>
        );
    }
    if (error || !snapshot) {
        return (
            <div className="rt-root"><div className="rt-center">
                <p className="rt-err">{error || "Tracking unavailable."}</p>
                <button className="rt-btn ghost" onClick={onClose}>Go Back</button>
            </div></div>
        );
    }

    const driver = snapshot.driver || {};
    const vehicle = snapshot.vehicle || {};
    const completed = state === "completed";

    // Driver completion gate: allow only within ~150 m of the destination (or
    // when the ride has no destination coords — backend still validates).
    const hasDest = hasCoords(snapshot.destinationCoords);
    const destKm = (hasCoords(driverLoc) && hasDest) ? haversineKm(driverLoc, snapshot.destinationCoords) : null;
    const driverAtDest = !hasDest || (destKm != null && destKm <= 0.15);

    return (
        <div className="rt-root">
            {/* Top bar */}
            <div className="rt-topbar">
                <button className="rt-back" onClick={onClose} aria-label="Back">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                </button>
                <div className="rt-topbar-meta">
                    <h1 className="rt-title">Live Tracking</h1>
                    <span className="rt-route-text">{snapshot.source} → {snapshot.destination}</span>
                </div>
                {!completed && (
                    <div className="rt-safety-controls">
                        <button
                            className="rt-share-btn"
                            onClick={async () => {
                                try {
                                    const { data } = await shareTrip(rideId);
                                    if (navigator.share) {
                                        await navigator.share({ title: "Track my RidexShare trip", text: "Follow my ride live:", url: data.link }).catch(() => {});
                                    } else {
                                        await navigator.clipboard?.writeText(data.link);
                                        toast.success("Tracking link copied — share it with someone you trust.");
                                    }
                                } catch (e) {
                                    toast.error(e.response?.data?.message || "Couldn't create share link");
                                }
                            }}
                            title="Share my trip"
                        >
                            📍 Share
                        </button>
                        {/* SOS is only meaningful once the ride is actually in progress —
                            showing it while scheduled/arriving invites accidental or
                            abusive triggers, so it's gated to the started state. */}
                        {state === "in_progress" && <SosButton rideId={rideId} compact />}
                    </div>
                )}
                <span className={`rt-state-badge ${state}`}>{STATE_LABEL[state]}</span>
            </div>

            {/* Map */}
            <div className="rt-map">
                <TrackMap snapshot={snapshot} driverLoc={driverLoc} routePath={routePath} />
                {!completed && (
                    <div className="rt-eta-overlay">
                        <div className="rt-eta-item"><span className="rt-eta-k">ETA</span><span className="rt-eta-v">{eta || "—"}</span></div>
                        <span className="rt-eta-sep" />
                        <div className="rt-eta-item"><span className="rt-eta-k">Distance</span><span className="rt-eta-v">{distance || "—"}</span></div>
                    </div>
                )}
            </div>

            {/* Bottom sheet */}
            <div className="rt-sheet">
                {completed ? (
                    <div className="rt-complete">
                        <div className="rt-complete-badge">
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0a0a0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        </div>
                        <h2 className="rt-complete-title">🎉 Ride Completed</h2>
                        <div className="rt-complete-rows">
                            <div className="rt-cr"><span>Route</span><span>{snapshot.source} → {snapshot.destination}</span></div>
                            {distance && <div className="rt-cr"><span>Distance</span><span>{distance}</span></div>}
                            {durationMin != null && <div className="rt-cr"><span>Duration</span><span>{durationMin} min</span></div>}
                        </div>

                        {/* Passenger — pay right here (Uber-style trip-end payment) */}
                        {passengerOwes && (
                            <div className="rt-pay">
                                <div className="rt-pay-amount">Amount to pay <strong>₹{settlement.fareAmount}</strong></div>
                                <div className="rt-pay-break">Fare ₹{settlement.fareAmount} · platform fee ₹{settlement.platformFee} included</div>
                                <button className="rt-btn success" onClick={payOnline} disabled={payState === "paying"}>
                                    {payState === "paying" ? <span className="rt-spin" /> : "💳"} Pay ₹{settlement.fareAmount} online
                                </button>
                                <button className="rt-btn" onClick={payCash} disabled={payState === "paying"}>💵 Pay with cash</button>
                                <p className="rt-hint" style={{ marginTop: "0.35rem" }}>Please settle the fare to finish — choose online or cash above.</p>
                            </div>
                        )}

                        {/* Passenger — already settled */}
                        {!isDriver && settlement.role === "passenger" && !passengerOwes && (
                            (payState === "paid" || settlement.paymentStatus === "paid") ? (
                                <p className="rt-pay-done">✅ Payment complete{settlement.paymentMethod === "cash" ? " (cash)" : ""}. Thanks for riding!</p>
                            ) : (
                                <p className="rt-pay-done">✅ This was a free ride. Thanks for riding!</p>
                            )
                        )}

                        {/* Driver — earnings summary (info only; drivers receive money) */}
                        {isDriver && settlement.role === "driver" && (settlement.gross || 0) > 0 && (
                            <div className="rt-earn">
                                <div className="rt-earn-amount">You earned <strong>₹{settlement.driverEarnings}</strong></div>
                                <div className="rt-pay-break">From ₹{settlement.gross} fare · after {settlement.commissionPercent}% platform fee</div>
                                <p className="rt-hint" style={{ marginTop: "0.35rem" }}>
                                    {(settlement.pendingAmount || 0) > 0
                                        ? `₹${settlement.pendingAmount} is still pending from passengers — once they pay (online → escrow, or cash in person) it's added to your earnings.`
                                        : "All passenger payments are in. Track payouts in Earnings."}
                                </p>
                            </div>
                        )}

                        {/* Done is only offered once there's nothing left to pay —
                            removing the "pay later" escape so fares get settled. */}
                        {!passengerOwes && <button className="rt-btn" onClick={onClose}>Done</button>}
                    </div>
                ) : (
                    <>
                        <StatusFlow state={state} />

                        <div className="rt-info">
                            <span className="rt-avatar">
                                {driver.profilePicture ? <img src={driver.profilePicture} alt={driver.name} /> : <span className="rt-avatar-fallback">{initials(driver.name)}</span>}
                            </span>
                            <div className="rt-info-meta">
                                <span className="rt-info-name">{firstName(driver.name)}{isDriver ? " (You)" : ""}</span>
                                <span className="rt-info-sub">
                                    {vehicle.make ? `${vehicle.make} ${vehicle.model}` : "Vehicle"}{vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}
                                </span>
                            </div>
                            {!isDriver && driver.phoneNumber && (
                                <a className="rt-call" href={`tel:${driver.phoneNumber}`} aria-label="Call driver">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                                </a>
                            )}
                        </div>

                        <div className="rt-stats">
                            <div className="rt-stat"><span className="rt-stat-k">Status</span><span className="rt-stat-v">{STATE_LABEL[state]}</span></div>
                            <div className="rt-stat"><span className="rt-stat-k">Distance left</span><span className="rt-stat-v">{distance || "—"}</span></div>
                            <div className="rt-stat"><span className="rt-stat-k">ETA</span><span className="rt-stat-v">{eta || "—"}</span></div>
                        </div>

                        {/* Ride Check-In & boarding verification */}
                        <RideVerificationPanel
                            rideId={rideId}
                            trackingState={state}
                            isDriver={isDriver}
                            onVerifiedChange={(count, total) => setVerify({ count, total: total ?? 0 })}
                        />

                        {isDriver ? (
                            <div className="rt-actions">
                                {state !== "in_progress" ? (
                                    <button className="rt-btn success" onClick={startRide} disabled={busy || (verify.total > 0 && verify.count === 0)}>
                                        {busy ? <span className="rt-spin" /> : "▶"} Start Ride
                                    </button>
                                ) : (
                                    <>
                                        <button className="rt-btn danger" onClick={handleCompleteClick} disabled={busy}>
                                            {busy ? <span className="rt-spin" /> : "⏹"} Complete Ride
                                        </button>
                                        {!driverAtDest && (
                                            <p className="rt-hint" style={{ marginTop: "0.5rem" }}>
                                                {destKm != null
                                                    ? `You're about ${destKm.toFixed(1)} km from the destination. Complete once you arrive — or tap Complete and confirm if you've already dropped off.`
                                                    : "Tap Complete when you've reached the destination."}
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                        ) : state === "in_progress" ? (
                            <div className="rt-actions" style={{ flexDirection: "column", gap: "0.5rem", alignItems: "stretch" }}>
                                <p className="rt-hint" style={{ margin: 0, fontWeight: 700, color: atDestination ? "#34d399" : undefined }}>
                                    {atDestination ? "You've reached your destination." : "Your ride is on the way to the destination."}
                                </p>
                                {atDestination ? (
                                    <>
                                        <p className="rt-hint" style={{ margin: 0 }}>Confirm your drop-off to complete the ride.</p>
                                        <div style={{ display: "flex", gap: "0.6rem" }}>
                                            <button className="rt-btn success" onClick={confirmArrival} disabled={busy} style={{ flex: 1 }}>
                                                {busy ? <span className="rt-spin" /> : "✓"} Yes, I've arrived
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <p className="rt-hint" style={{ margin: 0 }}>You'll be able to confirm arrival once you reach the destination. The driver ends the ride on their side.</p>
                                )}
                            </div>
                        ) : (
                            <p className="rt-hint">
                                {state === "arrived" ? "Your driver has arrived at the pickup point." :
                                 state === "arriving" ? "Your driver is arriving shortly." :
                                 state === "enroute" ? "Your driver is on the way." :
                                 "Waiting for the driver to start the ride."}
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

const RideTracking = ({ rideId, user, onClose }) => (
    <MapsProvider>
        <RideTrackingInner rideId={rideId} user={user} onClose={onClose} />
    </MapsProvider>
);

export default RideTracking;
