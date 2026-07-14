import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import axiosInstance from "../utils/axiosConfig";
import { getUserVehicles } from "../services/vehicleService";
import { getMyImpact } from "../services/sustainabilityService";
import { logoutUser } from "../services/authService";
import { getSuggestions } from "../services/suggestionsService";
import { clearAuthTokens, clearAppCaches } from "../utils/authToken";
import Recommendations from "./Recommendations";

// One-shot bridge: DashboardHome writes a prefill FindRides reads on mount.
const FIND_PREFILL_KEY = "rs_find_prefill";
import { API_BASE_URL } from "../utils/constants";
import carImg from "../assets/images/Car.png";
import "../styles/dashboardHome.css";

/* ---------------- small reusable presentational pieces ---------------- */

const StatCard = ({ icon, label, value, sub, accent, delay = 0 }) => (
    <div className={`dh-stat dh-rise accent-${accent}`} style={{ animationDelay: `${delay}ms` }}>
        <div className="dh-stat-icon">{icon}</div>
        <div className="dh-stat-body">
            <div className="dh-stat-value">{value}</div>
            <div className="dh-stat-label">{label}</div>
            {sub != null && <div className="dh-stat-sub">{sub}</div>}
        </div>
    </div>
);

const QuickAction = ({ icon, title, subtitle, accent, onClick, delay = 0 }) => (
    <button
        type="button"
        className={`dh-action dh-rise accent-${accent}`}
        style={{ animationDelay: `${delay}ms` }}
        onClick={onClick}
    >
        <span className="dh-action-icon">{icon}</span>
        <span className="dh-action-text">
            <span className="dh-action-title">{title}</span>
            <span className="dh-action-sub">{subtitle}</span>
        </span>
        <svg className="dh-action-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
        </svg>
    </button>
);

/* ---------------- inline icons (lightweight, no deps) ---------------- */
const I = {
    car: <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />,
    search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    ticket: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
    wallet: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M16 12h.01M2 10h20" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
    pin: <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
    leaf: <><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    home: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
    chart: <><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></>,
    star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
    trend: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>,
    chevron: <polyline points="9 18 15 12 9 6" />,
    gift: <><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></>,
};

