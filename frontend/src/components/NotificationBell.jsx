import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import { getSocket, joinChat } from "../utils/socket";
import {
    fetchNotifications,
    fetchUnreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    clearAllNotifications,
} from "../services/notificationService";
import "../styles/notifications.css";

/* ---------------- time + grouping ---------------- */
const relTime = (iso) => {
    if (!iso) return "";
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 45) return "Just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) { const h = Math.floor(s / 3600); return `${h} hour${h > 1 ? "s" : ""} ago`; }
    const d = Math.floor(s / 86400);
    if (d === 1) return "Yesterday";
    if (d < 7) return `${d} days ago`;
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

const startOfDay = (dt) => { const x = new Date(dt); x.setHours(0, 0, 0, 0); return x; };
const GROUP_ORDER = ["Today", "Yesterday", "Earlier This Week", "Last Week", "Older"];
const bucketOf = (iso) => {
    const diff = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86400000);
    if (diff <= 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff <= 6) return "Earlier This Week";
    if (diff <= 13) return "Last Week";
    return "Older";
};

/* ---------------- type normalization + icons ---------------- */
// Collapse raw/legacy types + message text into one of the 7 card types.
const normType = (n) => {
    const raw = (n.type || "").toLowerCase();
    if (["ride", "booking", "tracking"].includes(raw)) return "ride";
    if (["payment", "escrow", "chat", "safety", "verification", "system"].includes(raw)) return raw;
    const m = `${n.title || ""} ${n.message || ""}`.toLowerCase();
    if (/escrow|earning|released|withdraw|settle|payout/.test(m)) return "escrow";
    if (/pay|payment|charged|refund|invoice/.test(m)) return "payment";
    if (/message|replied|\bchat\b/.test(m)) return "chat";
    if (/sos|safety|emergency|unsafe/.test(m)) return "safety";
    if (/verif|document|licen/.test(m)) return "verification";
    if (/arriv|started|complet|book|seat|\bride\b|cancel|track|driver|accept/.test(m)) return "ride";
    return "system";
};

const inferTitle = (n, type) => {
    if (n.title && n.title !== "Notification") return n.title;
    const m = (n.message || "").toLowerCase();
    if (m.includes("cancel")) return "Booking cancelled";
    if (m.includes("arriv")) return "Driver arrived";
    if (m.includes("started")) return "Ride started";
    if (m.includes("complet")) return "Ride completed";
    if (m.includes("accept")) return "Ride accepted";
    if (m.includes("message")) return "New message";
    return { ride: "Ride update", payment: "Payment update", escrow: "Earnings update", chat: "New message", safety: "Safety alert", verification: "Verification update", system: "Notification" }[type] || "Notification";
};

const ICONS = {
    ride: <><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" /></>,
    payment: <><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></>,
    escrow: <><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" /><path d="M9 12l2 2 4-4" /></>,
    chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
    safety: <><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="16" x2="12.01" y2="16" /></>,
    verification: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
    system: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>,
};
const TypeIcon = ({ type }) => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[type] || ICONS.system}
    </svg>
);

/* ---------------- filter tabs ---------------- */
const TABS = [
    { key: "all", label: "All" },
    { key: "rides", label: "Rides" },
    { key: "payments", label: "Payments" },
    { key: "chats", label: "Chats" },
    { key: "safety", label: "Safety" },
    { key: "system", label: "System" },
];
const tabMatches = (type, tab) => {
    if (tab === "all") return true;
    if (tab === "rides") return type === "ride";
    if (tab === "payments") return type === "payment" || type === "escrow";
    if (tab === "chats") return type === "chat";
    if (tab === "safety") return type === "safety";
    if (tab === "system") return type === "system" || type === "verification";
    return true;
};

