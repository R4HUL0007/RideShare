import React, { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import MapsProvider from "./maps/MapsProvider";
import LiveRideMap from "./maps/LiveRideMap";
import {
    incomingPersonalRides, driverActivePersonalRide, myDriverLedger,
    acceptPersonalRide, declinePersonalRide, reachedPickupPersonalRide,
    verifyOtpPersonalRide, completePersonalRide, updateDriverLocationPersonal, cancelPersonalRide,
} from "../services/personalRideService";
import "../styles/rideRequest.css";

const hasCoords = (c) => c && typeof c.lat === "number" && typeof c.lng === "number";
const initials = (n = "") => n.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "P";
const inr = (n) => `₹${(n ?? 0).toLocaleString("en-IN")}`;

const CarIcon = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H4a2 2 0 0 1-2-2v-3.34a2 2 0 0 1 .38-1.17l1.86-2.5A2 2 0 0 1 5.85 7H15l3.5 4.5 1.9.63A2 2 0 0 1 22 14v1a2 2 0 0 1-2 2h-1" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></svg>;

const DriverRidesInner = ({ onOpenSidebar, onNavigate }) => {
    const [active, setActive] = useState(null);
    const [incoming, setIncoming] = useState([]);
    const [ledger, setLedger] = useState(null);
    const [otp, setOtp] = useState("");
    const [busy, setBusy] = useState(false);
    const watchRef = useRef(null);
    const activeId = active?._id;

    const refresh = async () => {
        try {
            const { data } = await driverActivePersonalRide();
            setActive(data || null);
            if (!data) {
                const inc = await incomingPersonalRides();
                setIncoming(inc.data || []);
            }
        } catch { /* ignore */ }
    };

    useEffect(() => {
        refresh();
        myDriverLedger().then(({ data }) => setLedger(data)).catch(() => {});
        const t = setInterval(refresh, 4000);
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Share live location while heading to pickup AND during the trip, so the
    // passenger can watch the driver approach and then ride to the destination.
    useEffect(() => {
        const sharing = active?.status === "DRIVER_ASSIGNED" || active?.status === "RIDE_STARTED";
        if (sharing && activeId && "geolocation" in navigator && watchRef.current == null) {
            watchRef.current = navigator.geolocation.watchPosition(
                (pos) => updateDriverLocationPersonal(activeId, pos.coords.latitude, pos.coords.longitude).catch(() => {}),
                () => {}, { enableHighAccuracy: true, maximumAge: 10000 }
            );
        }
        if (!sharing && watchRef.current != null) {
            navigator.geolocation.clearWatch(watchRef.current);
            watchRef.current = null;
        }
        return () => { if (watchRef.current != null && !sharing) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; } };
    }, [active?.status, activeId]);

    const act = async (fn, okMsg) => {
        setBusy(true);
        try { const { data } = await fn(); if (data?._id) setActive(data); if (okMsg) toast.success(okMsg); await refresh(); }
        catch (e) { toast.error(e.response?.data?.message || "Action failed"); }
        finally { setBusy(false); }
    };

    const accept = (id) => act(() => acceptPersonalRide(id), "Ride accepted — head to the pickup!");
    const decline = async (id) => { try { await declinePersonalRide(id); setIncoming((l) => l.filter((r) => r._id !== id)); } catch { /* ignore */ } };
    const reached = () => act(() => reachedPickupPersonalRide(activeId), "OTP sent to the passenger.");
    const verify = () => { if (otp.trim().length !== 6) { toast.info("Enter the 6-digit OTP."); return; } act(() => verifyOtpPersonalRide(activeId, otp.trim()), "Ride started!").then(() => setOtp("")); };
    const complete = () => act(() => completePersonalRide(activeId), "Ride completed. Awaiting payment.");

    const status = active?.status;
    const passenger = active?.passenger_id || {};
    const showMap = active && hasCoords(active.pickup) && hasCoords(active.destination);

    // Single source of truth for money on this screen so the headline, the
    // breakdown, and the status note never disagree. Before completion we show
    // the ESTIMATE; after completion the server-authoritative final split.
    const fareInfo = (() => {
        if (!active) return null;
        const done = status === "RIDE_COMPLETED" || status === "PAYMENT_RECEIVED";
        const fare = done ? (active.finalFare || 0) : (active.estimatedFare || 0);
        const earnings = done ? (active.driverEarnings || 0) : Math.round((active.estimatedFare || 0) * 0.9);
        const commission = done
            ? (active.commission != null ? active.commission : Math.max(0, fare - earnings))
            : Math.max(0, fare - earnings);
        return { fare, earnings, commission, estimated: !done };
    })();

    return (
        <div className="rrq">
            <div className="rrq-head">
                <button className="rrq-menu" onClick={onOpenSidebar} aria-label="Open menu">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                </button>
                <span className="rrq-head-icon">{CarIcon}</span>
                <div className="rrq-head-text">
                    <h1>Drive</h1>
                    <p>Accept on-demand ride requests and earn — settled weekly to your UPI.</p>
                </div>
            </div>

            {/* Earnings strip */}
            {ledger && (
                <div className="dr-earn-strip">
                    <div className="dr-earn"><span>Pending settlement</span><strong>{inr(ledger.summary.pending)}</strong></div>
                    <div className="dr-earn"><span>Settled</span><strong>{inr(ledger.summary.settled)}</strong></div>
                    <div className="dr-earn"><span>Total earned</span><strong>{inr(ledger.summary.total)}</strong></div>
                    <button className="pr-action" style={{ flex: "0 0 auto" }} onClick={() => onNavigate?.("earnings")}>View ledger</button>
                </div>
            )}

            {active ? (
                <div className="rrq-grid">
                    <div className="rrq-left">
                        <div className="rrq-map-card">
                            <div className="rrq-map">
                                {showMap ? (
                                    <LiveRideMap sourceCoords={active.pickup} destinationCoords={active.destination} source={active.pickup?.address} destination={active.destination?.address} hideOverlay />
                                ) : (
                                    <div className="rrq-map-ph"><p>Route preview</p></div>
                                )}
                            </div>
                            <div className="rrq-map-summary">
                                <div className="rrq-route">
                                    <div className="rrq-route-line"><span className="rrq-dot pickup" /><div><label>Pickup</label><strong>{active.pickup?.address || "—"}</strong></div></div>
                                    <div className="rrq-route-conn" />
                                    <div className="rrq-route-line"><span className="rrq-dot drop" /><div><label>Drop</label><strong>{active.destination?.address || "—"}</strong></div></div>
                                </div>
                                <div className="rrq-summary-meta">
                                    <span>📍 {active.distanceKm} km</span>
                                    {active.durationMin ? <span>🕒 {active.durationMin} mins</span> : null}
                                    <span>🚗 {active.vehicleType}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rrq-side">
                        <div className="pr-status-chip">
                            {status === "DRIVER_ASSIGNED" && (active.otp?.verifiedAt ? "Starting…" : "Head to pickup")}
                            {status === "RIDE_STARTED" && "Trip in progress"}
                            {status === "RIDE_COMPLETED" && "Awaiting payment"}
                            {status === "PAYMENT_RECEIVED" && "Paid"}
                        </div>

                        <div className="pr-driver">
                            <span className="rrq-avatar">{initials(passenger.name)}</span>
                            <div className="pr-driver-meta">
                                <strong>{passenger.name || "Passenger"}</strong>
                                <span>{active.vehicleType} · {active.distanceKm} km</span>
                            </div>
                            <div className="pr-driver-fare">{inr(fareInfo?.earnings)}<span className="pr-fare-cap">you earn</span></div>
                        </div>
                        {active.notes && <p className="rrq-note">📝 {active.notes}</p>}

                        {/* Trip & fare summary — one clear, labeled breakdown so the
                            rider-pays vs you-earn split is never a mystery. */}
                        {fareInfo && (
                            <div className="pr-pay">
                                <div className="pr-pay-row">
                                    <span>Trip fare{fareInfo.estimated && <em className="pr-fare-est">est.</em>}<br /><small className="pr-fare-sub">rider pays</small></span>
                                    <strong>{inr(fareInfo.fare)}</strong>
                                </div>
                                <div className="pr-pay-row">
                                    <span>Platform fee</span>
                                    <strong>−{inr(fareInfo.commission)}</strong>
                                </div>
                                <div className="pr-pay-row pr-pay-total">
                                    <span>You earn</span>
                                    <strong>{inr(fareInfo.earnings)}</strong>
                                </div>
                            </div>
                        )}

                        {status === "DRIVER_ASSIGNED" && !active.reachedPickupAt && (
                            <button className="rrq-broadcast" onClick={reached} disabled={busy}><span className="rrq-broadcast-main">Reached Pickup</span><span className="rrq-broadcast-sub">Generates the passenger's start OTP</span></button>
                        )}
                        {status === "DRIVER_ASSIGNED" && active.reachedPickupAt && (
                            <>
                                <div className="dr-otp-entry">
                                    <label className="rrq-muted" style={{ fontSize: "0.74rem" }}>Enter the OTP the passenger shows you</label>
                                    <input className="dr-otp-input" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="6-digit OTP" />
                                </div>
                                <button className="rrq-broadcast" onClick={verify} disabled={busy}><span className="rrq-broadcast-main">Start Ride</span></button>
                            </>
                        )}
                        {status === "RIDE_STARTED" && (
                            <button className="rrq-broadcast" onClick={complete} disabled={busy}><span className="rrq-broadcast-main">Complete Ride</span><span className="rrq-broadcast-sub">Sharing your live location with the rider</span></button>
                        )}
                        {status === "RIDE_COMPLETED" && (
                            <p className="rrq-note">⏳ Waiting for {passenger.name || "the passenger"} to pay via UPI. Your earnings land in your ledger the moment they pay.</p>
                        )}
                        {status === "PAYMENT_RECEIVED" && (
                            <div className="rrq-assigned"><div className="rrq-assigned-badge">✓</div><h3>Earnings added</h3><p className="rrq-muted" style={{ textAlign: "center" }}>{inr(active.driverEarnings)} added to your ledger. Settled weekly.</p></div>
                        )}
                        {status === "DRIVER_ASSIGNED" && (
                            <button className="rrq-cancel-link" onClick={() => act(() => cancelPersonalRide(active._id, "driver"), "Ride cancelled")}>Cancel</button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="dr-incoming">
                    <div className="dr-incoming-title"><i className="rrq-live-dot" /> Incoming requests</div>
                    {incoming.length === 0 ? (
                        <div className="adm-rides-empty" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1rem" }}>
                            <div className="adm-rides-empty-illu">{CarIcon}</div>
                            <div className="adm-rides-empty-title">No requests right now</div>
                            <div className="adm-rides-empty-text">Stay online — new ride requests near you will appear here instantly.</div>
                        </div>
                    ) : (
                        <div className="dr-req-list">
                            {incoming.map((r) => (
                                <div key={r._id} className="dr-req-card">
                                    <div className="dr-req-top">
                                        <span className="rrq-avatar">{initials(r.passenger_id?.name)}</span>
                                        <div className="dr-req-meta">
                                            <strong>{r.passenger_id?.name || "Passenger"}</strong>
                                            <span>{r.vehicleType} · {r.distanceKm} km</span>
                                        </div>
                                        <div className="dr-req-earn"><span>You earn</span><strong>{inr(Math.round((r.estimatedFare || 0) * 0.9))}</strong></div>
                                    </div>
                                    <div className="dr-req-route">
                                        <div><span className="rrq-dot pickup" /> {r.pickup?.address || "Pickup"}</div>
                                        <div><span className="rrq-dot drop" /> {r.destination?.address}</div>
                                    </div>
                                    {r.notes && <p className="rrq-note" style={{ textAlign: "left" }}>📝 {r.notes}</p>}
                                    <div className="dr-req-actions">
                                        <button className="pr-action danger" onClick={() => decline(r._id)} disabled={busy}>Decline</button>
                                        <button className="rrq-broadcast" style={{ flex: 2 }} onClick={() => accept(r._id)} disabled={busy}><span className="rrq-broadcast-main">Accept</span></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const DriverRides = (props) => (
    <MapsProvider><DriverRidesInner {...props} /></MapsProvider>
);

export default DriverRides;
