import { useState, useEffect, useCallback, useMemo } from "react";
import { GoogleMap, Marker, Polyline } from "@react-google-maps/api";
import axiosInstance from "../utils/axiosConfig";
import { toast } from "react-toastify";
import { API_BASE_URL } from "../utils/constants";
import { DARK_MAP_STYLE } from "../config/googleMapsConfig";
import { haversineKm } from "../utils/mapUtils";
import MapsProvider, { useMaps } from "./maps/MapsProvider";
import LiveRideMap from "./maps/LiveRideMap";
import ThemedSelect from "./ThemedSelect";
import "../styles/rideHistory.css";

const hasCoords = (c) => c && typeof c.lat === "number" && typeof c.lng === "number";
const idStr = (v) => (v == null ? null : typeof v === "string" ? v : v._id ? v._id.toString() : v.toString());
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—");

// Per-passenger seat count (default 1 for legacy bookings).
const myBooking = (ride, userId) =>
    (ride.passengers || []).find((p) => {
        const pid = p?.user_id?._id || p?.user_id || p;
        return pid && (pid.toString() === userId || pid === userId);
    });

/* ---------------- mini route map ---------------- */
const dotIcon = (color) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
    const icon = { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg) };
    if (window.google?.maps?.Size) icon.scaledSize = new window.google.maps.Size(16, 16);
    if (window.google?.maps?.Point) icon.anchor = new window.google.maps.Point(8, 8);
    return icon;
};
function MiniRouteMap({ ride, onRouteInfo }) {
    const { isLoaded } = useMaps();
    const [route, setRoute] = useState(null);
    const [mapRef, setMapRef] = useState(null);
    const s = ride.sourceCoords, d = ride.destinationCoords;

    useEffect(() => {
        if (!isLoaded || !window.google || !mapRef || !hasCoords(s) || !hasCoords(d)) return;
        const b = new window.google.maps.LatLngBounds();
        b.extend(s); b.extend(d);
        const t = setTimeout(() => mapRef.fitBounds?.(b, { top: 22, right: 22, bottom: 22, left: 22 }), 60);
        return () => clearTimeout(t);
    }, [isLoaded, mapRef, s, d]);

    useEffect(() => {
        if (!isLoaded || !window.google || !hasCoords(s) || !hasCoords(d)) return;
        const svc = new window.google.maps.DirectionsService();
        svc.route({ origin: s, destination: d, travelMode: window.google.maps.TravelMode.DRIVING }, (result, status) => {
            if (status === window.google.maps.DirectionsStatus.OK && result?.routes?.[0]) {
                const r = result.routes[0];
                const path = Array.isArray(r.overview_path) && r.overview_path.length
                    ? r.overview_path
                    : (r.overview_polyline?.points && window.google.maps.geometry?.encoding
                        ? window.google.maps.geometry.encoding.decodePath(r.overview_polyline.points) : null);
                setRoute(path);
                // Reuse this same (already-made) call to report road distance + ETA.
                const leg = r.legs?.[0];
                if (leg && onRouteInfo) onRouteInfo({ distance: leg.distance?.text || null, duration: leg.duration?.text || null });
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, s, d]);

    if (!hasCoords(s) || !hasCoords(d)) return <div className="rh-mini-map placeholder"><span>No route preview</span></div>;
    if (!isLoaded) return <div className="rh-mini-map placeholder"><span className="rh-spin" /></div>;
    return (
        <div className="rh-mini-map">
            <GoogleMap onLoad={setMapRef} center={s} zoom={11} mapContainerStyle={{ width: "100%", height: "100%" }}
                options={{ styles: DARK_MAP_STYLE, backgroundColor: "#0f0f10", disableDefaultUI: true, gestureHandling: "none", clickableIcons: false, keyboardShortcuts: false }}>
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

function StatCard({ icon, label, value, sub, accent }) {
    return (
        <div className={`rh-stat accent-${accent || "violet"}`}>
            <div className="rh-stat-head">
                <span className="rh-stat-icon">{icon}</span>
                <span className="rh-stat-label">{label}</span>
                <svg className="rh-stat-spark" viewBox="0 0 64 24" fill="none" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M1 18 L10 12 L18 16 L27 7 L36 13 L45 5 L54 10 L63 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </div>
            <div className="rh-stat-value">{value}</div>
            {sub ? <div className="rh-stat-sub">{sub}</div> : null}
        </div>
    );
}

/* ---------------- history card ---------------- */
function HistoryCard({ ride, role, fare, counterpart, onView, onViewRoute }) {
    const [routeInfo, setRouteInfo] = useState(null);
    // Instant straight-line estimate as a fallback until the road route resolves.
    const approxKm = (hasCoords(ride.sourceCoords) && hasCoords(ride.destinationCoords))
        ? haversineKm(ride.sourceCoords, ride.destinationCoords) : null;
    const distanceLabel = routeInfo?.distance || (approxKm != null ? `~${approxKm.toFixed(1)} km` : null);
    const etaLabel = routeInfo?.duration || null;

    return (
        <article className="rh-card">
            <div className="rh-card-mapwrap"><MiniRouteMap ride={ride} onRouteInfo={setRouteInfo} /></div>
            <div className="rh-card-body">
                <div className="rh-card-top">
                    <span className={`rh-role ${role.toLowerCase()}`}>{role === "Driver" ? "You drove" : "You rode"}</span>
                    <span className="rh-completed">✓ Completed</span>
                </div>

                <div className="rh-route">
                    <div className="rh-route-line"><span className="rh-dot pickup" /><span className="rh-route-text" title={ride.source}>{ride.source || "—"}</span></div>
                    <div className="rh-route-conn" />
                    <div className="rh-route-line"><span className="rh-dot drop" /><span className="rh-route-text" title={ride.destination}>{ride.destination || "—"}</span></div>
                </div>

                {(distanceLabel || etaLabel) && (
                    <div className="rh-trip-chips">
                        {distanceLabel && (
                            <span className="rh-chip">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z" /></svg>
                                {distanceLabel}
                            </span>
                        )}
                        {etaLabel && (
                            <span className="rh-chip">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
                                {etaLabel}
                            </span>
                        )}
                    </div>
                )}

                <div className="rh-meta-grid">
                    <div className="rh-meta"><span className="rh-meta-k">Date</span><span className="rh-meta-v">{fmtDate(ride.timing)}</span></div>
                    <div className="rh-meta"><span className="rh-meta-k">Time</span><span className="rh-meta-v">{fmtTime(ride.timing)}</span></div>
                    <div className="rh-meta"><span className="rh-meta-k">{role === "Driver" ? "Passengers" : "Driver"}</span><span className="rh-meta-v">{counterpart}</span></div>
                    <div className="rh-meta"><span className="rh-meta-k">{role === "Driver" ? "Earned" : "Paid"}</span><span className="rh-meta-v">{fare ? `₹${fare}` : "Free"}</span></div>
                </div>

                <div className="rh-card-actions">
                    <button className="rh-act" onClick={() => onView(ride, role)}>Details</button>
                    {hasCoords(ride.sourceCoords) && hasCoords(ride.destinationCoords) && (
                        <button className="rh-act" onClick={() => onViewRoute(ride)}>View Route</button>
                    )}
                </div>
            </div>
        </article>
    );
}

/* ---------------- details modal ---------------- */
function DetailsModal({ entry, onClose }) {
    const { ride, role, fare, counterpartName } = entry;
    const v = ride.vehicle_id || {};
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (
        <div className="rh-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="rh-modal" role="dialog" aria-modal="true" aria-label="Ride details">
                <div className="rh-modal-head">
                    <h2 className="rh-modal-title">Trip Details</h2>
                    <button className="rh-modal-close" onClick={onClose} aria-label="Close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>
                <div className="rh-modal-body">
                    <div className="rh-modal-statusrow">
                        <span className={`rh-role ${role.toLowerCase()}`}>{role === "Driver" ? "You drove" : "You rode"}</span>
                        <span className="rh-completed">✓ Completed</span>
                    </div>
                    {hasCoords(ride.sourceCoords) && hasCoords(ride.destinationCoords) && (
                        <div className="rh-modal-map">
                            <LiveRideMap sourceCoords={ride.sourceCoords} destinationCoords={ride.destinationCoords} source={ride.source} destination={ride.destination} pricePerPerson={ride.pricePerPerson} />
                        </div>
                    )}
                    <div className="rh-route" style={{ margin: "0.2rem 0" }}>
                        <div className="rh-route-line"><span className="rh-dot pickup" /><span className="rh-route-text">{ride.source}</span></div>
                        <div className="rh-route-conn" />
                        <div className="rh-route-line"><span className="rh-dot drop" /><span className="rh-route-text">{ride.destination}</span></div>
                    </div>
                    <div className="rh-modal-stats">
                        <div className="rh-meta"><span className="rh-meta-k">Date</span><span className="rh-meta-v">{fmtDate(ride.timing)}</span></div>
                        <div className="rh-meta"><span className="rh-meta-k">Time</span><span className="rh-meta-v">{fmtTime(ride.timing)}</span></div>
                        <div className="rh-meta"><span className="rh-meta-k">Vehicle</span><span className="rh-meta-v">{v.make ? `${v.make} ${v.model}` : "—"}</span></div>
                        <div className="rh-meta"><span className="rh-meta-k">{role === "Driver" ? "Passengers" : "Driver"}</span><span className="rh-meta-v">{counterpartName}</span></div>
                        <div className="rh-meta"><span className="rh-meta-k">{role === "Driver" ? "Earned" : "Paid"}</span><span className="rh-meta-v">{fare ? `₹${fare}` : "Free"}</span></div>
                        <div className="rh-meta"><span className="rh-meta-k">Type</span><span className="rh-meta-v">{v.vehicleType || "—"}</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ---------------- route preview modal ---------------- */
function RouteModal({ ride, onClose }) {
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (
        <div className="rh-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="rh-modal" role="dialog" aria-modal="true" aria-label="Route preview">
                <div className="rh-modal-head">
                    <h2 className="rh-modal-title">Route Preview</h2>
                    <button className="rh-modal-close" onClick={onClose} aria-label="Close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>
                <div className="rh-modal-body">
                    <div className="rh-modal-map">
                        <LiveRideMap sourceCoords={ride.sourceCoords} destinationCoords={ride.destinationCoords} source={ride.source} destination={ride.destination} pricePerPerson={ride.pricePerPerson} />
                    </div>
                </div>
            </div>
        </div>
    );
}

/* =======================================================
   RideHistory (main)
   ======================================================= */
const RideHistoryInner = ({ user, onOpenSidebar, onNavigate }) => {
    const [rides, setRides] = useState([]);
    const [loading, setLoading] = useState(true);
    const [roleFilter, setRoleFilter] = useState("All");
    const [routeQuery, setRouteQuery] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [sortBy, setSortBy] = useState("recent");
    const [detailsEntry, setDetailsEntry] = useState(null);
    const [routeRide, setRouteRide] = useState(null);
    const [summaryScope, setSummaryScope] = useState("month");
    const userId = user?.id || user?._id;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get(`${API_BASE_URL}/rides/history`);
            setRides(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            if (error.response?.status !== 404) toast.error("Failed to load ride history.");
            setRides([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Normalize each ride into an entry with role, fare, counterpart label.
    const entries = useMemo(() => {
        return rides.map((ride) => {
            const driverId = idStr(ride.user_id);
            const isDriver = driverId === userId;
            const role = isDriver ? "Driver" : "Passenger";
            const booking = myBooking(ride, userId);
            const seats = (booking && typeof booking === "object" && booking.seats) || 1;
            const per = ride.pricePerPerson || 0;
            let fare = 0;
            let counterpartName = "—";
            if (isDriver) {
                // Sum each passenger's locked fare (segment-aware); fall back to flat price.
                fare = (ride.passengers || []).reduce((sum, p) => sum + (Number(p?.fareAmount) || (per * ((p?.seats) || 1))), 0);
                counterpartName = `${(ride.passengers || []).length} passenger${(ride.passengers || []).length !== 1 ? "s" : ""}`;
            } else {
                // Passenger pays their LOCKED fare (segment/partial), not the flat price.
                fare = Number(booking?.fareAmount) || (per * seats);
                counterpartName = ride.user_id?.name ? ride.user_id.name.split(" ")[0] : "Driver";
            }
            return { ride, role, fare, counterpartName, counterpart: counterpartName };
        });
    }, [rides, userId]);

    // Stats.
    const stats = useMemo(() => {
        const asDriver = entries.filter((e) => e.role === "Driver").length;
        const asPassenger = entries.filter((e) => e.role === "Passenger").length;
        const earned = entries.filter((e) => e.role === "Driver").reduce((s, e) => s + (e.fare || 0), 0);
        const spent = entries.filter((e) => e.role === "Passenger").reduce((s, e) => s + (e.fare || 0), 0);
        return { total: entries.length, asDriver, asPassenger, earned, spent };
    }, [entries]);

    // Filters + sort.
    const filtered = useMemo(() => {
        let list = entries.filter((e) => {
            if (roleFilter !== "All" && e.role !== roleFilter) return false;
            if (routeQuery.trim()) {
                const q = routeQuery.trim().toLowerCase();
                if (!`${e.ride.source || ""} ${e.ride.destination || ""}`.toLowerCase().includes(q)) return false;
            }
            const t = e.ride.timing ? new Date(e.ride.timing).getTime() : 0;
            if (fromDate && t < new Date(fromDate).setHours(0, 0, 0, 0)) return false;
            if (toDate && t > new Date(toDate).setHours(23, 59, 59, 999)) return false;
            return true;
        });
        list = [...list].sort((a, b) => {
            const ta = new Date(a.ride.timing).getTime(), tb = new Date(b.ride.timing).getTime();
            return sortBy === "oldest" ? ta - tb : tb - ta;
        });
        return list;
    }, [entries, roleFilter, routeQuery, fromDate, toDate, sortBy]);

    const clearFilters = () => { setRoleFilter("All"); setRouteQuery(""); setFromDate(""); setToDate(""); };
    const hasFilters = roleFilter !== "All" || routeQuery.trim() || fromDate || toDate;

    // Right-rail Trip Summary (scoped to this month or all time).
    const summary = useMemo(() => {
        const now = new Date();
        const list = entries.filter((e) => {
            if (summaryScope === "all") return true;
            const d = e.ride.timing ? new Date(e.ride.timing) : null;
            return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        let distanceKm = 0, minutes = 0;
        list.forEach((e) => {
            const r = e.ride;
            const dk = Number.isFinite(r.route?.distanceKm) && r.route.distanceKm > 0
                ? r.route.distanceKm
                : (hasCoords(r.sourceCoords) && hasCoords(r.destinationCoords) ? haversineKm(r.sourceCoords, r.destinationCoords) : 0);
            distanceKm += dk || 0;
            if (Number.isFinite(r.route?.durationMin)) minutes += r.route.durationMin;
        });
        return { trips: list.length, distanceKm, minutes };
    }, [entries, summaryScope]);

    // Most frequent routes across all completed trips.
    const topRoutes = useMemo(() => {
        const map = new Map();
        entries.forEach((e) => {
            if (!e.ride.source || !e.ride.destination) return;
            const key = `${e.ride.source.split(",")[0]} → ${e.ride.destination.split(",")[0]}`;
            map.set(key, (map.get(key) || 0) + 1);
        });
        return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([route, count]) => ({ route, count }));
    }, [entries]);

    const fmtMinutes = (m) => `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
    const summaryScopeOptions = [{ value: "month", label: "This Month" }, { value: "all", label: "All time" }];

    // Export the currently filtered history to CSV.
    const exportCSV = () => {
        if (filtered.length === 0) { toast.info("Nothing to export."); return; }
        const rows = [["Date", "Time", "Role", "From", "To", "Vehicle", "Counterpart", "Amount (INR)"]];
        filtered.forEach((e) => {
            const v = e.ride.vehicle_id || {};
            rows.push([
                fmtDate(e.ride.timing), fmtTime(e.ride.timing), e.role,
                e.ride.source || "", e.ride.destination || "",
                v.make ? `${v.make} ${v.model}` : "", e.counterpartName, e.fare || 0,
            ]);
        });
        const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ride-history-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Exported ride history.");
    };

    const roleOptions = [
        { value: "All", label: "All trips" },
        { value: "Driver", label: "As driver" },
        { value: "Passenger", label: "As passenger" },
    ];
    const sortOptions = [
        { value: "recent", label: "Most recent" },
        { value: "oldest", label: "Oldest first" },
    ];

    return (
        <div className="rh-root">
            <div className="rh-topbar">
                {onOpenSidebar && (
                    <button type="button" className="rh-hamburger" onClick={onOpenSidebar} aria-label="Open menu">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                    </button>
                )}
                <span className="rh-title-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
                </span>
                <div className="rh-heading">
                    <h1 className="rh-page-title">Ride History</h1>
                    <p className="rh-subtitle">Your completed trips, as a driver and a passenger</p>
                </div>
                {entries.length > 0 && (
                    <button className="rh-btn ghost rh-export" onClick={exportCSV}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        <span>Export CSV</span>
                    </button>
                )}
            </div>

            {/* Stats */}
            <div className="rh-stats">
                <StatCard accent="violet" label="Total Trips" sub="View all your completed trips" value={loading ? "—" : stats.total} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>} />
                <StatCard accent="blue" label="As Driver" sub="Trips completed as driver" value={loading ? "—" : stats.asDriver} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" /></svg>} />
                <StatCard accent="green" label="As Passenger" sub="Trips completed as passenger" value={loading ? "—" : stats.asPassenger} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" /><path d="M12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" /></svg>} />
                <StatCard accent="amber" label="Earned / Paid" sub="Total earnings and payments" value={loading ? "—" : `₹${stats.earned} / ₹${stats.spent}`} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>} />
            </div>

            {/* Filters */}
            <div className="rh-filters">
                <div className="rh-filter grow">
                    <label className="rh-filter-label" htmlFor="rh-route">Search route</label>
                    <input id="rh-route" className="rh-input" placeholder="Pickup or destination" value={routeQuery} onChange={(e) => setRouteQuery(e.target.value)} />
                </div>
                <div className="rh-filter">
                    <label className="rh-filter-label" htmlFor="rh-from">From</label>
                    <input id="rh-from" type="date" className="rh-input" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <div className="rh-filter">
                    <label className="rh-filter-label" htmlFor="rh-to">To</label>
                    <input id="rh-to" type="date" className="rh-input" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} />
                </div>
                <div className="rh-filter">
                    <label className="rh-filter-label" htmlFor="rh-role">Role</label>
                    <ThemedSelect id="rh-role" theme="dark" value={roleFilter} onChange={setRoleFilter} options={roleOptions} ariaLabel="Role filter" />
                </div>
                <div className="rh-filter">
                    <label className="rh-filter-label" htmlFor="rh-sort">Sort</label>
                    <ThemedSelect id="rh-sort" theme="dark" value={sortBy} onChange={setSortBy} options={sortOptions} ariaLabel="Sort" />
                </div>
                {hasFilters ? <button className="rh-btn ghost rh-clear" onClick={clearFilters}>Clear</button> : null}
            </div>

            {/* Content + rail */}
            <div className="rh-layout">
                <div className="rh-main">
                    {loading ? (
                        <div className="rh-grid"><div className="rh-skeleton" /><div className="rh-skeleton" /></div>
                    ) : entries.length === 0 ? (
                        <div className="rh-empty">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                            <p className="rh-empty-title">No completed rides yet</p>
                            <p className="rh-empty-sub">Once you complete a ride as a driver or passenger, it'll show up here.</p>
                            <button className="rh-btn" onClick={() => onNavigate?.("findRides")}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                Find a Ride
                            </button>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="rh-empty">
                            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                            <p className="rh-empty-title">No trips match your filters</p>
                            <p className="rh-empty-sub">Try widening the date range or clearing filters.</p>
                            <button className="rh-btn ghost" onClick={clearFilters}>Clear Filters</button>
                        </div>
                    ) : (
                        <>
                            <div className="rh-result-count">{filtered.length} trip{filtered.length !== 1 ? "s" : ""}</div>
                            <div className="rh-grid">
                                {filtered.map((e) => (
                                    <HistoryCard
                                        key={e.ride._id}
                                        ride={e.ride}
                                        role={e.role}
                                        fare={e.fare}
                                        counterpart={e.counterpart}
                                        onView={() => setDetailsEntry(e)}
                                        onViewRoute={(rd) => setRouteRide(rd)}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Right rail */}
                <aside className="rh-rail">
                    {/* Trip Summary */}
                    <section className="rh-rail-card">
                        <div className="rh-rail-head">
                            <h2 className="rh-rail-title">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
                                Trip Summary
                            </h2>
                            <div className="rh-rail-scope">
                                <ThemedSelect id="rh-scope" theme="dark" value={summaryScope} onChange={setSummaryScope} options={summaryScopeOptions} ariaLabel="Summary period" />
                            </div>
                        </div>
                        <ul className="rh-summary">
                            <li className="rh-summary-row"><span>Trips Completed</span><span className="rh-summary-v">{loading ? "—" : summary.trips}</span></li>
                            <li className="rh-summary-row"><span>Distance Travelled</span><span className="rh-summary-v">{loading ? "—" : `${summary.distanceKm.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`}</span></li>
                            <li className="rh-summary-row"><span>Time Spent</span><span className="rh-summary-v">{loading ? "—" : fmtMinutes(summary.minutes)}</span></li>
                        </ul>
                    </section>

                    {/* Top Routes */}
                    <section className="rh-rail-card">
                        <div className="rh-rail-head">
                            <h2 className="rh-rail-title">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>
                                Top Routes
                            </h2>
                            {topRoutes.length > 0 && hasFilters ? <button className="rh-link" onClick={clearFilters}>View all</button> : null}
                        </div>
                        {topRoutes.length === 0 ? (
                            <div className="rh-routes-empty">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>
                                <p className="rh-routes-empty-title">No routes yet</p>
                                <p className="rh-routes-empty-sub">Your most frequent routes will appear here.</p>
                            </div>
                        ) : (
                            <ul className="rh-routes">
                                {topRoutes.map((r, i) => (
                                    <li key={i} className="rh-route-item">
                                        <span className="rh-route-rank">{i + 1}</span>
                                        <span className="rh-route-name" title={r.route}>{r.route}</span>
                                        <span className="rh-route-count">{r.count}×</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Quick Actions */}
                    <section className="rh-rail-card">
                        <h2 className="rh-rail-title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                            Quick Actions
                        </h2>
                        <div className="rh-qa-row">
                            <button className="rh-qa" onClick={() => onNavigate?.("findRides")}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                Find a Ride
                            </button>
                            <button className="rh-qa" onClick={() => onNavigate?.("createRide")}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" /></svg>
                                Offer a Ride
                            </button>
                        </div>
                    </section>
                </aside>
            </div>

            {detailsEntry && <DetailsModal entry={detailsEntry} onClose={() => setDetailsEntry(null)} />}
            {routeRide && <RouteModal ride={routeRide} onClose={() => setRouteRide(null)} />}
        </div>
    );
};

const RideHistory = ({ user, onOpenSidebar, onNavigate }) => (
    <MapsProvider>
        <RideHistoryInner user={user} onOpenSidebar={onOpenSidebar} onNavigate={onNavigate} />
    </MapsProvider>
);

export default RideHistory;
