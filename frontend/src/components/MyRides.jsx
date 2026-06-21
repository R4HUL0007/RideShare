import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { GoogleMap, Marker, Polyline } from "@react-google-maps/api";
import axiosInstance from "../utils/axiosConfig";
import { toast } from "react-toastify";
import { API_BASE_URL } from "../utils/constants";
import { DARK_MAP_STYLE } from "../config/googleMapsConfig";
import MapsProvider, { useMaps } from "./maps/MapsProvider";
import LiveRideMap from "./maps/LiveRideMap";
import ThemedSelect from "./ThemedSelect";
import "../styles/myRides.css";

const ReviewModal = lazy(() => import("./ReviewModal"));

const hasCoords = (c) => c && typeof c.lat === "number" && typeof c.lng === "number";

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—");
const initials = (name = "") => name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "U";

// Derive a display status for a driver's ride.
const rideStatus = (ride) => {
    if (ride.status === "Cancelled") return "Cancelled";
    if (ride.status === "Completed") return "Completed";
    const t = ride.timing ? new Date(ride.timing).getTime() : 0;
    return t && t < Date.now() ? "Active" : "Upcoming";
};

// Total seats booked across passengers (sum of per-passenger seats; default 1).
const bookedSeats = (ride) =>
    (ride.passengers || []).reduce((sum, p) => sum + ((p && typeof p === "object" && p.seats) || 1), 0);

// Passenger removal allowed within 3 minutes of their booking.
const removeWindowOpen = (p) => {
    if (!p || typeof p !== "object" || !p.bookedAt) return true;
    return (Date.now() - new Date(p.bookedAt).getTime()) / 60000 <= 3;
};

