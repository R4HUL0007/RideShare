import { lazy, Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { GoogleMap, Marker, Polyline } from "@react-google-maps/api";
import axiosInstance from "../utils/axiosConfig";
import { toast } from "react-toastify";
import { API_BASE_URL } from "../utils/constants";
import { DARK_MAP_STYLE } from "../config/googleMapsConfig";
import MapsProvider, { useMaps } from "./maps/MapsProvider";
import LiveRideMap from "./maps/LiveRideMap";
import ThemedSelect from "./ThemedSelect";
import { getMyImpact } from "../services/sustainabilityService";
import { payForRide } from "../services/paymentService";
import "../styles/myBookings.css";

const RideTracking = lazy(() => import("./RideTracking"));
const ReviewModal = lazy(() => import("./ReviewModal"));

const hasCoords = (c) => c && typeof c.lat === "number" && typeof c.lng === "number";

/* ---------------- helpers ---------------- */
const fmtDate = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
const fmtTime = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};
const initials = (name = "") =>
    name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "U";

// Resolve the current user's passenger booking record within a ride.
const myBooking = (ride, userId) => {
    if (!ride.passengers || !Array.isArray(ride.passengers)) return null;
    return ride.passengers.find((p) => {
        if (!p) return false;
        const pid = p.user_id?._id || p.user_id || p;
        return pid && (pid.toString() === userId || pid === userId);
    });
};

// A booking is still cancellable if within 3 minutes of bookedAt.
const cancelWindowOpen = (booking) => {
    if (!booking || typeof booking !== "object" || !booking.bookedAt) return true;
    return (Date.now() - new Date(booking.bookedAt).getTime()) / 60000 <= 3;
};

/* ---------------- mini route preview map ---------------- */
function MiniRouteMap({ ride }) {
    const { isLoaded } = useMaps();
    const [route, setRoute] = useState(null);
    const [mapRef, setMapRef] = useState(null);
    const s = ride.sourceCoords, d = ride.destinationCoords;

    useEffect(() => {
        if (!isLoaded || !window.google || !mapRef || !hasCoords(s) || !hasCoords(d)) return;
        const bounds = new window.google.maps.LatLngBounds();
        bounds.extend(s); bounds.extend(d);
        const t = setTimeout(() => mapRef.fitBounds?.(bounds, { top: 24, right: 24, bottom: 24, left: 24 }), 60);
        return () => clearTimeout(t);
    }, [isLoaded, mapRef, s, d]);

    useEffect(() => {
        if (!isLoaded || !window.google || !hasCoords(s) || !hasCoords(d)) return;
        const svc = new window.google.maps.DirectionsService();
        svc.route(
            { origin: s, destination: d, travelMode: window.google.maps.TravelMode.DRIVING },
            (result, status) => {
                if (status === window.google.maps.DirectionsStatus.OK && result?.routes?.[0]) {
                    const r = result.routes[0];
                    const path = Array.isArray(r.overview_path) && r.overview_path.length
                        ? r.overview_path
                        : (r.overview_polyline?.points && window.google.maps.geometry?.encoding
                            ? window.google.maps.geometry.encoding.decodePath(r.overview_polyline.points)
                            : null);
                    setRoute(path);
                }
            }
        );
    }, [isLoaded, s, d]);

    if (!hasCoords(s) || !hasCoords(d)) {
        return <div className="mb-mini-map placeholder"><span>Route preview unavailable</span></div>;
    }
    if (!isLoaded) {
        return <div className="mb-mini-map placeholder"><span className="mb-spin" /></div>;
    }
    return (
        <div className="mb-mini-map">
            <GoogleMap
                onLoad={setMapRef}
                center={s}
                zoom={11}
                mapContainerStyle={{ width: "100%", height: "100%" }}
                options={{
                    styles: DARK_MAP_STYLE, backgroundColor: "#0f0f10",
                    disableDefaultUI: true, gestureHandling: "none", clickableIcons: false, keyboardShortcuts: false,
                }}
            >
                <Marker position={s} icon={dotIcon("#10B981")} />
                <Marker position={d} icon={dotIcon("#EF4444")} />
                {route && (
                    <>
                        <Polyline path={route} options={{ strokeColor: "#ffffff", strokeOpacity: 0.2, strokeWeight: 8 }} />
                        <Polyline path={route} options={{ strokeColor: "#ffffff", strokeOpacity: 0.95, strokeWeight: 3.5 }} />
                    </>
                )}
            </GoogleMap>
        </div>
    );
}
const dotIcon = (color) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
    const icon = { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg) };
    if (window.google?.maps?.Size) icon.scaledSize = new window.google.maps.Size(16, 16);
    if (window.google?.maps?.Point) icon.anchor = new window.google.maps.Point(8, 8);
    return icon;
};

