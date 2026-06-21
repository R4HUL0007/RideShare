import { useState, useEffect, useRef, useCallback } from "react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import axiosInstance from "../utils/axiosConfig";
import { toast } from "react-toastify";
import { API_BASE_URL } from "../utils/constants";
import { DARK_MAP_STYLE } from "../config/googleMapsConfig";
import { getSocket, joinChat } from "../utils/socket";
import MapsProvider, { useMaps } from "./maps/MapsProvider";
import "../styles/chats.css";

const idStr = (v) => (v == null ? null : typeof v === "string" ? v : v._id ? v._id.toString() : v.toString());

const initials = (name = "") => name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "U";
// First name only (e.g. "Rahul Virendra Mehta" -> "Rahul").
const firstName = (name = "") => (name.trim().split(/\s+/)[0] || "User");

// A conversation's ride is "active" when it's neither completed nor cancelled.
const isActiveRide = (conv) => {
    const s = String(conv?.ride?.status || "").toLowerCase();
    return s !== "completed" && s !== "cancelled";
};

const locDotIcon = (color) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42"><path fill="${color}" stroke="#fff" stroke-width="2.5" d="M17 2C9.8 2 4 7.8 4 15c0 9 13 25 13 25s13-16 13-25C30 7.8 24.2 2 17 2z"/><circle cx="17" cy="15" r="5" fill="#fff"/></svg>`;
    const icon = { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg) };
    if (window.google?.maps?.Size) icon.scaledSize = new window.google.maps.Size(34, 42);
    if (window.google?.maps?.Point) icon.anchor = new window.google.maps.Point(17, 40);
    return icon;
};

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "");
const fmtDay = (iso) => {
    if (!iso) return "";
    const d = new Date(iso), today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const yest = new Date(today); yest.setDate(today.getDate() - 1);
    if (sameDay) return "Today";
    if (d.toDateString() === yest.toDateString()) return "Yesterday";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
const fmtRelative = (iso) => {
    if (!iso) return "";
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};
const unreadLabel = (n) => (n > 5 ? "5+" : String(n));

/* ---------------- in-app location map modal ---------------- */
function LocationMapModal({ loc, title, onClose }) {
    const { isLoaded, loadError } = useMaps();
    const center = { lat: loc.lat, lng: loc.lng };
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (
        <div className="ch-map-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="ch-map-modal" role="dialog" aria-modal="true" aria-label="Shared location">
                <div className="ch-map-head">
                    <div className="ch-map-headinfo">
                        <span className="ch-loc-icon sm"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg></span>
                        <div className="ch-map-titles">
                            <span className="ch-map-title">{title}'s location</span>
                            {loc.address && <span className="ch-map-sub">{loc.address}</span>}
                        </div>
                    </div>
                    <button className="ch-map-close" onClick={onClose} aria-label="Close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>
                <div className="ch-map-body">
                    {loadError ? (
                        <div className="ch-map-msg">Map could not be loaded.</div>
                    ) : !isLoaded ? (
                        <div className="ch-map-msg"><span className="ch-spin" /> Loading map…</div>
                    ) : (
                        <GoogleMap
                            center={center}
                            zoom={15}
                            mapContainerStyle={{ width: "100%", height: "100%" }}
                            options={{ styles: DARK_MAP_STYLE, backgroundColor: "#0f0f10", disableDefaultUI: false, zoomControl: true, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, gestureHandling: "greedy", clickableIcons: false }}
                        >
                            <Marker position={center} icon={locDotIcon("#EF4444")} />
                        </GoogleMap>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ---------------- conversation list item ---------------- */
function ConvItem({ conv, active, onClick }) {
    const cp = conv.counterpart || {};
    return (
        <button className={`ch-conv${active ? " active" : ""}`} onClick={onClick}>
            <span className="ch-avatar">
                {cp.profilePicture ? <img src={cp.profilePicture} alt={cp.name} /> : <span className="ch-avatar-fallback">{initials(cp.name)}</span>}
                {conv.unread > 0 && <span className="ch-avatar-dot" />}
            </span>
            <span className="ch-conv-main">
                <span className="ch-conv-top">
                    <span className="ch-conv-name">{firstName(cp.name)}</span>
                    <span className="ch-conv-time">{fmtRelative(conv.updatedAt)}</span>
                </span>
                <span className="ch-conv-route">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="10" r="3" /><path d="M12 2a8 8 0 0 0-8 8c0 5.4 8 12 8 12s8-6.6 8-12a8 8 0 0 0-8-8z" /></svg>
                    {conv.ride?.source} → {conv.ride?.destination}
                </span>
                <span className="ch-conv-bottom">
                    <span className="ch-conv-last">{conv.lastMessage ? (conv.lastMessage.type === "location" ? "📍 Location" : conv.lastMessage.text) : "No messages yet"}</span>
                    {conv.unread > 0 && <span className="ch-unread">{unreadLabel(conv.unread)}</span>}
                </span>
            </span>
        </button>
    );
}

/* ---------------- chat window ---------------- */
function ChatWindow({ conv, userId, onBack, onThreadRead, onClear, onArchiveToggle }) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [locating, setLocating] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [locModal, setLocModal] = useState(null); // { loc, title }
    const endRef = useRef(null);
    const cp = conv.counterpart || {};
    const cpFirst = firstName(cp.name);

    const scrollToEnd = () => endRef.current?.scrollIntoView({ behavior: "smooth" });

    // Load the merged thread (across all shared rides) + mark as read.
    useEffect(() => {
        let active = true;
        setLoading(true);
        (async () => {
            try {
                const res = await axiosInstance.get(`${API_BASE_URL}/chat/${conv.rideId}/${cp._id}`);
                if (!active) return;
                setMessages(Array.isArray(res.data) ? res.data : []);
                onThreadRead?.(conv.rideId, cp._id);
            } catch (error) {
                if (active) toast.error(error.response?.data?.message || "Failed to load messages.");
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [conv.rideId, cp._id]);

    useEffect(() => { scrollToEnd(); }, [messages]);

    // Live incoming messages for this thread — matched by the user pair so they
    // appear regardless of which shared ride they were sent on.
    useEffect(() => {
        const socket = getSocket();
        const onMsg = (msg) => {
            const pair = [idStr(msg.sender), idStr(msg.receiver)];
            if (pair.includes(userId) && pair.includes(cp._id)) {
                setMessages((prev) => (prev.some((m) => idStr(m._id) === idStr(msg._id)) ? prev : [...prev, msg]));
                // If the incoming message is from the counterpart, mark read.
                if (idStr(msg.sender) === cp._id) {
                    axiosInstance.patch(`${API_BASE_URL}/chat/${conv.rideId}/${cp._id}/read`).catch(() => {});
                    onThreadRead?.(conv.rideId, cp._id);
                }
            }
        };
        const onRead = ({ by }) => {
            if (by === cp._id) {
                setMessages((prev) => prev.map((m) => (idStr(m.sender) === userId ? { ...m, read: true } : m)));
            }
        };
        socket.on("chat:message", onMsg);
        socket.on("chat:read", onRead);
        return () => { socket.off("chat:message", onMsg); socket.off("chat:read", onRead); };
    }, [conv.rideId, cp._id, userId]);

    const send = async (e) => {
        e?.preventDefault();
        const body = text.trim();
        if (!body || sending) return;
        setSending(true);
        setText("");
        try {
            const res = await axiosInstance.post(`${API_BASE_URL}/chat/${conv.rideId}/${cp._id}`, { text: body });
            // Socket echoes to sender too; de-dupe by id.
            setMessages((prev) => (prev.some((m) => idStr(m._id) === idStr(res.data._id)) ? prev : [...prev, res.data]));
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to send message.");
            setText(body);
        } finally {
            setSending(false);
        }
    };

    // Share the user's current location as a location message.
    const shareLocation = () => {
        if (locating || sending) return;
        if (!("geolocation" in navigator)) {
            toast.info("Location isn't supported on this device.");
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                // Best-effort reverse geocode for a readable label (optional).
                let address = "";
                try {
                    if (window.google?.maps?.Geocoder) {
                        address = await new Promise((resolve) => {
                            const g = new window.google.maps.Geocoder();
                            g.geocode({ location: coords }, (r, s) =>
                                resolve(s === "OK" && r?.[0] ? r[0].formatted_address : "")
                            );
                        });
                    }
                } catch { /* ignore */ }
                try {
                    const res = await axiosInstance.post(`${API_BASE_URL}/chat/${conv.rideId}/${cp._id}`, {
                        type: "location",
                        location: { ...coords, address },
                    });
                    setMessages((prev) => (prev.some((m) => idStr(m._id) === idStr(res.data._id)) ? prev : [...prev, res.data]));
                } catch (error) {
                    toast.error(error.response?.data?.message || "Failed to share location.");
                } finally {
                    setLocating(false);
                }
            },
            (err) => {
                setLocating(false);
                if (err.code === err.PERMISSION_DENIED) toast.info("Location permission denied.");
                else toast.info("Couldn't get your location.");
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    };

    // Clear this conversation for the current user only.
    const clearChat = async () => {
        if (clearing) return;
        setMenuOpen(false);
        if (!window.confirm("Clear this chat? This only clears it for you — the other person keeps their copy.")) return;
        setClearing(true);
        try {
            await axiosInstance.delete(`${API_BASE_URL}/chat/${conv.rideId}/${cp._id}`);
            setMessages([]);
            onClear?.(conv.rideId, cp._id);
            toast.success("Chat cleared.");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to clear chat.");
        } finally {
            setClearing(false);
        }
    };

    const archive = () => {
        setMenuOpen(false);
        onArchiveToggle?.(cp._id, Boolean(conv.archived));
    };

    // Group messages by day for date separators.
    const groups = [];
    let lastDay = null;
    messages.forEach((m) => {
        const day = fmtDay(m.createdAt);
        if (day !== lastDay) { groups.push({ day, items: [] }); lastDay = day; }
        groups[groups.length - 1].items.push(m);
    });

    return (
        <div className="ch-window">
            <div className="ch-win-head">
                <button className="ch-back" onClick={onBack} aria-label="Back to conversations">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                </button>
                <span className="ch-avatar sm">
                    {cp.profilePicture ? <img src={cp.profilePicture} alt={cpFirst} /> : <span className="ch-avatar-fallback">{initials(cp.name)}</span>}
                </span>
                <div className="ch-win-meta">
                    <span className="ch-win-name">{cpFirst}</span>
                    <span className="ch-win-route">
                        {conv.ride?.source} → {conv.ride?.destination}
                        {conv.ride?.timing ? ` · ${fmtDay(conv.ride.timing)} ${fmtTime(conv.ride.timing)}` : ""}
                    </span>
                </div>
                <span className={`ch-status-pill ${String(conv.ride?.status || "").toLowerCase()}`}>{conv.ride?.status || ""}</span>
                <div className="ch-menu-wrap">
                    <button className="ch-menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Conversation options" aria-haspopup="menu" aria-expanded={menuOpen}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
                    </button>
                    {menuOpen && (
                        <>
                            <div className="ch-menu-backdrop" onClick={() => setMenuOpen(false)} />
                            <div className="ch-menu" role="menu">
                                <button className="ch-menu-item" role="menuitem" onClick={archive}>
                                    {conv.archived ? (
                                        <>
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 14 8 9 13 14" /><path d="M8 9v9" /><rect x="3" y="3" width="18" height="4" rx="1" /></svg>
                                            Unarchive
                                        </>
                                    ) : (
                                        <>
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="4" rx="1" /><path d="M5 7v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7" /><line x1="10" y1="12" x2="14" y2="12" /></svg>
                                            Archive
                                        </>
                                    )}
                                </button>
                                <button className="ch-menu-item danger" role="menuitem" onClick={clearChat} disabled={clearing}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                    {clearing ? "Clearing…" : "Clear chat"}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="ch-messages">
                {loading ? (
                    <div className="ch-loading"><span className="ch-spin" /> Loading messages…</div>
                ) : messages.length === 0 ? (
                    <div className="ch-thread-empty">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        <p>Say hello — start the conversation about your ride.</p>
                    </div>
                ) : (
                    groups.map((g, gi) => (
                        <div key={gi} className="ch-day-group">
                            <div className="ch-day-sep"><span>{g.day}</span></div>
                            {g.items.map((m) => {
                                const mine = idStr(m.sender) === userId;
                                const isLoc = m.type === "location" && m.location && m.location.lat != null;
                                return (
                                    <div key={idStr(m._id)} className={`ch-bubble-row${mine ? " mine" : ""}`}>
                                        <div className={`ch-bubble${isLoc ? " loc" : ""}`}>
                                            {isLoc ? (
                                                <button
                                                    type="button"
                                                    className="ch-loc"
                                                    onClick={() => setLocModal({ loc: m.location, title: mine ? "Your" : cpFirst })}
                                                >
                                                    <span className="ch-loc-icon">
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                                    </span>
                                                    <span className="ch-loc-text">
                                                        <span className="ch-loc-title">📍 {mine ? "Your" : cpFirst} location</span>
                                                        <span className="ch-loc-sub">{m.location.address || `${m.location.lat.toFixed(5)}, ${m.location.lng.toFixed(5)}`}</span>
                                                        <span className="ch-loc-open">View on map →</span>
                                                    </span>
                                                </button>
                                            ) : (
                                                <span className="ch-bubble-text">{m.text}</span>
                                            )}
                                            <span className="ch-bubble-meta">
                                                {fmtTime(m.createdAt)}
                                                {mine && (
                                                    <span className={`ch-ticks${m.read ? " read" : ""}`} title={m.read ? "Read" : "Sent"}>
                                                        {m.read ? "✓✓" : "✓"}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))
                )}
                <div ref={endRef} />
            </div>

            <form className="ch-composer" onSubmit={send}>
                <button
                    type="button"
                    className="ch-loc-btn"
                    onClick={shareLocation}
                    disabled={locating || sending}
                    title="Share current location"
                    aria-label="Share current location"
                >
                    {locating ? <span className="ch-spin" /> : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                    )}
                    <span className="ch-loc-btn-label">{locating ? "Locating…" : "Location"}</span>
                </button>
                <input
                    className="ch-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type a message…"
                    aria-label="Message"
                    autoComplete="off"
                />
                <button type="submit" className="ch-send" disabled={!text.trim() || sending} aria-label="Send">
                    {sending ? <span className="ch-spin" /> : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                    )}
                </button>
            </form>

            {locModal && <LocationMapModal loc={locModal.loc} title={locModal.title} onClose={() => setLocModal(null)} />}
        </div>
    );
}

/* ---------------- Tips card ---------------- */
function TipsCard() {
    const tips = [
        ["#7c3aed", "Chats are only available for active or upcoming rides.", "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
        ["#10b981", "Be respectful and follow our community guidelines.", "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
        ["#d97706", "Never share personal information.", "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4"],
    ];
    return (
        <div className="ch-tips">
            <h3 className="ch-tips-title">Tips</h3>
            {tips.map(([color, text, path], i) => (
                <div key={i} className="ch-tip">
                    <span className="ch-tip-icon" style={{ color }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
                    </span>
                    <span className="ch-tip-text">{text}</span>
                </div>
            ))}
        </div>
    );
}

/* =======================================================
   Chats (main)
   ======================================================= */
const ChatsInner = ({ user, onOpenSidebar, onNavigate }) => {
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeKey, setActiveKey] = useState(null); // counterpart id
    const [query, setQuery] = useState("");
    const [tab, setTab] = useState("all"); // all | active | archived
    const userId = user?.id || user?._id;

    // Conversations are keyed by the other user (merged across rides).
    const keyOf = (c) => idStr(c.counterpart?._id);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get(`${API_BASE_URL}/chat/conversations`);
            setConversations(Array.isArray(res.data) ? res.data : []);
        } catch {
            setConversations([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Ensure the socket has joined for this user (id -> socket mapping).
    useEffect(() => { if (userId) joinChat(userId); }, [userId]);

    // Live updates for the conversation list (bump last message + unread).
    useEffect(() => {
        if (!userId) return;
        const socket = getSocket();
        const onMsg = (msg) => {
            const otherId = idStr(msg.sender) === userId ? idStr(msg.receiver) : idStr(msg.sender);
            setConversations((prev) => {
                let found = false;
                const next = prev.map((c) => {
                    if (keyOf(c) !== otherId) return c;
                    found = true;
                    const incoming = idStr(msg.sender) !== userId;
                    const isOpen = activeKey === otherId;
                    return {
                        ...c,
                        lastMessage: { text: msg.text, type: msg.type || "text", createdAt: msg.createdAt, sender: idStr(msg.sender) },
                        updatedAt: msg.createdAt,
                        unread: incoming && !isOpen ? (c.unread || 0) + 1 : (isOpen ? 0 : c.unread),
                    };
                });
                // Unknown conversation (e.g. a brand-new match) → refetch.
                if (!found) { load(); return prev; }
                return [...next].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            });
        };
        socket.on("chat:message", onMsg);
        return () => socket.off("chat:message", onMsg);
    }, [userId, activeKey, load]);

    const markThreadRead = (_rideId, cpId) => {
        const k = idStr(cpId);
        setConversations((prev) => prev.map((c) => (keyOf(c) === k ? { ...c, unread: 0 } : c)));
    };

    // After a per-user clear, drop the last-message preview + unread for that thread.
    const onThreadCleared = (_rideId, cpId) => {
        const k = idStr(cpId);
        setConversations((prev) => prev.map((c) => (keyOf(c) === k ? { ...c, lastMessage: null, unread: 0 } : c)));
    };

    // Archive / unarchive a conversation (keyed by the other user).
    const toggleArchive = async (cpId, archived) => {
        const k = idStr(cpId);
        try {
            await axiosInstance.patch(`${API_BASE_URL}/chat/${archived ? "unarchive" : "archive"}/${k}`);
            setConversations((prev) => prev.map((c) => (keyOf(c) === k ? { ...c, archived: !archived } : c)));
            // If we just archived the open conversation, close it.
            if (!archived && activeKey === k) setActiveKey(null);
            toast.success(archived ? "Conversation unarchived" : "Conversation archived");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to update conversation.");
        }
    };

    const counts = {
        all: conversations.filter((c) => !c.archived).length,
        active: conversations.filter((c) => !c.archived && isActiveRide(c)).length,
        archived: conversations.filter((c) => c.archived).length,
    };

    const filtered = conversations.filter((c) => {
        // Tab scope.
        if (tab === "archived") { if (!c.archived) return false; }
        else if (c.archived) return false;
        else if (tab === "active" && !isActiveRide(c)) return false;
        // Search.
        if (query.trim()) {
            const q = query.trim().toLowerCase();
            const hay = `${c.counterpart?.name || ""} ${c.ride?.source || ""} ${c.ride?.destination || ""}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });

    const cycleTab = () => setTab((t) => (t === "all" ? "active" : t === "active" ? "archived" : "all"));

    const activeConv = conversations.find((c) => keyOf(c) === activeKey) || null;
    const noConversations = conversations.length === 0;

    const tabs = [["all", "All"], ["active", "Active"], ["archived", "Archived"]];

    return (
        <div className={`ch-root${activeConv ? " has-active" : ""}`}>
            {/* List pane */}
            <aside className="ch-list-pane">
                <div className="ch-list-head">
                    {onOpenSidebar && (
                        <button type="button" className="ch-hamburger" onClick={onOpenSidebar} aria-label="Open menu">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                        </button>
                    )}
                    <div className="ch-head-text">
                        <h1 className="ch-title">Chats</h1>
                        <p className="ch-subtitle">Connect and coordinate with your co-travellers</p>
                    </div>
                </div>

                <div className="ch-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or route" aria-label="Search conversations" />
                    <button type="button" className="ch-filter-btn" onClick={cycleTab} title={`Filter: ${tab}`} aria-label="Filter conversations">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                    </button>
                </div>

                {/* Tabs */}
                <div className="ch-tabs" role="tablist">
                    {tabs.map(([key, label]) => (
                        <button key={key} className={`ch-tab${tab === key ? " active" : ""}`} onClick={() => setTab(key)} role="tab" aria-selected={tab === key}>
                            {label}<span className="ch-tab-count">{counts[key]}</span>
                        </button>
                    ))}
                </div>

                <div className="ch-conv-list">
                    {loading ? (
                        <div className="ch-conv-skeletons">
                            <div className="ch-conv-skeleton" /><div className="ch-conv-skeleton" /><div className="ch-conv-skeleton" />
                        </div>
                    ) : noConversations ? (
                        <>
                            <div className="ch-empty-card">
                                <span className="ch-empty-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></span>
                                <p className="ch-empty-title">No conversations yet</p>
                                <p className="ch-empty-sub">Book or offer a ride to start chatting with your co-travellers.</p>
                                <button className="ch-btn" onClick={() => onNavigate?.("findRides")}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                    Find a Ride
                                </button>
                            </div>
                            <TipsCard />
                        </>
                    ) : filtered.length === 0 ? (
                        <div className="ch-empty">
                            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                            <p className="ch-empty-title">{tab === "archived" ? "No archived chats" : "No matches"}</p>
                            <p className="ch-empty-sub">{tab === "archived" ? "Archived conversations will appear here." : "Try a different search or filter."}</p>
                        </div>
                    ) : (
                        filtered.map((c) => (
                            <ConvItem key={keyOf(c)} conv={c} active={keyOf(c) === activeKey} onClick={() => { setActiveKey(keyOf(c)); markThreadRead(c.rideId, c.counterpart?._id); }} />
                        ))
                    )}
                </div>
            </aside>

            {/* Window pane */}
            <section className="ch-win-pane">
                {activeConv ? (
                    <ChatWindow
                        key={activeKey}
                        conv={activeConv}
                        userId={userId}
                        onBack={() => setActiveKey(null)}
                        onThreadRead={markThreadRead}
                        onClear={onThreadCleared}
                        onArchiveToggle={toggleArchive}
                    />
                ) : (
                    <div className="ch-no-thread-wrap">
                        <div className="ch-no-thread">
                            <span className="ch-no-thread-art">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.3"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                            </span>
                            <p className="ch-no-thread-title">Select a conversation</p>
                            <p className="ch-no-thread-sub">Choose a ride conversation from the list to start messaging.</p>
                            <div className="ch-feature-chips">
                                <span className="ch-feature-chip"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg> Real-time Messaging</span>
                                <span className="ch-feature-chip"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg> Secure &amp; Private</span>
                                <span className="ch-feature-chip"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg> Ride-related Only</span>
                            </div>
                        </div>
                        <form className="ch-composer ch-composer-disabled" onSubmit={(e) => e.preventDefault()}>
                            <input className="ch-input" placeholder="Type your message…" aria-label="Message" disabled />
                            <button type="button" className="ch-send" disabled aria-label="Send">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                            </button>
                        </form>
                    </div>
                )}
            </section>
        </div>
    );
};

const Chats = ({ user, onOpenSidebar, onNavigate }) => (
    <MapsProvider>
        <ChatsInner user={user} onOpenSidebar={onOpenSidebar} onNavigate={onNavigate} />
    </MapsProvider>
);

export default Chats;