/* ---------------- mini route preview map ---------------- */
const dotIcon = (color) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
    const icon = { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg) };
    if (window.google?.maps?.Size) icon.scaledSize = new window.google.maps.Size(16, 16);
    if (window.google?.maps?.Point) icon.anchor = new window.google.maps.Point(8, 8);
    return icon;
};
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

    if (!hasCoords(s) || !hasCoords(d)) return <div className="mr-mini-map placeholder"><span>Route preview unavailable</span></div>;
    if (!isLoaded) return <div className="mr-mini-map placeholder"><span className="mr-spin" /></div>;
    return (
        <div className="mr-mini-map">
            <GoogleMap
                onLoad={setMapRef}
                center={s}
                zoom={11}
                mapContainerStyle={{ width: "100%", height: "100%" }}
                options={{ styles: DARK_MAP_STYLE, backgroundColor: "#0f0f10", disableDefaultUI: true, gestureHandling: "none", clickableIcons: false, keyboardShortcuts: false }}
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

/* ---------------- status badge + stat card ---------------- */
function StatusBadge({ status }) {
    const cls = { Active: "active", Upcoming: "upcoming", Completed: "completed", Cancelled: "cancelled" }[status] || "upcoming";
    return <span className={`mr-badge ${cls}`}>{status}</span>;
}
function StatCard({ icon, label, value, sub }) {
    return (
        <div className="mr-stat">
            <span className="mr-stat-icon">{icon}</span>
            <div>
                <div className="mr-stat-value">{value}</div>
                <div className="mr-stat-label">{label}</div>
                {sub ? <div className="mr-stat-sub">{sub}</div> : null}
            </div>
        </div>
    );
}

/* ---------------- passenger row ---------------- */
function PassengerRow({ passenger, onRemove, removing, onRate }) {
    const data = passenger.user_id || passenger;
    if (!data || typeof data === "string") return null;
    const seats = (passenger && typeof passenger === "object" && passenger.seats) || 1;
    const canRemove = removeWindowOpen(passenger);
    return (
        <div className="mr-pax">
            <span className="mr-avatar sm mr-avatar-fallback">{initials(data.name)}</span>
            <div className="mr-pax-info">
                <span className="mr-pax-name">{data.name || "Passenger"}</span>
                <span className="mr-pax-meta">
                    {seats} seat{seats !== 1 ? "s" : ""}
                    {data.phoneNumber ? <> · <a className="mr-pax-phone" href={`tel:${data.phoneNumber}`}>{data.phoneNumber}</a></> : ""}
                </span>
            </div>
            {onRate ? (
                <button className="mr-act track" style={{ padding: "0.3rem 0.7rem", fontSize: "0.74rem" }} onClick={() => onRate(data)}>
                    Rate
                </button>
            ) : (
                <span className="mr-pax-status">Confirmed</span>
            )}
            {onRemove && (
                <button
                    className="mr-pax-remove"
                    onClick={() => onRemove(data._id || data)}
                    disabled={!canRemove || removing}
                    title={!canRemove ? "Removal window expired (3 min)" : "Remove passenger"}
                    aria-label="Remove passenger"
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
            )}
        </div>
    );
}

/* ---------------- ride card ---------------- */
function RideCard({ ride, status, onView, onViewRoute, onComplete, onCancel, onTrack }) {
    const v = ride.vehicle_id || {};
    const booked = bookedSeats(ride);
    const remaining = ride.seatsAvailable ?? 0;
    const total = booked + remaining;
    const paxCount = (ride.passengers || []).length;
    return (
        <article className="mr-card">
            <div className="mr-card-mapwrap"><MiniRouteMap ride={ride} /></div>
            <div className="mr-card-body">
                <div className="mr-card-top">
                    <span className="mr-card-vehicle">{v.make ? `${v.make} ${v.model}` : "Your ride"}</span>
                    <StatusBadge status={status} />
                </div>

                <div className="mr-route">
                    <div className="mr-route-line"><span className="mr-dot pickup" /><span className="mr-route-text" title={ride.source}>{ride.source || "—"}</span></div>
                    <div className="mr-route-conn" />
                    <div className="mr-route-line"><span className="mr-dot drop" /><span className="mr-route-text" title={ride.destination}>{ride.destination || "—"}</span></div>
                </div>

                <div className="mr-meta-grid">
                    <div className="mr-meta"><span className="mr-meta-k">Date</span><span className="mr-meta-v">{fmtDate(ride.timing)}</span></div>
                    <div className="mr-meta"><span className="mr-meta-k">Departs</span><span className="mr-meta-v">{fmtTime(ride.timing)}</span></div>
                    <div className="mr-meta"><span className="mr-meta-k">Seats</span><span className="mr-meta-v">{booked}/{total} booked</span></div>
                    <div className="mr-meta"><span className="mr-meta-k">Remaining</span><span className="mr-meta-v">{remaining}</span></div>
                </div>

                {paxCount > 0 && (
                    <div className="mr-pax-pill">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                        {paxCount} passenger{paxCount !== 1 ? "s" : ""}
                    </div>
                )}

                <div className="mr-card-actions">
                    <button className="mr-act" onClick={() => onView(ride)}>View Details</button>
                    {status === "Active" && hasCoords(ride.sourceCoords) && hasCoords(ride.destinationCoords) && onTrack && (
                        <button className="mr-act track" onClick={() => onTrack(ride._id)}>Start / Track</button>
                    )}
                    {hasCoords(ride.sourceCoords) && hasCoords(ride.destinationCoords) && (
                        <button className="mr-act" onClick={() => onViewRoute(ride)}>View Route</button>
                    )}
                    {status === "Active" && (
                        <button className="mr-act success" onClick={() => onComplete(ride)}>Complete</button>
                    )}
                    {status !== "Completed" && status !== "Cancelled" && (
                        <button className="mr-act danger" onClick={() => onCancel(ride)}>Cancel</button>
                    )}
                </div>
            </div>
        </article>
    );
}

/* ---------------- details modal ---------------- */
function RideDetailsModal({ ride, status, onClose, onRemovePassenger, removingId, onComplete, onCancel, onRate }) {
    const v = ride.vehicle_id || {};
    const booked = bookedSeats(ride);
    const remaining = ride.seatsAvailable ?? 0;
    const passengers = (ride.passengers || []).filter((p) => (p?.user_id || p) && typeof (p?.user_id || p) !== "string");
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (
        <div className="mr-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="mr-modal" role="dialog" aria-modal="true" aria-label="Ride details">
                <div className="mr-modal-head">
                    <h2 className="mr-modal-title">Ride Details</h2>
                    <button className="mr-modal-close" onClick={onClose} aria-label="Close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>
                <div className="mr-modal-body">
                    <div className="mr-modal-statusrow">
                        <span className="mr-card-vehicle lg">{v.make ? `${v.make} ${v.model}` : "Your ride"}</span>
                        <StatusBadge status={status} />
                    </div>

                    {hasCoords(ride.sourceCoords) && hasCoords(ride.destinationCoords) && (
                        <div className="mr-modal-map">
                            <LiveRideMap sourceCoords={ride.sourceCoords} destinationCoords={ride.destinationCoords} source={ride.source} destination={ride.destination} pricePerPerson={ride.pricePerPerson} />
                        </div>
                    )}

                    <div className="mr-route" style={{ margin: "0.2rem 0" }}>
                        <div className="mr-route-line"><span className="mr-dot pickup" /><span className="mr-route-text">{ride.source}</span></div>
                        <div className="mr-route-conn" />
                        <div className="mr-route-line"><span className="mr-dot drop" /><span className="mr-route-text">{ride.destination}</span></div>
                    </div>

                    <div className="mr-modal-stats">
                        <div className="mr-meta"><span className="mr-meta-k">Vehicle</span><span className="mr-meta-v">{v.make ? `${v.make} ${v.model}` : "—"}</span></div>
                        <div className="mr-meta"><span className="mr-meta-k">Type</span><span className="mr-meta-v">{v.vehicleType || "—"}</span></div>
                        <div className="mr-meta"><span className="mr-meta-k">Number</span><span className="mr-meta-v">{v.licensePlate || "—"}</span></div>
                        <div className="mr-meta"><span className="mr-meta-k">Date</span><span className="mr-meta-v">{fmtDate(ride.timing)}</span></div>
                        <div className="mr-meta"><span className="mr-meta-k">Departs</span><span className="mr-meta-v">{fmtTime(ride.timing)}</span></div>
                        <div className="mr-meta"><span className="mr-meta-k">Seats</span><span className="mr-meta-v">{booked} booked · {remaining} left</span></div>
                    </div>

                    {/* Passenger list */}
                    <div className="mr-pax-section">
                        <div className="mr-pax-head">
                            <h3 className="mr-panel-title" style={{ margin: 0 }}>Passengers</h3>
                            <span className="mr-pax-count">{passengers.length}</span>
                        </div>
                        {passengers.length === 0 ? (
                            <p className="mr-pax-empty">No passengers have booked this ride yet.</p>
                        ) : (
                            <div className="mr-pax-list">
                                {passengers.map((p, i) => (
                                    <PassengerRow
                                        key={i}
                                        passenger={p}
                                        removing={removingId === (p.user_id?._id || p.user_id || p)}
                                        onRemove={status !== "Completed" && status !== "Cancelled" ? (pid) => onRemovePassenger(ride._id, pid) : null}
                                        onRate={status === "Completed" && onRate ? (pax) => onRate(ride, pax) : null}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                {status !== "Completed" && status !== "Cancelled" && (
                    <div className="mr-modal-foot">
                        <button className="mr-btn danger" onClick={() => onCancel(ride)}>Cancel Ride</button>
                        {status === "Active" && (
                            <button className="mr-btn success" onClick={() => onComplete(ride)}>Mark Completed</button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ---------------- route-only modal ---------------- */
function RouteModal({ ride, onClose }) {
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (
        <div className="mr-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="mr-modal" role="dialog" aria-modal="true" aria-label="Route preview">
                <div className="mr-modal-head">
                    <h2 className="mr-modal-title">Route Preview</h2>
                    <button className="mr-modal-close" onClick={onClose} aria-label="Close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>
                <div className="mr-modal-body">
                    <div className="mr-modal-map">
                        <LiveRideMap sourceCoords={ride.sourceCoords} destinationCoords={ride.destinationCoords} source={ride.source} destination={ride.destination} pricePerPerson={ride.pricePerPerson} />
                    </div>
                    <div className="mr-route" style={{ marginTop: "0.2rem" }}>
                        <div className="mr-route-line"><span className="mr-dot pickup" /><span className="mr-route-text">{ride.source}</span></div>
                        <div className="mr-route-conn" />
                        <div className="mr-route-line"><span className="mr-dot drop" /><span className="mr-route-text">{ride.destination}</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ---------------- generic confirm ---------------- */
function ConfirmDialog({ title, text, confirmLabel, danger, busy, onCancel, onConfirm }) {
    return (
        <div className="mr-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
            <div className="mr-confirm" role="dialog" aria-modal="true" aria-label={title}>
                <h3 className="mr-confirm-title">{title}</h3>
                <p className="mr-confirm-text">{text}</p>
                <div className="mr-confirm-actions">
                    <button className="mr-btn ghost" onClick={onCancel} disabled={busy}>Keep</button>
                    <button className={`mr-btn ${danger ? "danger" : "success"}`} onClick={onConfirm} disabled={busy}>
                        {busy ? <><span className="mr-spin" /> Working…</> : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* =======================================================
   MyRides (main)
   ======================================================= */
const MyRidesInner = ({ onOpenSidebar, onNavigate, onTrack }) => {
    const [rides, setRides] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("all");
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");
    const [vehicleFilter, setVehicleFilter] = useState("All");
    const [dateFilter, setDateFilter] = useState("");
    const [sortBy, setSortBy] = useState("latest");
    const [detailsRide, setDetailsRide] = useState(null);
    const [routeRide, setRouteRide] = useState(null);
    const [confirm, setConfirm] = useState(null); // { type: 'cancel'|'complete', ride }
    const [busy, setBusy] = useState(false);
    const [removingId, setRemovingId] = useState(null);
    // Driver-side review: { rideId, reviewee, direction, ... } for a passenger.
    const [reviewTarget, setReviewTarget] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get(`${API_BASE_URL}/rides/user-rides`);
            setRides(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            if (error.response?.status !== 404) toast.error("Failed to load your rides.");
            setRides([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Keep the open details modal in sync with refreshed ride data.
    const syncDetails = (list) => {
        setDetailsRide((cur) => (cur ? list.find((r) => r._id === cur._id) || null : null));
    };

    const doComplete = async (ride) => {
        setBusy(true);
        try {
            await axiosInstance.patch(`${API_BASE_URL}/rides/complete/${ride._id}`, {});
            toast.success("Ride marked as completed!");
            setConfirm(null); setDetailsRide(null);
            load();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to complete ride.");
        } finally { setBusy(false); }
    };

    const doCancel = async (ride) => {
        setBusy(true);
        try {
            await axiosInstance.delete(`${API_BASE_URL}/rides/${ride._id}`);
            toast.success("Ride cancelled successfully.");
            setConfirm(null); setDetailsRide(null);
            load();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to cancel ride.");
        } finally { setBusy(false); }
    };

    const doRemovePassenger = async (rideId, passengerId) => {
        setRemovingId(passengerId);
        try {
            const res = await axiosInstance.delete(`${API_BASE_URL}/rides/${rideId}/passenger/${passengerId}`);
            toast.success("Passenger removed.");
            setRides((prev) => {
                const next = prev.map((r) => (r._id === rideId ? res.data.ride : r));
                syncDetails(next);
                return next;
            });
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to remove passenger.");
        } finally { setRemovingId(null); }
    };

    // Stats.
    const stats = useMemo(() => {
        const active = rides.filter((r) => rideStatus(r) === "Active").length;
        const completed = rides.filter((r) => r.status === "Completed").length;
        const passengers = rides.reduce((sum, r) => sum + bookedSeats(r), 0);
        return { total: rides.length, active, completed, passengers };
    }, [rides]);

    // Tab buckets.
    const buckets = useMemo(() => {
        const b = { all: [], active: [], upcoming: [], completed: [], cancelled: [] };
        rides.forEach((r) => {
            b.all.push(r);
            const s = rideStatus(r);
            if (s === "Cancelled") b.cancelled.push(r);
            else if (s === "Completed") b.completed.push(r);
            else if (s === "Upcoming") b.upcoming.push(r);
            else b.active.push(r);
        });
        return b;
    }, [rides]);

    const counts = { all: buckets.all.length, active: buckets.active.length, upcoming: buckets.upcoming.length, completed: buckets.completed.length, cancelled: buckets.cancelled.length };

    // Soonest upcoming ride for the banner.
    const nextUpcoming = useMemo(() => {
        return [...buckets.upcoming].sort((a, b) => new Date(a.timing) - new Date(b.timing))[0] || null;
    }, [buckets]);

    const vehicleOptions = useMemo(() => {
        const seen = new Map();
        rides.forEach((r) => { if (r.vehicle_id?._id) seen.set(r.vehicle_id._id, `${r.vehicle_id.make} ${r.vehicle_id.model}`); });
        return [{ value: "All", label: "All vehicles" }, ...Array.from(seen, ([value, label]) => ({ value, label }))];
    }, [rides]);

    const statusOptions = [
        { value: "All", label: "All statuses" },
        { value: "Active", label: "Active" },
        { value: "Upcoming", label: "Upcoming" },
        { value: "Completed", label: "Completed" },
        { value: "Cancelled", label: "Cancelled" },
    ];
    const sortOptions = [
        { value: "latest", label: "Latest first" },
        { value: "earliest", label: "Earliest departure" },
        { value: "filled", label: "Most seats filled" },
    ];

    const filtered = useMemo(() => {
        const source = buckets[tab] || [];
        let list = source.filter((r) => {
            if (query.trim()) {
                const q = query.trim().toLowerCase();
                const hay = `${r.source || ""} ${r.destination || ""} ${r._id || ""}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            if (statusFilter !== "All" && rideStatus(r) !== statusFilter) return false;
            if (vehicleFilter !== "All" && r.vehicle_id?._id !== vehicleFilter) return false;
            if (dateFilter) {
                const day = r.timing ? new Date(r.timing).toISOString().slice(0, 10) : "";
                if (day !== dateFilter) return false;
            }
            return true;
        });
        list = [...list].sort((a, b) => {
            if (sortBy === "filled") return bookedSeats(b) - bookedSeats(a);
            if (sortBy === "earliest") return new Date(a.timing) - new Date(b.timing);
            return new Date(b.timing) - new Date(a.timing); // latest first
        });
        return list;
    }, [tab, buckets, statusFilter, vehicleFilter, dateFilter, sortBy, query]);

    const clearFilters = () => { setStatusFilter("All"); setVehicleFilter("All"); setDateFilter(""); setQuery(""); };
    const hasFilters = statusFilter !== "All" || vehicleFilter !== "All" || dateFilter || query;

    return (
        <div className="mr-root">
            <div className="mr-topbar">
                {onOpenSidebar && (
                    <button type="button" className="mr-hamburger" onClick={onOpenSidebar} aria-label="Open menu">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                    </button>
                )}
                <div className="mr-heading">
                    <h1 className="mr-page-title">My Rides 🚗</h1>
                    <p className="mr-subtitle">Manage the rides you've created and track your journey with fellow members.</p>
                </div>
                <button className="mr-btn mr-create" onClick={() => onNavigate?.("createRide")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Create Ride
                </button>
            </div>

            {/* Stats */}
            <div className="mr-stats">
                <StatCard label="Total Rides" sub="All time" value={loading ? "—" : stats.total} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" /></svg>} />
                <StatCard label="Active Rides" sub="Currently running" value={loading ? "—" : stats.active} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>} />
                <StatCard label="Completed" sub="Successfully finished" value={loading ? "—" : stats.completed} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>} />
                <StatCard label="Passengers Served" sub="Total passengers" value={loading ? "—" : stats.passengers} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>} />
            </div>

            {/* Upcoming ride banner */}
            <section className="mr-upcoming">
                <div className="mr-upcoming-main">
                    <span className="mr-upcoming-tag">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        Upcoming Ride
                    </span>
                    {nextUpcoming ? (
                        <>
                            <h2 className="mr-upcoming-title" title={`${nextUpcoming.source} → ${nextUpcoming.destination}`}>{nextUpcoming.source} → {nextUpcoming.destination}</h2>
                            <p className="mr-upcoming-sub">Departing {fmtDate(nextUpcoming.timing)} · {fmtTime(nextUpcoming.timing)}</p>
                        </>
                    ) : (
                        <>
                            <h2 className="mr-upcoming-title">No upcoming rides</h2>
                            <p className="mr-upcoming-sub">You don't have any upcoming rides scheduled.</p>
                        </>
                    )}
                </div>
                <div className="mr-upcoming-side">
                    <svg className="mr-upcoming-car" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
                    </svg>
                    {nextUpcoming ? (
                        <button className="mr-btn" onClick={() => setDetailsRide(nextUpcoming)}>View details</button>
                    ) : (
                        <button className="mr-btn" onClick={() => onNavigate?.("createRide")}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            Create a Ride
                        </button>
                    )}
                </div>
            </section>

            {/* Filter bar */}
            <div className="mr-filterbar">
                <div className="mr-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    <input
                        className="mr-search-input"
                        type="text"
                        placeholder="Search by location or ride ID..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Search rides"
                    />
                </div>
                <div className="mr-fb-item"><ThemedSelect id="mr-status" theme="dark" value={statusFilter} onChange={setStatusFilter} options={statusOptions} ariaLabel="Status filter" /></div>
                <div className="mr-fb-item"><ThemedSelect id="mr-vehicle" theme="dark" value={vehicleFilter} onChange={setVehicleFilter} options={vehicleOptions} ariaLabel="Vehicle filter" /></div>
                <div className="mr-fb-item"><input id="mr-date" type="date" className="mr-input" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} aria-label="Filter by date" /></div>
                <div className="mr-fb-item"><ThemedSelect id="mr-sort" theme="dark" value={sortBy} onChange={setSortBy} options={sortOptions} ariaLabel="Sort rides" /></div>
                <button className={`mr-filterbar-icon${hasFilters ? " active" : ""}`} onClick={clearFilters} title={hasFilters ? "Clear filters" : "Filters"} aria-label="Clear filters">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                </button>
            </div>

            {/* Tabs */}
            <div className="mr-tabs" role="tablist">
                {[["all", "All Rides"], ["active", "Active"], ["upcoming", "Upcoming"], ["completed", "Completed"], ["cancelled", "Cancelled"]].map(([key, label]) => (
                    <button key={key} className={`mr-tab${tab === key ? " active" : ""}`} onClick={() => setTab(key)} role="tab" aria-selected={tab === key}>
                        {label} <span className="mr-tab-count">{counts[key]}</span>
                    </button>
                ))}
            </div>

            {/* Content */}
            {loading ? (
                <div className="mr-grid"><div className="mr-skeleton" /><div className="mr-skeleton" /><div className="mr-skeleton" /></div>
            ) : rides.length === 0 ? (
                <div className="mr-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" /></svg>
                    <p className="mr-empty-title">You haven't created any rides yet</p>
                    <p className="mr-empty-sub">Offer a ride and start sharing your journey with fellow members.</p>
                    <button className="mr-btn" onClick={() => onNavigate?.("createRide")}>🚗 Create Your First Ride</button>
                </div>
            ) : filtered.length === 0 ? (
                <div className="mr-empty">
                    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    <p className="mr-empty-title">No rides in this view</p>
                    <p className="mr-empty-sub">{hasFilters ? "Try clearing filters." : "Nothing here yet."}</p>
                    {hasFilters ? <button className="mr-btn ghost" onClick={clearFilters}>Clear Filters</button> : null}
                </div>
            ) : (
                <div className="mr-grid">
                    {filtered.map((r) => (
                        <RideCard
                            key={r._id}
                            ride={r}
                            status={rideStatus(r)}
                            onView={() => setDetailsRide(r)}
                            onViewRoute={(rd) => setRouteRide(rd)}
                            onTrack={onTrack}
                            onComplete={(rd) => setConfirm({ type: "complete", ride: rd })}
                            onCancel={(rd) => setConfirm({ type: "cancel", ride: rd })}
                        />
                    ))}
                </div>
            )}

            {detailsRide && (
                <RideDetailsModal
                    ride={detailsRide}
                    status={rideStatus(detailsRide)}
                    removingId={removingId}
                    onRemovePassenger={doRemovePassenger}
                    onComplete={(rd) => setConfirm({ type: "complete", ride: rd })}
                    onCancel={(rd) => setConfirm({ type: "cancel", ride: rd })}
                    onRate={(rd, pax) => setReviewTarget({
                        rideId: rd._id,
                        reviewee: {
                            _id: pax._id || pax,
                            name: pax.name,
                            profilePicture: pax.profilePicture || "",
                            role: pax.role,
                        },
                        direction: "driverToPassenger",
                        source: rd.source,
                        destination: rd.destination,
                        timing: rd.timing,
                    })}
                    onClose={() => setDetailsRide(null)}
                />
            )}
            {routeRide && <RouteModal ride={routeRide} onClose={() => setRouteRide(null)} />}
            {confirm && (
                <ConfirmDialog
                    title={confirm.type === "cancel" ? "Cancel this ride?" : "Mark ride as completed?"}
                    text={confirm.type === "cancel"
                        ? `This will cancel your ride to ${confirm.ride.destination}. Booked passengers will be notified, and it'll move to your Cancelled rides. This can't be undone.`
                        : `Mark your ride to ${confirm.ride.destination} as completed? This moves it to your completed rides.`}
                    confirmLabel={confirm.type === "cancel" ? "Cancel Ride" : "Mark Completed"}
                    danger={confirm.type === "cancel"}
                    busy={busy}
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => (confirm.type === "cancel" ? doCancel(confirm.ride) : doComplete(confirm.ride))}
                />
            )}
            {reviewTarget && (
                <Suspense fallback={null}>
                    <ReviewModal
                        pending={reviewTarget}
                        onClose={() => setReviewTarget(null)}
                        onSubmitted={() => setReviewTarget(null)}
                    />
                </Suspense>
            )}
        </div>
    );
};

const MyRides = ({ onOpenSidebar, onNavigate, onTrack }) => (
    <MapsProvider>
        <MyRidesInner onOpenSidebar={onOpenSidebar} onNavigate={onNavigate} onTrack={onTrack} />
    </MapsProvider>
);

export default MyRides;