/* ---------------- status badge ---------------- */
function StatusBadge({ status }) {
    const map = {
        Confirmed: "confirmed",
        Pending: "pending",
        Completed: "completed",
        Cancelled: "cancelled",
    };
    return <span className={`mb-badge ${map[status] || "pending"}`}>{status}</span>;
}

/* ---------------- booking card ---------------- */
function BookingCard({ ride, status, seats, onView, onViewRoute, onTrack, onCancel, canCancel, onRate, onPay, unpaidFare, paying }) {
    const driver = ride.user_id || {};
    const v = ride.vehicle_id || {};
    const trackable = status === "Confirmed" && hasCoords(ride.sourceCoords) && hasCoords(ride.destinationCoords);
    return (
        <article className="mb-card">
            <div className="mb-card-mapwrap"><MiniRouteMap ride={ride} /></div>

            <div className="mb-card-body">
                <div className="mb-card-top">
                    <div className="mb-driver">
                        {driver.profilePicture
                            ? <img className="mb-avatar" src={driver.profilePicture} alt={driver.name} />
                            : <span className="mb-avatar mb-avatar-fallback">{initials(driver.name)}</span>}
                        <div className="mb-driver-meta">
                            <span className="mb-driver-name">{driver.name || "Driver"}</span>
                            <span className="mb-rating">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="#facc15" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" /></svg>
                                New
                            </span>
                        </div>
                    </div>
                    <StatusBadge status={status} />
                </div>

                <div className="mb-route">
                    <div className="mb-route-line"><span className="mb-dot pickup" /><span className="mb-route-text" title={ride.source}>{ride.source || "—"}</span></div>
                    <div className="mb-route-conn" />
                    <div className="mb-route-line"><span className="mb-dot drop" /><span className="mb-route-text" title={ride.destination}>{ride.destination || "—"}</span></div>
                </div>

                <div className="mb-meta-grid">
                    <div className="mb-meta"><span className="mb-meta-k">Date</span><span className="mb-meta-v">{fmtDate(ride.timing)}</span></div>
                    <div className="mb-meta"><span className="mb-meta-k">Departs</span><span className="mb-meta-v">{fmtTime(ride.timing)}</span></div>
                    <div className="mb-meta"><span className="mb-meta-k">Seats booked</span><span className="mb-meta-v">{seats}</span></div>
                    <div className="mb-meta"><span className="mb-meta-k">Vehicle</span><span className="mb-meta-v">{v.make ? `${v.make} ${v.model}` : "—"}</span></div>
                </div>

                <div className="mb-card-actions">
                    {status === "Completed" && unpaidFare > 0 && (
                        <button className="mb-act track" onClick={() => onPay(ride)} disabled={paying} style={{ fontWeight: 800 }}>
                            {paying ? <><span className="mb-spin" /> Paying…</> : `Pay ₹${unpaidFare}`}
                        </button>
                    )}
                    <button className="mb-act" onClick={() => onView(ride)}>View Details</button>
                    {trackable && (
                        <button className="mb-act track" onClick={() => onTrack(ride)}>Track Ride</button>
                    )}
                    {hasCoords(ride.sourceCoords) && hasCoords(ride.destinationCoords) && (
                        <button className="mb-act" onClick={() => onViewRoute(ride)}>View Route</button>
                    )}
                    {status === "Confirmed" && (
                        <button className="mb-act danger" onClick={() => onCancel(ride)} disabled={!canCancel} title={!canCancel ? "Cancellation window expired (3 min)" : ""}>
                            Cancel
                        </button>
                    )}
                    {status === "Completed" && unpaidFare <= 0 && (
                        <button className="mb-act track" onClick={() => onRate(ride)}>Rate Driver</button>
                    )}
                    {status === "Completed" && unpaidFare <= 0 && (
                        <button className="mb-act" onClick={() => toast.info("Rebooking is coming soon.")}>Rebook</button>
                    )}
                </div>
            </div>
        </article>
    );
}

