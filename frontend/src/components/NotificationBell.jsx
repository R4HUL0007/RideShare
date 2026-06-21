import { useState, useEffect, useRef, useCallback } from "react";
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

/* ---------------- helpers ---------------- */
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

// Group bucket for the history list.
const bucketOf = (iso) => {
    const d = new Date(iso), now = new Date();
    if (d.toDateString() === now.toDateString()) return "Today";
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return "Earlier";
};

const TYPE_ICON = {
    booking: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
    ride: <><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" /></>,
    tracking: <><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /><circle cx="12" cy="9" r="2.5" /></>,
    chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
    system: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>,
};
const TypeIcon = ({ type }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {TYPE_ICON[type] || TYPE_ICON.system}
    </svg>
);

// Older notifications were stored without a type/title (just a message). Infer a
// sensible type + title from the message text so they don't all read "Notification".
const inferType = (n) => {
    if (n.type && n.type !== "system") return n.type;
    const m = (n.message || "").toLowerCase();
    if (m.includes("message") || m.includes("sent you")) return "chat";
    if (m.includes("arriv") || m.includes("started") || m.includes("on the way") || m.includes("tracking")) return "tracking";
    if (m.includes("book") || m.includes("seat") || m.includes("removed")) return "booking";
    if (m.includes("ride") || m.includes("cancel") || m.includes("complet")) return "ride";
    return n.type || "system";
};
const inferTitle = (n, type) => {
    if (n.title && n.title !== "Notification") return n.title;
    const m = (n.message || "").toLowerCase();
    if (m.includes("cancel")) return "Booking cancelled";
    if (m.includes("removed")) return "Removed from ride";
    if (m.includes("book")) return "New booking";
    if (m.includes("arriv")) return "Driver arrived";
    if (m.includes("started")) return "Ride started";
    if (m.includes("complet")) return "Ride completed";
    if (m.includes("available")) return "New ride available";
    if (m.includes("message")) return "New message";
    return { booking: "Booking update", ride: "Ride update", tracking: "Ride tracking", chat: "New message", system: "Notification" }[type] || "Notification";
};

/* ---------------- component ---------------- */
const NotificationBell = ({ user, onNavigate, onTrack, className = "" }) => {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [unread, setUnread] = useState(0);
    const [loading, setLoading] = useState(false);
    const [pos, setPos] = useState(null); // fixed-position coords for the panel
    const panelRef = useRef(null);
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

    // Initial unread count + socket subscription for live updates.
    useEffect(() => {
        loadCount();
        if (userId) joinChat(userId);
        const socket = getSocket();
        const onNew = (n) => {
            setUnread((c) => c + 1);
            // If the panel is open, prepend it live.
            setItems((prev) => (prev.some((x) => x._id === n._id) ? prev : [n, ...prev]));
        };
        socket.on("notification:new", onNew);
        return () => socket.off("notification:new", onNew);
    }, [userId, loadCount]);

    // Close on outside click / Escape.
    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => {
            if (panelRef.current && panelRef.current.contains(e.target)) return;
            if (bellRef.current && bellRef.current.contains(e.target)) return;
            setOpen(false);
        };
        const onKey = (e) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
    }, [open]);

    // Position the (portal-like) fixed panel from the bell's rect so it never
    // gets clipped by — or overlaps — the sidebar.
    const computePos = useCallback(() => {
        const el = bellRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const width = Math.min(360, window.innerWidth - 24);
        // Prefer opening to the RIGHT of the bell (the bell sits at the sidebar's
        // right edge, so this places the panel outside the sidebar — no overlap).
        let left = r.right + 8;
        if (left + width > window.innerWidth - 12) {
            // Not enough room on the right → open to the left of the bell.
            left = r.left - width - 8;
        }
        if (left < 12) left = 12; // final clamp for very small screens
        setPos({ top: Math.round(r.bottom + 8), left: Math.round(left), width });
    }, []);

    useEffect(() => {
        if (!open) return undefined;
        computePos();
        const onScrollResize = () => computePos();
        window.addEventListener("resize", onScrollResize);
        window.addEventListener("scroll", onScrollResize, true);
        return () => { window.removeEventListener("resize", onScrollResize); window.removeEventListener("scroll", onScrollResize, true); };
    }, [open, computePos]);

    const toggle = () => {
        const next = !open;
        setOpen(next);
        if (next) loadList();
    };

    const handleOpenItem = async (n) => {
        if (!n.read) {
            try { await markNotificationRead(n._id); } catch { /* ignore */ }
            setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
            setUnread((c) => Math.max(0, c - 1));
        }
        // Deep-link to the relevant module.
        const tab = n.link?.tab;
        if (tab === "track" && n.link?.rideId && onTrack) {
            onTrack(n.link.rideId);
        } else if (tab && onNavigate) {
            onNavigate(tab);
        }
        setOpen(false);
    };

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
        setItems([]);
        setUnread(0);
    };

    // Group items by Today / Yesterday / Earlier (already newest-first).
    const groups = [];
    let lastBucket = null;
    items.forEach((n) => {
        const b = bucketOf(n.createdAt);
        if (b !== lastBucket) { groups.push({ bucket: b, list: [] }); lastBucket = b; }
        groups[groups.length - 1].list.push(n);
    });

    return (
        <div className={`nb-wrap ${className}`}>
            <button ref={bellRef} className="nb-bell" onClick={toggle} aria-label="Notifications" aria-haspopup="true" aria-expanded={open}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unread > 0 && <span className="nb-badge">{unread > 9 ? "9+" : unread}</span>}
            </button>

            {open && (
                <div
                    className="nb-panel"
                    role="menu"
                    ref={panelRef}
                    style={pos ? { position: "fixed", top: pos.top, left: pos.left, width: pos.width } : { visibility: "hidden" }}
                >
                    <div className="nb-head">
                        <span className="nb-title">Notifications</span>
                        <div className="nb-head-actions">
                            {unread > 0 && <button className="nb-link" onClick={handleMarkAll}>Mark all read</button>}
                            {items.length > 0 && <button className="nb-link danger" onClick={handleClearAll}>Clear all</button>}
                        </div>
                    </div>

                    <div className="nb-list">
                        {loading ? (
                            <div className="nb-loading"><span className="nb-spin" /> Loading…</div>
                        ) : items.length === 0 ? (
                            <div className="nb-empty">
                                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                                <p className="nb-empty-title">No notifications yet</p>
                                <p className="nb-empty-sub">Booking, ride, and chat updates will show up here.</p>
                            </div>
                        ) : (
                            groups.map((g) => (
                                <div key={g.bucket} className="nb-group">
                                    <div className="nb-group-label">{g.bucket}</div>
                                    {g.list.map((n) => {
                                        const t = inferType(n);
                                        const title = inferTitle(n, t);
                                        return (
                                        <button key={n._id} className={`nb-item${n.read ? "" : " unread"}`} onClick={() => handleOpenItem(n)}>
                                            <span className={`nb-icon ${t}`}><TypeIcon type={t} /></span>
                                            <span className="nb-item-body">
                                                <span className="nb-item-title">{title}</span>
                                                <span className="nb-item-msg">{n.message}</span>
                                                <span className="nb-item-time">{relTime(n.createdAt)}</span>
                                            </span>
                                            {!n.read && <span className="nb-dot" aria-label="Unread" />}
                                            <span className="nb-del" onClick={(e) => handleDelete(e, n._id)} role="button" aria-label="Delete notification" title="Delete">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                            </span>
                                        </button>
                                        );
                                    })}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