/* ---------------- component ---------------- */
const NotificationBell = ({ user, onNavigate, onTrack, className = "" }) => {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [unread, setUnread] = useState(0);
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState("all");
    const [query, setQuery] = useState("");
    const [confirmClear, setConfirmClear] = useState(false);
    const bellRef = useRef(null);
    const userId = user?.id || user?._id;

    const loadCount = useCallback(async () => {
        try { const res = await fetchUnreadCount(); setUnread(res.data?.count || 0); } catch { /* ignore */ }
    }, []);

    const loadList = useCallback(async () => {
        setLoading(true);
        try { const res = await fetchNotifications(50); setItems(Array.isArray(res.data) ? res.data : []); }
        catch { setItems([]); }
        finally { setLoading(false); }
    }, []);

    // Initial unread count + live socket delivery.
    useEffect(() => {
        loadCount();
        if (userId) joinChat(userId);
        const socket = getSocket();
        const onNew = (n) => {
            setUnread((c) => c + 1);
            setItems((prev) => (prev.some((x) => x._id === n._id) ? prev : [n, ...prev]));
            toast.info(n.title || n.message || "New notification", { autoClose: 3500 });
        };
        socket.on("notification:new", onNew);
        return () => socket.off("notification:new", onNew);
    }, [userId, loadCount]);

    // Lock body scroll + Esc-to-close while the center is open.
    useEffect(() => {
        if (!open) return undefined;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e) => e.key === "Escape" && setOpen(false);
        document.addEventListener("keydown", onKey);
        return () => { document.body.style.overflow = prevOverflow; document.removeEventListener("keydown", onKey); };
    }, [open]);

    const openCenter = () => { setOpen(true); setConfirmClear(false); loadList(); };
    const closeCenter = () => { setOpen(false); setConfirmClear(false); };

    const markRead = useCallback(async (n) => {
        if (n.read) return;
        try { await markNotificationRead(n._id); } catch { /* ignore */ }
        setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
        setUnread((c) => Math.max(0, c - 1));
    }, []);

    // Open a notification's linked destination (used by card body + fallback actions).
    const openLink = useCallback((n) => {
        markRead(n);
        const link = n.link || {};
        if (link.tab === "track" && link.rideId && onTrack) onTrack(link.rideId);
        else if (link.tab && onNavigate) onNavigate(link.tab);
        closeCenter();
    }, [markRead, onNavigate, onTrack]);

    // Type-appropriate primary action → { label, run } | null.
    const deriveAction = useCallback((n, type) => {
        const link = n.link || {};
        const m = `${n.title || ""} ${n.message || ""}`.toLowerCase();
        const go = (tabName) => () => { markRead(n); onNavigate?.(tabName); closeCenter(); };
        const track = () => { markRead(n); onTrack?.(link.rideId); closeCenter(); };

        if (link.tab === "track" && link.rideId && onTrack) return { label: "Track Live", run: track };
        if (type === "escrow") return { label: "View Earnings", run: go(link.tab || "earnings") };
        if (type === "payment") return { label: /pending|pay now|due|awaiting/.test(m) ? "Pay Now" : "View Payment", run: go(link.tab || "payments") };
        if (type === "chat") return { label: "Reply", run: go(link.tab || "chats") };
        if (type === "safety") return { label: "View Details", run: go(link.tab || "safety") };
        if (type === "verification") return { label: "View", run: go(link.tab || "verification") };
        if (type === "ride") {
            if (/arriv/.test(m)) return { label: "Show OTP", run: go(link.tab || "myBookings") };
            if (/complet/.test(m)) return { label: "View Receipt", run: go(link.tab || "payments") };
            if (/started|route|on the way/.test(m)) return link.rideId && onTrack ? { label: "View Route", run: track } : { label: "View Route", run: go(link.tab || "myRides") };
            if (/accept|confirm/.test(m)) return link.rideId && onTrack ? { label: "Track Live", run: track } : { label: "View", run: go(link.tab || "myBookings") };
        }
        if (link.tab) return { label: "View", run: go(link.tab) };
        return null;
    }, [markRead, onNavigate, onTrack]);

    const handleMarkAll = async () => {
        try { await markAllNotificationsRead(); } catch { /* ignore */ }
        setItems((prev) => prev.map((x) => ({ ...x, read: true })));
        setUnread(0);
    };
    const handleDelete = async (e, id) => {
        e.stopPropagation();
        try { await deleteNotification(id); } catch { /* ignore */ }
        setItems((prev) => {
            const removed = prev.find((x) => x._id === id);
            if (removed && !removed.read) setUnread((c) => Math.max(0, c - 1));
            return prev.filter((x) => x._id !== id);
        });
    };
    const handleClearAll = async () => {
        try { await clearAllNotifications(); } catch { /* ignore */ }
        setItems([]); setUnread(0); setConfirmClear(false);
    };
    const goSettings = () => { onNavigate?.("profile"); closeCenter(); };
    const goFind = () => { onNavigate?.("findRides"); closeCenter(); };
    const goOffer = () => { onNavigate?.("createRide"); closeCenter(); };

    // Enrich + filter + search, then group (fixed order).
    const enriched = useMemo(() => items.map((n) => {
        const type = normType(n);
        return { ...n, _type: type, _title: inferTitle(n, type) };
    }), [items]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return enriched.filter((n) => tabMatches(n._type, tab) &&
            (!q || `${n._title} ${n.message || ""}`.toLowerCase().includes(q)));
    }, [enriched, tab, query]);

    const groups = useMemo(() => {
        const map = new Map();
        visible.forEach((n) => {
            const b = bucketOf(n.createdAt);
            if (!map.has(b)) map.set(b, []);
            map.get(b).push(n);
        });
        return GROUP_ORDER.filter((b) => map.has(b)).map((b) => ({ bucket: b, list: map.get(b) }));
    }, [visible]);

    const drawer = open ? createPortal(
        <div className="ntf-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeCenter(); }}>
            <aside className="ntf-drawer" role="dialog" aria-modal="true" aria-label="Notifications">
                {/* Header */}
                <div className="ntf-head">
                    <button className="ntf-back" onClick={closeCenter} aria-label="Close notifications">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                    </button>
                    <div className="ntf-head-titles">
                        <span className="ntf-title">Notifications</span>
                        {unread > 0 && <span className="ntf-unread-count">{unread} unread</span>}
                    </div>
                    <div className="ntf-head-actions">
                        {unread > 0 && <button className="ntf-icobtn" title="Mark all read" aria-label="Mark all read" onClick={handleMarkAll}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        </button>}
                        <button className="ntf-icobtn" title="Notification settings" aria-label="Notification settings" onClick={goSettings}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.2.61.76 1.05 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                        </button>
                        {items.length > 0 && <button className="ntf-icobtn danger" title="Clear all" aria-label="Clear all" onClick={() => setConfirmClear(true)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>}
                    </div>
                </div>

                {/* Search */}
                <div className="ntf-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notifications..." aria-label="Search notifications" />
                    {query && <button className="ntf-search-x" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
                </div>

                {/* Filter tabs */}
                <div className="ntf-tabs">
                    {TABS.map((t) => (
                        <button key={t.key} className={`ntf-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
                    ))}
                </div>

                {/* Body */}
                <div className="ntf-body">
                    {loading ? (
                        <div className="ntf-loading"><span className="ntf-spin" /> Loading…</div>
                    ) : items.length === 0 ? (
                        <div className="ntf-empty">
                            <div className="ntf-empty-ill">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                            </div>
                            <h3 className="ntf-empty-title">You&apos;re all caught up.</h3>
                            <p className="ntf-empty-sub">Ride updates, payments, chats, OTP, escrow updates, and safety alerts will appear here.</p>
                            <div className="ntf-empty-cta">
                                <button className="ntf-btn primary" onClick={goFind}>Find a Ride</button>
                                <button className="ntf-btn ghost" onClick={goOffer}>Offer a Ride</button>
                            </div>
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="ntf-empty">
                            <p className="ntf-empty-title" style={{ fontSize: "1rem" }}>No matching notifications</p>
                            <p className="ntf-empty-sub">Try a different filter or search term.</p>
                        </div>
                    ) : (
                        groups.map((g) => (
                            <div key={g.bucket} className="ntf-group">
                                <div className="ntf-group-label">{g.bucket}</div>
                                {g.list.map((n) => {
                                    const action = deriveAction(n, n._type);
                                    return (
                                        <div
                                            key={n._id}
                                            className={`ntf-card ${n._type}${n.read ? "" : " unread"}`}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => openLink(n)}
                                            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openLink(n)}
                                        >
                                            <span className={`ntf-card-icon ${n._type}`}><TypeIcon type={n._type} /></span>
                                            <div className="ntf-card-body">
                                                <div className="ntf-card-top">
                                                    <span className="ntf-card-title">{n._title}</span>
                                                    <span className="ntf-card-time">{relTime(n.createdAt)}</span>
                                                </div>
                                                <p className="ntf-card-msg">{n.message}</p>
                                                {action && (
                                                    <button className="ntf-card-action" onClick={(e) => { e.stopPropagation(); action.run(); }}>
                                                        {action.label}
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                                                    </button>
                                                )}
                                            </div>
                                            {!n.read && <span className="ntf-card-dot" aria-label="Unread" />}
                                            <button className="ntf-card-del" onClick={(e) => handleDelete(e, n._id)} aria-label="Delete notification" title="Delete">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>

                {/* Clear-all confirmation */}
                {confirmClear && (
                    <div className="ntf-confirm">
                        <div className="ntf-confirm-box">
                            <p className="ntf-confirm-title">Clear all notifications?</p>
                            <p className="ntf-confirm-sub">This permanently removes every notification. This can&apos;t be undone.</p>
                            <div className="ntf-confirm-actions">
                                <button className="ntf-btn ghost" onClick={() => setConfirmClear(false)}>Cancel</button>
                                <button className="ntf-btn danger" onClick={handleClearAll}>Clear all</button>
                            </div>
                        </div>
                    </div>
                )}
            </aside>
        </div>,
        document.body
    ) : null;

    return (
        <div className={`nb-wrap ${className}`}>
            <button ref={bellRef} className="nb-bell" onClick={openCenter} aria-label="Notifications" aria-haspopup="dialog" aria-expanded={open}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unread > 0 && <span className="nb-badge">{unread > 9 ? "9+" : unread}</span>}
            </button>
            {drawer}
        </div>
    );
};

export default NotificationBell;