/* ---------------- details modal ---------------- */
function BookingDetailsModal({ entry, onClose, onCancel }) {
    const { ride, status, seats, canCancel } = entry;
    const driver = ride.user_id || {};
    const v = ride.vehicle_id || {};
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div className="mb-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="mb-modal" role="dialog" aria-modal="true" aria-label="Booking details">
                <div className="mb-modal-head">
                    <h2 className="mb-modal-title">Booking Details</h2>
                    <button className="mb-modal-close" onClick={onClose} aria-label="Close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>
                <div className="mb-modal-body">
                    <div className="mb-modal-statusrow">
                        <div className="mb-driver">
                            {driver.profilePicture
                                ? <img className="mb-avatar lg" src={driver.profilePicture} alt={driver.name} />
                                : <span className="mb-avatar lg mb-avatar-fallback">{initials(driver.name)}</span>}
                            <div className="mb-driver-meta">
                                <span className="mb-driver-name lg">{driver.name || "Driver"}</span>
                                <span className="mb-modal-sub">{driver.phoneNumber || driver.role || "Member"}</span>
                            </div>
                        </div>
                        <StatusBadge status={status} />
                    </div>

                    {hasCoords(ride.sourceCoords) && hasCoords(ride.destinationCoords) && (
                        <div className="mb-modal-map">
                            <LiveRideMap
                                sourceCoords={ride.sourceCoords}
                                destinationCoords={ride.destinationCoords}
                                source={ride.source}
                                destination={ride.destination}
                                pricePerPerson={ride.pricePerPerson}
                            />
                        </div>
                    )}

                    <div className="mb-route" style={{ margin: "0.3rem 0 0.2rem" }}>
                        <div className="mb-route-line"><span className="mb-dot pickup" /><span className="mb-route-text">{ride.source}</span></div>
                        <div className="mb-route-conn" />
                        <div className="mb-route-line"><span className="mb-dot drop" /><span className="mb-route-text">{ride.destination}</span></div>
                    </div>

                    <div className="mb-modal-stats">
                        <div className="mb-meta"><span className="mb-meta-k">Vehicle</span><span className="mb-meta-v">{v.make ? `${v.make} ${v.model}` : "—"}</span></div>
                        <div className="mb-meta"><span className="mb-meta-k">Type</span><span className="mb-meta-v">{v.vehicleType || "—"}</span></div>
                        <div className="mb-meta"><span className="mb-meta-k">Number</span><span className="mb-meta-v">{v.licensePlate || "—"}</span></div>
                        <div className="mb-meta"><span className="mb-meta-k">Seats booked</span><span className="mb-meta-v">{seats}</span></div>
                        <div className="mb-meta"><span className="mb-meta-k">Date</span><span className="mb-meta-v">{fmtDate(ride.timing)}</span></div>
                        <div className="mb-meta"><span className="mb-meta-k">Departs</span><span className="mb-meta-v">{fmtTime(ride.timing)}</span></div>
                        {ride.pricePerPerson ? <div className="mb-meta"><span className="mb-meta-k">Fare</span><span className="mb-meta-v">₹{ride.pricePerPerson}/seat</span></div> : null}
                    </div>
                </div>
                {status === "Confirmed" && (
                    <div className="mb-modal-foot">
                        <button className="mb-btn ghost" onClick={onClose}>Close</button>
                        <button className="mb-btn danger" onClick={() => onCancel(ride)} disabled={!canCancel} title={!canCancel ? "Cancellation window expired (3 min)" : ""}>
                            Cancel Booking
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ---------------- cancel confirm ---------------- */
function CancelConfirm({ ride, busy, onKeep, onConfirm }) {
    return (
        <div className="mb-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onKeep()}>
            <div className="mb-confirm" role="dialog" aria-modal="true" aria-label="Cancel booking">
                <h3 className="mb-confirm-title">Cancel this booking?</h3>
                <p className="mb-confirm-text">
                    You're about to cancel your booking to <strong>{ride.destination}</strong> on {fmtDate(ride.timing)} at {fmtTime(ride.timing)}. This can't be undone.
                </p>
                <div className="mb-confirm-actions">
                    <button className="mb-btn ghost" onClick={onKeep} disabled={busy}>Keep Booking</button>
                    <button className="mb-btn danger" onClick={() => onConfirm(ride)} disabled={busy}>
                        {busy ? <><span className="mb-spin" /> Cancelling…</> : "Cancel Booking"}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ---------------- route-only modal (in-app) ---------------- */
function RouteModal({ ride, onClose }) {
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (
        <div className="mb-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="mb-modal" role="dialog" aria-modal="true" aria-label="Route preview">
                <div className="mb-modal-head">
                    <h2 className="mb-modal-title">Route Preview</h2>
                    <button className="mb-modal-close" onClick={onClose} aria-label="Close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>
                <div className="mb-modal-body">
                    <div className="mb-modal-map">
                        <LiveRideMap
                            sourceCoords={ride.sourceCoords}
                            destinationCoords={ride.destinationCoords}
                            source={ride.source}
                            destination={ride.destination}
                            pricePerPerson={ride.pricePerPerson}
                        />
                    </div>
                    <div className="mb-route" style={{ marginTop: "0.2rem" }}>
                        <div className="mb-route-line"><span className="mb-dot pickup" /><span className="mb-route-text">{ride.source}</span></div>
                        <div className="mb-route-conn" />
                        <div className="mb-route-line"><span className="mb-dot drop" /><span className="mb-route-text">{ride.destination}</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* =======================================================
   MyBookings (main)
   ======================================================= */
const MyBookingsInner = ({ user, onOpenSidebar, onNavigate }) => {
    const [loading, setLoading] = useState(true);
    const [booked, setBooked] = useState([]);     // active bookings (my-bookings)
    const [history, setHistory] = useState([]);   // completed rides as passenger
    const [cancelled, setCancelled] = useState([]); // session-tracked cancellations
    const [tab, setTab] = useState("upcoming");    // upcoming | completed | cancelled
    const [statusFilter, setStatusFilter] = useState("All");
    const [routeQuery, setRouteQuery] = useState("");
    const [dateFilter, setDateFilter] = useState("");
    const [detailsEntry, setDetailsEntry] = useState(null);
    const [routeRide, setRouteRide] = useState(null);
    const [trackRide, setTrackRide] = useState(null);
    const [cancelRideTarget, setCancelRideTarget] = useState(null);
    const [cancelBusy, setCancelBusy] = useState(false);
    // Completed ride the user chose to review (passenger → driver).
    const [reviewRide, setReviewRide] = useState(null);
    const [impact, setImpact] = useState(null);
    const [payingId, setPayingId] = useState(null);

    const userId = user?.id || user?._id;

    // Pay for a completed-but-unpaid ride (pay-after-completion). Opens Razorpay;
    // on success the server holds the fare in escrow and frees up booking again.
    const payForBooking = async (ride) => {
        setPayingId(ride._id);
        try {
            await payForRide({ rideId: ride._id, seats: 1, user: user || {} });
            toast.success("Payment successful — held safely in escrow for your driver.");
            load();
        } catch (err) {
            if (err?.code === "dismissed") toast.info("Payment cancelled.");
            else toast.error(err?.message || "Payment failed. Please try again.");
        } finally {
            setPayingId(null);
        }
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [bRes, hRes, iRes] = await Promise.allSettled([
                axiosInstance.get(`${API_BASE_URL}/rides/my-bookings`),
                axiosInstance.get(`${API_BASE_URL}/rides/history`),
                getMyImpact(),
            ]);
            // Upcoming: only rides that are still active (not completed/cancelled).
            const allBooked = bRes.status === "fulfilled" && Array.isArray(bRes.value.data) ? bRes.value.data : [];
            setBooked(allBooked.filter((ride) => ride.status !== "Completed" && ride.status !== "Cancelled"));

            // History: keep only rides where the user was a passenger (not driver).
            let hist = hRes.status === "fulfilled" && Array.isArray(hRes.value.data) ? hRes.value.data : [];
            hist = hist.filter((ride) => {
                if (!userId) return false;
                if (ride.user_id) {
                    const did = ride.user_id._id || ride.user_id;
                    if (did && (did.toString() === userId || did === userId)) return false;
                }
                return Boolean(myBooking(ride, userId));
            });
            setHistory(hist);
            if (iRes.status === "fulfilled") setImpact(iRes.value?.data || null);
        } catch {
            setBooked([]); setHistory([]);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { load(); }, [load]);

    const confirmCancel = async (ride) => {
        setCancelBusy(true);
        try {
            await axiosInstance.delete(`${API_BASE_URL}/rides/cancel/${ride._id}`);
            toast.success("Booking cancelled successfully");
            // Track for the Cancelled tab this session, then refresh.
            const b = myBooking(ride, userId);
            const seats = (b && typeof b === "object" && b.seats) || 1;
            setCancelled((prev) => [{ ride, seats, cancelledAt: Date.now() }, ...prev.filter((c) => c.ride._id !== ride._id)]);
            setCancelRideTarget(null);
            setDetailsEntry(null);
            load();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to cancel booking");
        } finally {
            setCancelBusy(false);
        }
    };

    // Build a normalized "entry" list per tab.
    const entries = useMemo(() => {
        const toEntry = (ride, status) => {
            const b = myBooking(ride, userId);
            const seats = (b && typeof b === "object" && b.seats) || 1;
            const unpaidFare = (b && typeof b === "object" && b.paymentStatus === "unpaid" && (b.fareAmount || 0) > 0) ? b.fareAmount : 0;
            return { ride, status, seats, unpaidFare, canCancel: status === "Confirmed" && cancelWindowOpen(b) };
        };
        if (tab === "upcoming") return booked.map((r) => toEntry(r, "Confirmed"));
        if (tab === "completed") return history.map((r) => toEntry(r, "Completed"));
        return cancelled.map((c) => ({ ride: c.ride, status: "Cancelled", seats: c.seats, canCancel: false }));
    }, [tab, booked, history, cancelled, userId]);

    // Apply filters (status applies mainly within upcoming; route + date everywhere).
    const filtered = useMemo(() => {
        return entries.filter((e) => {
            if (statusFilter !== "All" && e.status !== statusFilter) return false;
            if (routeQuery.trim()) {
                const q = routeQuery.trim().toLowerCase();
                const hay = `${e.ride.source || ""} ${e.ride.destination || ""}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            if (dateFilter) {
                const rideDay = e.ride.timing ? new Date(e.ride.timing).toISOString().slice(0, 10) : "";
                if (rideDay !== dateFilter) return false;
            }
            return true;
        });
    }, [entries, statusFilter, routeQuery, dateFilter]);

    const counts = {
        upcoming: booked.length,
        completed: history.length,
        cancelled: cancelled.length,
    };

    // Overview metrics for the right rail.
    const totalBookings = counts.upcoming + counts.completed + counts.cancelled;
    const totalSpent = useMemo(() => {
        const all = [...booked, ...history];
        return all.reduce((sum, r) => {
            const b = myBooking(r, userId);
            const s = (b && typeof b === "object" && b.seats) || 1;
            // Use the passenger's LOCKED fare (segment/partial-aware); fall back
            // to the flat price for legacy bookings without a stored fare.
            const fare = Number(b?.fareAmount) || (Number(r.pricePerPerson) || 0) * s;
            return sum + fare;
        }, 0);
    }, [booked, history, userId]);
    const pax = impact?.passenger || null;
    const totalDistanceKm = pax ? Number(pax.sharedDistanceKm || 0) : 0;
    const totalSavedInr = pax ? Number(pax.moneySavedInr || 0) : 0;
    const co2SavedKg = pax ? Number(pax.co2SavedKg || 0) : 0;

    const statusOptions = [
        { value: "All", label: "All statuses" },
        { value: "Confirmed", label: "Confirmed" },
        { value: "Completed", label: "Completed" },
        { value: "Cancelled", label: "Cancelled" },
    ];

    const clearFilters = () => { setStatusFilter("All"); setRouteQuery(""); setDateFilter(""); };
    const hasFilters = statusFilter !== "All" || routeQuery.trim() || dateFilter;

    return (
        <div className="mb-root">
            {/* Top bar */}
            <div className="mb-topbar">
                {onOpenSidebar && (
                    <button type="button" className="mb-hamburger" onClick={onOpenSidebar} aria-label="Open menu">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                    </button>
                )}
                <div className="mb-heading">
                    <h1 className="mb-page-title">My Bookings</h1>
                    <p className="mb-subtitle">Track and manage all your ride bookings</p>
                </div>
            </div>

            {/* Stats */}
            <div className="mb-stats">
                <div className="mb-stat">
                    <span className="mb-stat-icon accent-violet"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg></span>
                    <div><div className="mb-stat-value">{loading ? "—" : counts.upcoming}</div><div className="mb-stat-label">Upcoming</div><div className="mb-stat-sub">Bookings</div></div>
                </div>
                <div className="mb-stat">
                    <span className="mb-stat-icon accent-green"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="9 12 11.5 14.5 16 9.5" /></svg></span>
                    <div><div className="mb-stat-value">{loading ? "—" : counts.completed}</div><div className="mb-stat-label">Completed</div><div className="mb-stat-sub">Bookings</div></div>
                </div>
                <div className="mb-stat">
                    <span className="mb-stat-icon accent-red"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg></span>
                    <div><div className="mb-stat-value">{loading ? "—" : counts.cancelled}</div><div className="mb-stat-label">Cancelled</div><div className="mb-stat-sub">Bookings</div></div>
                </div>
                <div className="mb-stat">
                    <span className="mb-stat-icon accent-blue"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg></span>
                    <div><div className="mb-stat-value">{loading ? "—" : totalBookings}</div><div className="mb-stat-label">Total Bookings</div><div className="mb-stat-sub">All time</div></div>
                </div>
            </div>

            {/* Filter bar */}
            <div className="mb-filterbar">
                <div className="mb-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    <input className="mb-search-input" placeholder="Search by pickup or destination" value={routeQuery} onChange={(e) => setRouteQuery(e.target.value)} aria-label="Search by pickup or destination" />
                </div>
                <div className="mb-fb-item"><input id="mb-date" type="date" className="mb-input" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} aria-label="Filter by date" /></div>
                <div className="mb-fb-item"><ThemedSelect id="mb-status" theme="dark" value={statusFilter} onChange={setStatusFilter} options={statusOptions} ariaLabel="Status filter" /></div>
                <button className={`mb-filterbar-btn${hasFilters ? " active" : ""}`} onClick={clearFilters} title={hasFilters ? "Clear filters" : "Filters"}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                    Filter
                </button>
            </div>

            {/* Two-column layout: bookings + rail */}
            <div className="mb-layout">
                <div className="mb-main">
                    {/* Tabs */}
                    <div className="mb-tabs" role="tablist">
                        {[
                            ["upcoming", "Upcoming"],
                            ["completed", "Completed"],
                            ["cancelled", "Cancelled"],
                        ].map(([key, label]) => (
                            <button key={key} className={`mb-tab${tab === key ? " active" : ""}`} onClick={() => setTab(key)} role="tab" aria-selected={tab === key}>
                                {label}
                                <span className="mb-tab-count">{counts[key]}</span>
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    {loading ? (
                        <div className="mb-grid">
                            <div className="mb-skeleton" /><div className="mb-skeleton" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="mb-empty">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                            <p className="mb-empty-title">
                                {hasFilters ? "No bookings match your filters" : tab === "upcoming" ? "No upcoming bookings" : tab === "completed" ? "No completed rides yet" : "No cancelled bookings"}
                            </p>
                            <p className="mb-empty-sub">
                                {hasFilters ? "Try clearing filters to see more." : tab === "upcoming" ? "Looks like you haven't booked any rides yet. Find a ride and start your journey." : "Your rides will appear here."}
                            </p>
                            <div className="mb-empty-actions">
                                {hasFilters ? <button className="mb-btn ghost" onClick={clearFilters}>Clear Filters</button> : null}
                                <button className="mb-btn" onClick={() => onNavigate?.("findRides")}>Find a Ride</button>
                            </div>
                        </div>
                    ) : (
                        <div className="mb-grid">
                            {filtered.map((e) => (
                                <BookingCard
                                    key={e.ride._id}
                                    ride={e.ride}
                                    status={e.status}
                                    seats={e.seats}
                                    canCancel={e.canCancel}
                                    unpaidFare={e.unpaidFare}
                                    paying={payingId === e.ride._id}
                                    onPay={payForBooking}
                                    onView={() => setDetailsEntry(e)}
                                    onViewRoute={(r) => setRouteRide(r)}
                                    onTrack={(r) => setTrackRide(r)}
                                    onCancel={(r) => setCancelRideTarget(r)}
                                    onRate={(r) => setReviewRide(r)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Right rail */}
                <aside className="mb-rail">
                    {/* Quick Actions */}
                    <section className="mb-rail-card">
                        <h2 className="mb-rail-title">⚡ Quick Actions</h2>
                        <button className="mb-qa" onClick={() => onNavigate?.("findRides")}>
                            <span className="mb-qa-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg></span>
                            <span className="mb-qa-text"><span className="mb-qa-title">Find a Ride</span><span className="mb-qa-sub">Search available rides near you</span></span>
                            <svg className="mb-qa-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                        <button className="mb-qa" onClick={() => onNavigate?.("myRides")}>
                            <span className="mb-qa-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" /></svg></span>
                            <span className="mb-qa-text"><span className="mb-qa-title">Your Rides</span><span className="mb-qa-sub">View rides posted by you</span></span>
                            <svg className="mb-qa-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                        <button className="mb-qa" onClick={() => onNavigate?.("rideHistory")}>
                            <span className="mb-qa-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg></span>
                            <span className="mb-qa-text"><span className="mb-qa-title">Ride History</span><span className="mb-qa-sub">View your past bookings</span></span>
                            <svg className="mb-qa-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                    </section>

                    {/* Booking Overview */}
                    <section className="mb-rail-card">
                        <h2 className="mb-rail-title">Booking Overview</h2>
                        <ul className="mb-overview">
                            <li className="mb-ov-row">
                                <span className="mb-ov-k"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg> Total Distance</span>
                                <span className="mb-ov-v">{loading ? "—" : `${totalDistanceKm.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`}</span>
                            </li>
                            <li className="mb-ov-row">
                                <span className="mb-ov-k"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg> Total Spent</span>
                                <span className="mb-ov-v">{loading ? "—" : `₹${totalSpent}`}</span>
                            </li>
                            <li className="mb-ov-row">
                                <span className="mb-ov-k"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fcd34d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h3.5a1.75 1.75 0 0 1 0 3.5H10a1.75 1.75 0 0 0 0 3.5h3.5" /></svg> Total Saved</span>
                                <span className="mb-ov-v">{loading ? "—" : `₹${totalSavedInr}`}</span>
                            </li>
                            <li className="mb-ov-row">
                                <span className="mb-ov-k"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></svg> CO₂ Saved</span>
                                <span className="mb-ov-v">{loading ? "—" : `${co2SavedKg.toLocaleString("en-IN", { maximumFractionDigits: 1 })} kg`}</span>
                            </li>
                        </ul>
                    </section>

                    {/* Shared rides nudge */}
                    <section className="mb-rail-card mb-shared" role="button" tabIndex={0} onClick={() => onNavigate?.("findRides")} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onNavigate?.("findRides")}>
                        <span className="mb-shared-icon" aria-hidden="true">🌱</span>
                        <h2 className="mb-rail-title">Save more with shared rides</h2>
                        <p className="mb-shared-sub">Book shared rides and save more while contributing to a greener campus.</p>
                    </section>
                </aside>
            </div>

            {detailsEntry && (
                <BookingDetailsModal
                    entry={detailsEntry}
                    onClose={() => setDetailsEntry(null)}
                    onCancel={(r) => setCancelRideTarget(r)}
                />
            )}
            {routeRide && (
                <RouteModal ride={routeRide} onClose={() => setRouteRide(null)} />
            )}
            {trackRide && (
                <div className="mb-track-overlay">
                    <Suspense fallback={<div className="mb-track-loading"><span className="mb-spin" /> Loading tracking…</div>}>
                        <RideTracking rideId={trackRide._id} user={user} onClose={() => { setTrackRide(null); load(); }} />
                    </Suspense>
                </div>
            )}
            {cancelRideTarget && (
                <CancelConfirm
                    ride={cancelRideTarget}
                    busy={cancelBusy}
                    onKeep={() => setCancelRideTarget(null)}
                    onConfirm={confirmCancel}
                />
            )}
            {reviewRide && reviewRide.user_id && (
                <Suspense fallback={null}>
                    <ReviewModal
                        pending={{
                            rideId: reviewRide._id,
                            reviewee: {
                                _id: reviewRide.user_id._id || reviewRide.user_id,
                                name: reviewRide.user_id.name,
                                profilePicture: reviewRide.user_id.profilePicture || "",
                                role: reviewRide.user_id.role,
                            },
                            direction: "passengerToDriver",
                            source: reviewRide.source,
                            destination: reviewRide.destination,
                            timing: reviewRide.timing,
                        }}
                        onClose={() => setReviewRide(null)}
                        onSubmitted={() => setReviewRide(null)}
                    />
                </Suspense>
            )}
        </div>
    );
};

const MyBookings = ({ user, onOpenSidebar, onNavigate }) => (
    <MapsProvider>
        <MyBookingsInner user={user} onOpenSidebar={onOpenSidebar} onNavigate={onNavigate} />
    </MapsProvider>
);

export default MyBookings;