const Svg = ({ children, size = 22 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
);

const formatDateTime = (d) => {
    if (!d) return "";
    try {
        return new Date(d).toLocaleString(undefined, {
            weekday: "short", month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    } catch {
        return "";
    }
};

const timeAgo = (d) => {
    if (!d) return "";
    const diff = (Date.now() - new Date(d).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
};

/**
 * DashboardHome — the dark, modern landing view for the dashboard.
 * Fetches via existing endpoints only; navigates other tabs through `onNavigate`.
 */
const DashboardHome = ({ user, onNavigate, onOpenSidebar }) => {
    const [created, setCreated] = useState([]);
    const [booked, setBooked] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [impact, setImpact] = useState(null);
    const [loading, setLoading] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const navigate = useNavigate();

    // ---- Smart Ride Suggestions (rule-based; additive, degrades gracefully) ----
    const [sugg, setSugg] = useState({ smartCard: null, favoritePlaces: [], frequentDestinations: [], recentSearches: [] });

    useEffect(() => {
        let active = true;
        const load = (coords) => {
            const now = new Date();
            getSuggestions({ lat: coords?.lat, lng: coords?.lng, hour: now.getHours(), day: now.getDay() })
                .then((d) => { if (active) setSugg(d); })
                .catch(() => { /* swallow */ });
        };
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => load({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => load(null),
                { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
            );
        } else {
            load(null);
        }
        return () => { active = false; };
    }, []);

    // One-tap: prefill FindRides with a destination (+ optional pickup) and go.
    const startFind = ({ destination, destinationCoords, source, sourceCoords }) => {
        try {
            localStorage.setItem(FIND_PREFILL_KEY, JSON.stringify({ destination, destinationCoords, source, sourceCoords, ts: Date.now() }));
        } catch { /* ignore */ }
        onNavigate("findRides");
    };
    const coordOrNull = (o) => (o && Number.isFinite(o.lat) && Number.isFinite(o.lng) ? { lat: o.lat, lng: o.lng } : null);
    const greetingWord = (() => {
        const h = new Date().getHours();
        return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    })();

    useEffect(() => {
        let active = true;
        const pick = (r) => (r.status === "fulfilled" && Array.isArray(r.value?.data) ? r.value.data : []);

        (async () => {
            setLoading(true);
            // 404 ("none found") is expected for empty resources — allSettled
            // lets us treat those as empty without error toasts.
            const results = await Promise.allSettled([
                axiosInstance.get(`${API_BASE_URL}/rides/user-rides`),
                axiosInstance.get(`${API_BASE_URL}/rides/my-bookings`),
                getUserVehicles(),
                getMyImpact(),
            ]);
            if (!active) return;
            setCreated(pick(results[0]));
            setBooked(pick(results[1]));
            setVehicles(pick(results[2]));
            if (results[3].status === "fulfilled") setImpact(results[3].value?.data || null);
            setLoading(false);
        })();

        return () => { active = false; };
    }, []);

    // Close the profile menu on outside click.
    useEffect(() => {
        if (!menuOpen) return undefined;
        const onDown = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [menuOpen]);

    const handleLogout = async () => {
        try {
            await logoutUser();
        } catch {
            /* ignore — clear locally regardless */
        }
        localStorage.removeItem("dashboardActiveTab");
        clearAuthTokens();
        await clearAppCaches();
        navigate("/");
        toast.info("You've been logged out");
    };

    // Invite — uses the native share sheet, falls back to clipboard. No backend.
    const handleInvite = async () => {
        const url = window.location.origin;
        const shareData = {
            title: "RidexShare",
            text: "Join me on RidexShare — share rides, save money, travel together.",
            url,
        };
        try {
            if (navigator.share) {
                await navigator.share(shareData);
                return;
            }
            await navigator.clipboard.writeText(url);
            toast.success("Invite link copied to clipboard");
        } catch {
            /* user dismissed the share sheet — no-op */
        }
    };

    /* ---------------- derived stats ---------------- */
    const now = Date.now();
    const WEEK = 7 * 24 * 3600 * 1000;
    const within7 = (d) => {
        if (!d) return false;
        const diff = now - new Date(d).getTime();
        return diff >= 0 && diff <= WEEK;
    };
    const isUpcoming = (r) => {
        const t = r?.timing ? new Date(r.timing).getTime() : 0;
        return t > now && r.status !== "Completed" && r.status !== "Cancelled";
    };
    const upcoming = [...created, ...booked]
        .filter(isUpcoming)
        .sort((a, b) => new Date(a.timing) - new Date(b.timing));
    const nextRide = upcoming[0] || null;

    const userId = user?.id || user?._id;
    const bookingTime = (r) => {
        if (Array.isArray(r.passengers)) {
            const mine = r.passengers.find((p) => {
                const pid = p?.user_id?._id || p?.user_id || p;
                return pid && (pid.toString() === userId);
            });
            if (mine?.bookedAt) return mine.bookedAt;
        }
        return r.createdAt;
    };

    // Money saved (estimate): sum of per-person price across the rides booked.
    const moneySaved = booked.reduce((sum, r) => sum + (Number(r.pricePerPerson) || 0), 0);

    // "this week" deltas (display-only, derived from existing data).
    const createdThisWeek = created.filter((r) => within7(r.createdAt)).length;
    const bookedThisWeek = booked.filter((r) => within7(bookingTime(r))).length;
    const upcomingThisWeek = upcoming.filter((r) => {
        const t = r?.timing ? new Date(r.timing).getTime() : 0;
        return t > now && t - now <= WEEK;
    }).length;
    const moneyThisWeek = booked
        .filter((r) => within7(bookingTime(r)))
        .reduce((sum, r) => sum + (Number(r.pricePerPerson) || 0), 0);

    // Monthly impact for the "My Impact" rail card.
    const month = impact?.timeline?.thisMonth || null;
    const co2Month = month ? Number(month.co2SavedKg || 0) : 0;
    const moneyMonth = month ? Number(month.moneySavedInr || 0) : 0;
    const tripsMonth = month ? Number(month.sharedTrips || 0) : 0;

    // Recent activity timeline (derived from existing data, newest first).
    const activity = [
        ...created.map((r) => ({
            type: "created", date: r.createdAt,
            text: `You offered a ride to ${r.destination}`,
        })),
        ...booked.map((r) => ({
            type: "booked", date: bookingTime(r),
            text: `You booked a ride to ${r.destination}`,
        })),
        ...vehicles.map((v) => ({
            type: "vehicle", date: v.createdAt,
            text: `You added ${v.make} ${v.model}`,
        })),
    ]
        .filter((a) => a.date)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

    const firstName = (user?.name || "there").split(" ")[0];
    const initials = (user?.name || "U")
        .split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

    return (
        <div className="dh-root">
            {/* ---------- Top navbar ---------- */}
            <header className="dh-navbar">
                <button className="dh-hamburger" onClick={onOpenSidebar} aria-label="Open menu">
                    <Svg size={22}><><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></></Svg>
                </button>

                <div className="dh-navbar-welcome">
                    <span className="dh-navbar-hi">Welcome back,</span>
                    <span className="dh-navbar-name">{firstName} <span className="dh-wave" aria-hidden="true">👋</span></span>
                </div>

                <div className="dh-navbar-actions">
                    <div className="dh-profile" ref={menuRef}>
                        <button
                            className="dh-avatar"
                            onClick={() => setMenuOpen((v) => !v)}
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            aria-label="Profile menu"
                        >
                            {initials}
                        </button>
                        {menuOpen && (
                            <div className="dh-menu" role="menu">
                                <div className="dh-menu-head">
                                    <div className="dh-menu-name">{user?.name}</div>
                                    {user?.email && <div className="dh-menu-email">{user.email}</div>}
                                </div>
                                <button className="dh-menu-item" role="menuitem" onClick={() => { setMenuOpen(false); onNavigate("profile"); }}>
                                    <Svg size={16}><><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></></Svg> My Profile
                                </button>
                                <button className="dh-menu-item" role="menuitem" onClick={() => { setMenuOpen(false); onNavigate("myVehicle"); }}>
                                    <Svg size={16}>{I.car}</Svg> My Vehicle
                                </button>
                                <button className="dh-menu-item" role="menuitem" onClick={() => { setMenuOpen(false); navigate("/feedback"); }}>
                                    <Svg size={16}><><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></></Svg> Send Feedback
                                </button>
                                <button className="dh-menu-item danger" role="menuitem" onClick={handleLogout}>
                                    <Svg size={16}>{I.logout}</Svg> Logout
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* ---------- Two-column layout: main + rail ---------- */}
            <div className="dh-layout">
                <div className="dh-main">
                    {/* ---------- Hero ---------- */}
                    <section className="dh-hero dh-rise">
                        <div className="dh-hero-left">
                            <h1 className="dh-hero-title">Ready for your next ride?</h1>
                            <p className="dh-hero-sub">Share rides. Save money. Build connections.</p>
                            <div className="dh-hero-cta">
                                <button className="dh-hero-btn primary" onClick={() => onNavigate("findRides")}>
                                    <Svg size={17}>{I.search}</Svg> Find a Ride
                                </button>
                                <button className="dh-hero-btn" onClick={() => onNavigate("createRide")}>
                                    <Svg size={17}>{I.plus}</Svg> Create a Ride
                                </button>
                            </div>
                        </div>
                        <div className="dh-hero-scene" aria-hidden="true">
                            <span className="dh-marker top"><Svg size={15}>{I.pin}</Svg> Campus Hub</span>
                            <span className="dh-marker bottom"><Svg size={15}>{I.home}</Svg> Student Housing</span>
                            <div className="dh-hero-road2" />
                            <img className="dh-hero-carimg" src={carImg} alt="" />
                        </div>
                    </section>

                    {/* ---------- Smart suggestion card (rule-based) ---------- */}
                    {sugg.smartCard && (
                        <section className="dh-section dh-rise">
                            <div
                                className="dh-card dh-smart"
                                role="button"
                                tabIndex={0}
                                onClick={() => startFind({ destination: sugg.smartCard.destination, destinationCoords: coordOrNull(sugg.smartCard.destCoords), source: sugg.smartCard.origin, sourceCoords: coordOrNull(sugg.smartCard.srcCoords) })}
                            >
                                <div className="dh-smart-greet">{greetingWord}, {firstName} 👋</div>
                                <div className="dh-smart-label">Suggested ride</div>
                                <div className="dh-smart-route">
                                    <span className="dh-smart-dot pickup" />
                                    <strong>{sugg.smartCard.origin || "Your location"}</strong>
                                </div>
                                <div className="dh-smart-conn" />
                                <div className="dh-smart-route">
                                    <span className="dh-smart-dot drop" />
                                    <strong>{sugg.smartCard.destination}</strong>
                                </div>
                                <div className="dh-smart-reason">{sugg.smartCard.reason}</div>
                                <button
                                    className="dh-next-cta"
                                    onClick={(e) => { e.stopPropagation(); startFind({ destination: sugg.smartCard.destination, destinationCoords: coordOrNull(sugg.smartCard.destCoords), source: sugg.smartCard.origin, sourceCoords: coordOrNull(sugg.smartCard.srcCoords) }); }}
                                >
                                    Book this ride <Svg size={15}>{I.chevron}</Svg>
                                </button>
                            </div>
                        </section>
                    )}

                    {/* ---------- Recommended For You (personalized ride suggestions) ---------- */}
                    <Recommendations onNavigate={onNavigate} />

                    {/* ---------- Quick actions ---------- */}
                    <section className="dh-section">
                        <h2 className="dh-section-title">Quick Actions</h2>
                        <div className="dh-actions">
                            <QuickAction accent="blue" delay={0} title="Offer a Ride" subtitle="Share your trip"
                                icon={<Svg>{I.car}</Svg>} onClick={() => onNavigate("createRide")} />
                            <QuickAction accent="violet" delay={60} title="Find a Ride" subtitle="Search available"
                                icon={<Svg>{I.search}</Svg>} onClick={() => onNavigate("findRides")} />

                            <QuickAction accent="blue" delay={90} title="Request a Ride" subtitle="Ask nearby drivers"
                                icon={<Svg><><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></></Svg>} onClick={() => onNavigate("requestRide")} />
                            <QuickAction accent="green" delay={120} title="My Rides" subtitle="Manage your trips"
                                icon={<Svg>{I.calendar}</Svg>} onClick={() => onNavigate("myRides")} />
                            <QuickAction accent="amber" delay={180} title="My Bookings" subtitle="View your bookings"
                                icon={<Svg>{I.ticket}</Svg>} onClick={() => onNavigate("myBookings")} />
                        </div>
                    </section>

                    {/* ---------- Overview (stats) ---------- */}
                    <section className="dh-section">
                        <h2 className="dh-section-title">Overview</h2>
                        <div className="dh-stats">
                            <StatCard accent="blue" delay={0} label="Rides Created" value={loading ? "—" : created.length}
                                sub={loading ? "" : `+${createdThisWeek} this week`} icon={<Svg>{I.car}</Svg>} />
                            <StatCard accent="violet" delay={60} label="Total Bookings" value={loading ? "—" : booked.length}
                                sub={loading ? "" : `+${bookedThisWeek} this week`} icon={<Svg>{I.ticket}</Svg>} />
                            <StatCard accent="green" delay={120} label="Upcoming Trips" value={loading ? "—" : upcoming.length}
                                sub={loading ? "" : `+${upcomingThisWeek} this week`} icon={<Svg>{I.calendar}</Svg>} />
                            <StatCard accent="amber" delay={180} label="Money Saved (est.)" value={loading ? "—" : `₹${moneySaved}`}
                                sub={loading ? "" : `+₹${moneyThisWeek} this week`} icon={<Svg>{I.wallet}</Svg>} />
                        </div>
                    </section>

                    {/* ---------- Next trip + For You & Insights ---------- */}
                    <div className="dh-grid">
                        <section className="dh-section dh-col">
                            <h2 className="dh-section-title">Next Trip</h2>
                            {loading ? (
                                <div className="dh-card dh-skeleton" />
                            ) : nextRide ? (
                                <div className="dh-card dh-next">
                                    <div className="dh-next-route">
                                        <Svg size={18}>{I.pin}</Svg>
                                        <span className="dh-next-text" title={nextRide.source ? `${nextRide.source} → ${nextRide.destination}` : nextRide.destination}>
                                            {nextRide.source ? `${nextRide.source} → ${nextRide.destination}` : nextRide.destination}
                                        </span>
                                        <span className={`dh-status ${String(nextRide.status).toLowerCase()}`}>{nextRide.status}</span>
                                    </div>
                                    <div className="dh-next-meta">
                                        <span><Svg size={15}>{I.calendar}</Svg> {formatDateTime(nextRide.timing)}</span>
                                        <span><Svg size={15}>{I.car}</Svg> {nextRide.seatsAvailable} seat{nextRide.seatsAvailable !== 1 ? "s" : ""}</span>
                                    </div>
                                    <button className="dh-next-cta" onClick={() => onNavigate("myRides")}>
                                        View details
                                        <Svg size={15}>{I.chevron}</Svg>
                                    </button>
                                </div>
                            ) : (
                                <div className="dh-card dh-empty">
                                    <Svg size={34}>{I.calendar}</Svg>
                                    <p className="dh-empty-title">No upcoming trips</p>
                                    <p className="dh-empty-sub">You don't have any upcoming trips.</p>
                                    <div className="dh-empty-cta">
                                        <button className="dh-btn" onClick={() => onNavigate("findRides")}>Find a Ride</button>
                                        <button className="dh-btn ghost" onClick={() => onNavigate("createRide")}>Create a Ride</button>
                                    </div>
                                </div>
                            )}
                        </section>

                        <section className="dh-section dh-col">
                            <h2 className="dh-section-title">For You &amp; Insights</h2>
                            <div className="dh-card dh-insights">
                                <button className="dh-insight-row" onClick={() => onNavigate("findRides")}>
                                    <span className="dh-insight-icon accent-blue"><Svg size={18}>{I.star}</Svg></span>
                                    <span className="dh-insight-body">
                                        <span className="dh-insight-title">Recommended for you</span>
                                        <span className="dh-insight-sub">Popular routes and rides based on your activity</span>
                                    </span>
                                    <Svg size={16}>{I.chevron}</Svg>
                                </button>
                                <button className="dh-insight-row" onClick={() => onNavigate("createRide")}>
                                    <span className="dh-insight-icon accent-violet"><Svg size={18}>{I.chart}</Svg></span>
                                    <span className="dh-insight-body">
                                        <span className="dh-insight-title">Demand Insights <span className="dh-insight-tag">Last 7 days</span></span>
                                        <span className="dh-insight-sub">Track demand for routes in your area</span>
                                    </span>
                                    <Svg size={16}>{I.chevron}</Svg>
                                </button>
                                <button className="dh-insight-row" onClick={() => onNavigate("findRides")}>
                                    <span className="dh-insight-icon accent-amber"><Svg size={18}>{I.trend}</Svg></span>
                                    <span className="dh-insight-body">
                                        <span className="dh-insight-title">Trending Routes</span>
                                        <span className="dh-insight-sub">See what's trending in your community</span>
                                    </span>
                                    <Svg size={16}>{I.chevron}</Svg>
                                </button>
                            </div>
                        </section>
                    </div>

                    {/* ---------- Vehicle summary ---------- */}
                    <section className="dh-section">
                        <div className="dh-section-head">
                            <h2 className="dh-section-title">Your Vehicles</h2>
                            <button className="dh-btn ghost" onClick={() => onNavigate("myVehicle")}>
                                <Svg size={16}>{I.plus}</Svg> Add Vehicle
                            </button>
                        </div>
                        {loading ? (
                            <div className="dh-vehicles"><div className="dh-card dh-skeleton sm" /><div className="dh-card dh-skeleton sm" /></div>
                        ) : vehicles.length === 0 ? (
                            <div className="dh-card dh-empty">
                                <Svg size={30}>{I.car}</Svg>
                                <p className="dh-empty-title">No vehicles registered</p>
                                <p className="dh-empty-sub">Add a vehicle to start offering rides.</p>
                                <button className="dh-btn" onClick={() => onNavigate("myVehicle")}>Add Vehicle</button>
                            </div>
                        ) : (
                            <div className="dh-vehicles">
                                {vehicles.map((v) => (
                                    <div key={v._id} className="dh-card dh-vehicle">
                                        <span className="dh-vehicle-icon"><Svg size={20}>{I.car}</Svg></span>
                                        <div className="dh-vehicle-body">
                                            <div className="dh-vehicle-name">
                                                {v.make} {v.model} {v.year ? `(${v.year})` : ""}
                                                {v.isVerified && <span className="dh-verified">Verified</span>}
                                            </div>
                                            <div className="dh-vehicle-meta">
                                                {v.vehicleType}{v.totalSeats ? ` • ${v.totalSeats} seats` : ""}{v.licensePlate ? ` • ${v.licensePlate}` : ""}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                {/* ---------- Right rail ---------- */}
                <aside className="dh-rail">
                    {/* My Impact */}
                    <section className="dh-card dh-rise dh-impact">
                        <h2 className="dh-rail-title">My Impact</h2>
                        <ul className="dh-impact-list">
                            <li className="dh-impact-row">
                                <span className="dh-impact-icon accent-green"><Svg size={18}>{I.leaf}</Svg></span>
                                <span className="dh-impact-body">
                                    <span className="dh-impact-label">CO₂ Saved</span>
                                    <span className="dh-impact-value">{loading ? "—" : `${co2Month.toFixed(1)} kg`}</span>
                                </span>
                                <span className="dh-impact-period">This month</span>
                            </li>
                            <li className="dh-impact-row">
                                <span className="dh-impact-icon accent-blue"><Svg size={18}>{I.wallet}</Svg></span>
                                <span className="dh-impact-body">
                                    <span className="dh-impact-label">Money Saved</span>
                                    <span className="dh-impact-value">{loading ? "—" : `₹${moneyMonth}`}</span>
                                </span>
                                <span className="dh-impact-period">This month</span>
                            </li>
                            <li className="dh-impact-row">
                                <span className="dh-impact-icon accent-violet"><Svg size={18}>{I.users}</Svg></span>
                                <span className="dh-impact-body">
                                    <span className="dh-impact-label">Shared Trips</span>
                                    <span className="dh-impact-value">{loading ? "—" : tripsMonth}</span>
                                </span>
                                <span className="dh-impact-period">This month</span>
                            </li>
                        </ul>
                        <button className="dh-btn ghost full" onClick={() => onNavigate("sustainability")}>
                            <Svg size={15}>{I.chart}</Svg> View full impact
                        </button>
                    </section>

                    {/* Recent Activity */}
                    <section className="dh-card dh-rise">
                        <div className="dh-section-head">
                            <h2 className="dh-rail-title">Recent Activity</h2>
                            <button className="dh-link" onClick={() => onNavigate("rideHistory")}>View all</button>
                        </div>
                        {loading ? (
                            <div className="dh-skeleton-rows"><span /><span /><span /></div>
                        ) : activity.length === 0 ? (
                            <p className="dh-empty-sub">No activity yet. Your rides and bookings will appear here.</p>
                        ) : (
                            <ul className="dh-timeline">
                                {activity.slice(0, 4).map((a, i) => (
                                    <li key={i} className={`dh-timeline-item type-${a.type}`}>
                                        <span className="dh-timeline-dot" />
                                        <div className="dh-timeline-body">
                                            <span className="dh-timeline-text">{a.text}</span>
                                            <span className="dh-timeline-time">{timeAgo(a.date)}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Invite friends */}
                    <section className="dh-card dh-rise dh-invite">
                        <span className="dh-invite-icon"><Svg size={20}>{I.gift}</Svg></span>
                        <h2 className="dh-rail-title">Invite your friends</h2>
                        <p className="dh-invite-sub">More friends, more rides, more savings!</p>
                        <button className="dh-btn full" onClick={handleInvite}>Invite Now</button>
                    </section>
                </aside>
            </div>
        </div>
    );
};

export default DashboardHome;
