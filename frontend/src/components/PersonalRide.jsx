import React, { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import MapsProvider from "./maps/MapsProvider";
import LocationSearchBox from "./maps/LocationSearchBox";
import CurrentLocationButton from "./maps/CurrentLocationButton";
import LiveRideMap from "./maps/LiveRideMap";
import {
    estimatePersonalRide, createPersonalRide, myActivePersonalRide,
    cancelPersonalRide, payPersonalRide, personalRideStats, confirmArrivalPersonal,
} from "../services/personalRideService";
import { getSocket } from "../utils/socket";
import "../styles/rideRequest.css";

const hasCoords = (c) => c && typeof c.lat === "number" && typeof c.lng === "number";
const initials = (n = "") => n.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "D";

const MotoIcon = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="17" r="3.5" /><circle cx="18.5" cy="17" r="3.5" /><path d="M5.5 17h7l4-7h-3" /><path d="M9 10h5" /></svg>;
const AutoIcon = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17V11a6 6 0 0 1 6-6h2l4 6h3a2 2 0 0 1 2 2v4" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /><path d="M9 18h6" /></svg>;
const CarIcon = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H4a2 2 0 0 1-2-2v-3.34a2 2 0 0 1 .38-1.17l1.86-2.5A2 2 0 0 1 5.85 7H15l3.5 4.5 1.9.63A2 2 0 0 1 22 14v1a2 2 0 0 1-2 2h-1" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></svg>;
const ICONS = { Bike: MotoIcon, Auto: AutoIcon, Car: CarIcon };
const CAP = { Bike: "1 seat", Auto: "3 seats", Car: "4 seats" };

const PersonalRideInner = ({ onOpenSidebar, onNavigate }) => {
    const [form, setForm] = useState({ source: "", sourceCoords: null, destination: "", destinationCoords: null, vehicleType: "Car", notes: "" });
    const [estimate, setEstimate] = useState(null);
    const [stats, setStats] = useState(null);
    const [busy, setBusy] = useState(false);
    const [paying, setPaying] = useState(false);
    const [active, setActive] = useState(null);
    const [driverLoc, setDriverLoc] = useState(null);
    const activeId = active?._id;
    const pollRef = useRef(null);

    const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    // Fill the pickup from the device's current location (reverse-geocoded).
    const useCurrentLocationForPickup = ({ coords, address }) => {
        setForm((f) => ({ ...f, source: address || f.source, sourceCoords: coords }));
    };

    // Load any in-progress ride on mount.
    useEffect(() => {
        let on = true;
        myActivePersonalRide().then(({ data }) => { if (on && data) setActive(data); }).catch(() => {});
        return () => { on = false; };
    }, []);

    // Live availability stats for the header + nearby-drivers panel.
    useEffect(() => {
        let on = true;
        const load = () => personalRideStats().then(({ data }) => { if (on) setStats(data); }).catch(() => {});
        load();
        const t = setInterval(load, 20000);
        return () => { on = false; clearInterval(t); };
    }, []);

    // Poll the active ride for live status transitions.
    useEffect(() => {
        if (!activeId) return;
        const poll = async () => {
            try {
                const { data } = await myActivePersonalRide();
                setActive((prev) => {
                    // myActive excludes PAYMENT_RECEIVED — keep the success screen
                    // showing instead of snapping back to the booking form.
                    if (!data) return prev && prev.status === "PAYMENT_RECEIVED" ? prev : null;
                    return data;
                });
                // Fallback driver position from the polled doc (covers a missed
                // socket frame / reconnect — the socket is the fast path).
                const dl = data?.tracking?.driverLocation;
                if (dl && Number.isFinite(dl.lat) && Number.isFinite(dl.lng)) setDriverLoc({ lat: dl.lat, lng: dl.lng });
            } catch { /* ignore */ }
        };
        pollRef.current = setInterval(poll, 4000);
        poll();
        return () => clearInterval(pollRef.current);
    }, [activeId]);

    // Live driver position over Socket.io (fast path) for the active ride.
    useEffect(() => {
        if (!activeId) return;
        const socket = getSocket();
        const onLoc = (p) => {
            if (String(p?.id) !== String(activeId)) return;
            if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) setDriverLoc({ lat: p.lat, lng: p.lng });
        };
        socket.on("driver_location", onLoc);
        return () => socket.off("driver_location", onLoc);
    }, [activeId]);

    // Fetch fare estimate once both coords are set.
    const bothCoords = hasCoords(form.sourceCoords) && hasCoords(form.destinationCoords);
    useEffect(() => {
        if (!bothCoords) { setEstimate(null); return; }
        let on = true;
        estimatePersonalRide(form.sourceCoords, form.destinationCoords)
            .then(({ data }) => { if (on) setEstimate(data); }).catch(() => {});
        return () => { on = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.sourceCoords?.lat, form.sourceCoords?.lng, form.destinationCoords?.lat, form.destinationCoords?.lng]);

    const fareFor = (vt) => estimate?.options?.find((o) => o.vehicleType === vt)?.fare ?? null;
    const selectedFare = fareFor(form.vehicleType);

    const submit = async () => {
        if (!form.destination.trim()) { toast.info("Where do you want to go?"); return; }
        if (!bothCoords) { toast.info("Pick your pickup and drop on the map suggestions."); return; }
        setBusy(true);
        try {
            const { data } = await createPersonalRide({
                pickup: { address: form.source || "My location", ...form.sourceCoords },
                destination: { address: form.destination, ...form.destinationCoords },
                vehicleType: form.vehicleType,
                notes: form.notes,
            });
            setActive(data.request);
            toast.success(data.broadcastTo ? `Finding you a driver… ${data.broadcastTo} nearby alerted.` : "Request sent. Looking for nearby drivers…");
        } catch (e) {
            if (e.response?.status === 409 && e.response.data?.request) { setActive(e.response.data.request); }
            else toast.error(e.response?.data?.message || "Couldn't request the ride.");
        } finally { setBusy(false); }
    };

    const cancel = async () => {
        if (!activeId) return;
        try { await cancelPersonalRide(activeId, ""); } catch { /* ignore */ }
        setActive(null);
        setDriverLoc(null);
        setForm((f) => ({ ...f, notes: "" }));
    };

    const pay = async () => {
        if (!activeId) return;
        setPaying(true);
        try {
            const { data } = await payPersonalRide(activeId);
            setActive(data);
            toast.success("Payment successful. Thanks for riding with RidexShare!");
        } catch (e) {
            toast.error(e.response?.data?.message || "Payment failed.");
        } finally { setPaying(false); }
    };

    const reset = () => { setActive(null); setDriverLoc(null); setForm({ source: "", sourceCoords: null, destination: "", destinationCoords: null, vehicleType: "Car", notes: "" }); setEstimate(null); };

    // GPS-fallback completion: passenger confirms they've reached the destination.
    const confirmArrival = async () => {
        if (!activeId) return;
        setBusy(true);
        try {
            const { data } = await confirmArrivalPersonal(activeId);
            setActive(data);
            toast.success("Arrival confirmed — your trip is complete. Please pay to finish.");
        } catch (e) {
            toast.error(e.response?.data?.message || "Couldn't confirm arrival.");
        } finally { setBusy(false); }
    };

    // Map source/dest (live ride uses the stored ride; idle uses the form).
    const mapSrc = active ? active.pickup : form.sourceCoords;
    const mapDst = active ? active.destination : form.destinationCoords;
    const showMap = hasCoords(mapSrc) && hasCoords(mapDst);
    const driver = active?.driver_id || {};
    const veh = active?.vehicle_id || {};
    const status = active?.status;

    return (
        <div className="rrq">
            {/* Header */}
            <div className="rrq-head">
                <button className="rrq-menu" onClick={onOpenSidebar} aria-label="Open menu">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                </button>
                <span className="rrq-head-icon">{CarIcon}</span>
                <div className="rrq-head-text">
                    <h1>Request a Ride</h1>
                    <p>Get a driver to your door, on demand — pay by UPI when you arrive.</p>
                    {stats && (
                        <div className="rrq-head-stats">
                            <span><i className="rrq-live-dot" />{stats.driversOnline} Drivers Online</span>
                            <span className="rrq-sep">|</span>
                            <span>⚡ Acceptance rate: {stats.acceptanceRate != null ? `${stats.acceptanceRate}%` : "—"}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="rrq-grid">
                {/* LEFT — map */}
                <div className="rrq-left">
                    <div className="rrq-map-card">
                        <div className="rrq-map">
                            {showMap ? (
                                <LiveRideMap sourceCoords={mapSrc} destinationCoords={mapDst} source={active ? active.pickup?.address : form.source} destination={active ? active.destination?.address : form.destination} driverCoords={(status === "DRIVER_ASSIGNED" || status === "RIDE_STARTED") ? driverLoc : null} hideOverlay fill />
                            ) : (
                                <div className="rrq-map-ph">
                                    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                    <p>Enter pickup and destination to preview your route.</p>
                                </div>
                            )}
                        </div>
                        {estimate && !active && (
                            <div className="rrq-map-summary">
                                <div className="rrq-route">
                                    <div className="rrq-route-line">
                                        <span className="rrq-dot pickup" />
                                        <div><label>Pickup</label><strong>{form.source || "My location"}</strong></div>
                                    </div>
                                    <div className="rrq-route-conn" />
                                    <div className="rrq-route-line">
                                        <span className="rrq-dot drop" />
                                        <div><label>Drop</label><strong>{form.destination || "—"}</strong></div>
                                    </div>
                                </div>
                                <div className="rrq-summary-meta">
                                    <span>📍 {estimate.distanceKm} km</span>
                                    <span>🕒 {estimate.durationMin} mins</span>
                                    <span><i className="rrq-live-dot" /> {estimate.driversAvailable} nearby</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Nearby drivers — so the passenger knows who's available in range. */}
                    {!active && (
                        <div className="rrq-nearby">
                            <div className="rrq-nearby-title"><i className="rrq-live-dot" /> Nearby Drivers</div>
                            <div className="rrq-nearby-grid">
                                <div className="rrq-stat"><span className="rrq-stat-ic">👥</span><div><strong>{stats?.driversOnline ?? "—"}</strong><span>Drivers Online</span></div></div>
                                <div className="rrq-stat"><span className="rrq-stat-ic">🛡️</span><div><strong>{stats?.verifiedDrivers ?? "—"}</strong><span>Verified Drivers</span></div></div>
                                <div className="rrq-stat"><span className="rrq-stat-ic">⭐</span><div><strong>{stats?.avgRating ?? "—"}</strong><span>Avg Rating</span></div></div>
                                <div className="rrq-stat"><span className="rrq-stat-ic">⚡</span><div><strong>{stats?.acceptanceRate != null ? `${stats.acceptanceRate}%` : "—"}</strong><span>Acceptance Rate</span></div></div>
                            </div>
                            <div className="rrq-radius-row">
                                <span><i className="rrq-radius-dot" /> Request Radius: {stats?.radiusKm ?? estimate?.radiusKm ?? 10} km</span>
                                <span className="rrq-muted">Online verified drivers in range are alerted</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT — flow */}
                <div className="rrq-side">
                    {!active ? (
                        <>
                            {!hasCoords(form.sourceCoords) ? (
                                <div className="rrq-loc-input">
                                    <LocationSearchBox label="Pickup Location" placeholder="Where are you?" value={form.source} onChange={(v) => setF("source", v)} onCoordinatesChange={(c) => setF("sourceCoords", c)} isSource />
                                    <div className="rrq-currentloc"><CurrentLocationButton onLocate={useCurrentLocationForPickup} /></div>
                                </div>
                            ) : (
                                <div className="rrq-loc"><span className="rrq-dot pickup" /><div className="rrq-loc-text"><label>Pickup</label><strong>{form.source || "My location"}</strong></div><button className="rrq-loc-x" onClick={() => { setF("source", ""); setF("sourceCoords", null); }}>✕</button></div>
                            )}
                            {!hasCoords(form.destinationCoords) ? (
                                <div className="rrq-loc-input"><LocationSearchBox label="Drop Location" placeholder="Where to?" value={form.destination} onChange={(v) => setF("destination", v)} onCoordinatesChange={(c) => setF("destinationCoords", c)} /></div>
                            ) : (
                                <div className="rrq-loc"><span className="rrq-dot drop" /><div className="rrq-loc-text"><label>Drop</label><strong>{form.destination}</strong></div><button className="rrq-loc-x" onClick={() => { setF("destination", ""); setF("destinationCoords", null); }}>✕</button></div>
                            )}

                            <div className="rrq-choose-title">Choose a ride{estimate ? <span className="rrq-muted"> · {estimate.distanceKm} km</span> : null}</div>
                            <div className="rrq-vehicles">
                                {["Bike", "Auto", "Car"].map((vt) => {
                                    const price = fareFor(vt);
                                    const sel = form.vehicleType === vt;
                                    return (
                                        <button key={vt} type="button" className={`rrq-vehicle ${sel ? "selected" : ""}`} onClick={() => setF("vehicleType", vt)}>
                                            <span className="rrq-vehicle-ic">{ICONS[vt]}</span>
                                            <span className="rrq-vehicle-info"><strong>{vt}</strong><span>{CAP[vt]}</span></span>
                                            <span className="rrq-vehicle-price">{price != null ? `₹${price}` : "—"}</span>
                                            <span className={`rrq-radio ${sel ? "on" : ""}`}>{sel && "✓"}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="pr-notes">
                                <label className="rrq-muted" style={{ fontSize: "0.74rem" }}>Notes for the driver (optional)</label>
                                <textarea className="pr-notes-input" placeholder="e.g. I'm near the main gate, 2 bags" value={form.notes} maxLength={300} onChange={(e) => setF("notes", e.target.value)} />
                            </div>

                            <button className="rrq-broadcast" onClick={submit} disabled={busy}>
                                <span className="rrq-broadcast-main">{busy ? "Requesting…" : "Request Ride"}{selectedFare != null ? ` · ₹${selectedFare}` : ""}</span>
                                <span className="rrq-broadcast-sub">A nearby verified driver will pick you up</span>
                            </button>
                        </>
                    ) : status === "SEARCHING" ? (
                        <div className="rrq-broadcasting">
                            <div className="rrq-radar"><span /><span /><span /><div className="rrq-radar-core">{ICONS[active.vehicleType]}</div></div>
                            <h3>Finding you a driver…</h3>
                            <p className="rrq-muted" style={{ textAlign: "center" }}>{active.destination?.address} · ₹{active.estimatedFare}</p>
                            <button className="rrq-cancel-link" onClick={cancel}>Cancel request</button>
                        </div>
                    ) : status === "PAYMENT_RECEIVED" ? (
                        <div className="rrq-assigned">
                            <div className="rrq-assigned-badge">✓</div>
                            <h3>Ride complete</h3>
                            <p className="rrq-muted" style={{ textAlign: "center" }}>You paid ₹{active.finalFare} via UPI for your trip to {active.destination?.address}.</p>
                            <button className="rrq-broadcast" onClick={reset}><span className="rrq-broadcast-main">Book another ride</span></button>
                        </div>
                    ) : (
                        /* DRIVER_ASSIGNED / RIDE_STARTED / RIDE_COMPLETED */
                        <div className="pr-trip">
                            <div className="pr-status-chip">
                                {status === "DRIVER_ASSIGNED" && (active.otp?.code ? "Driver has arrived" : "Driver on the way")}
                                {status === "RIDE_STARTED" && "On your trip"}
                                {status === "RIDE_COMPLETED" && "Trip completed"}
                            </div>

                            <div className="pr-driver">
                                <span className="rrq-avatar">{initials(driver.name)}</span>
                                <div className="pr-driver-meta">
                                    <strong>{driver.name || "Driver"} {driver.isDriverVerified && "✅"}</strong>
                                    <span>{veh.make ? `${veh.make} ${veh.model} · ${veh.licensePlate || ""}` : active.vehicleType}</span>
                                    {driver.ratings?.driver?.average > 0 && <span className="pr-rating">★ {driver.ratings.driver.average.toFixed(1)}</span>}
                                </div>
                                <div className="pr-driver-fare">₹{active.finalFare || active.estimatedFare}</div>
                            </div>

                            <div className="pr-actions">
                                <button className="pr-action" onClick={() => onNavigate?.("chats")}>💬 Chat</button>
                                {driver.phoneNumber && <a className="pr-action" href={`tel:${driver.phoneNumber}`}>📞 Call</a>}
                                {status === "RIDE_STARTED" && <button className="pr-action danger" onClick={() => window.dispatchEvent(new CustomEvent("rs-assistant-open"))}>🆘 SOS</button>}
                            </div>

                            {/* OTP — passenger shares with driver to start */}
                            {status === "DRIVER_ASSIGNED" && active.otp?.code && (
                                <div className="pr-otp">
                                    <span className="pr-otp-label">Share this OTP with your driver to start</span>
                                    <div className="pr-otp-code">{active.otp.code.split("").map((d, i) => <span key={i}>{d}</span>)}</div>
                                </div>
                            )}
                            {status === "DRIVER_ASSIGNED" && !active.otp?.code && (
                                <p className="rrq-note">Your driver is on the way. An OTP will appear here when they arrive.</p>
                            )}
                            {status === "RIDE_STARTED" && (
                                <>
                                    <p className="rrq-note">Enjoy your ride. Live location is shared with your safety contacts.</p>
                                    <button className="rrq-broadcast" onClick={confirmArrival} disabled={busy} style={{ marginTop: "0.6rem" }}>
                                        <span className="rrq-broadcast-main">{busy ? "Confirming…" : "✓ I've reached my destination"}</span>
                                        <span className="rrq-broadcast-sub">Confirm arrival to complete the trip</span>
                                    </button>
                                </>
                            )}

                            {/* Pay on completion */}
                            {status === "RIDE_COMPLETED" && (
                                <div className="pr-pay">
                                    <div className="pr-pay-row"><span>Total fare</span><strong>₹{active.finalFare}</strong></div>
                                    <button className="rrq-broadcast" onClick={pay} disabled={paying}>
                                        <span className="rrq-broadcast-main">{paying ? "Processing…" : `Pay ₹${active.finalFare} via UPI`}</span>
                                        <span className="rrq-broadcast-sub">Paid securely to RidexShare</span>
                                    </button>
                                </div>
                            )}

                            {status === "DRIVER_ASSIGNED" && (
                                <button className="rrq-cancel-link" onClick={cancel}>Cancel ride</button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const PersonalRide = (props) => (
    <MapsProvider><PersonalRideInner {...props} /></MapsProvider>
);

export default PersonalRide;
