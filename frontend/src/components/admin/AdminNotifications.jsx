import React, { useEffect, useMemo, useRef, useState } from "react";
import { adminNotifications } from "../../services/adminService";
import { Badge, fmtDateTime } from "./AdminUI";
import { toast } from "react-toastify";

// Derived priority by notification type (disputes outrank withdrawal requests).
const PRIORITY = { dispute: "high", withdrawal: "medium" };
const TYPE_LABEL = { dispute: "Dispute", withdrawal: "Withdrawal" };

const Ico = {
    bell: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>,
    gear: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>,
    dispute: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
    withdrawal: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>,
};

const PREF_KEY = "adm_notif_prefs";
const DEFAULT_PREFS = { disputes: true, withdrawals: true, safety: true, system: true };

const AdminNotifications = () => {
    const [tab, setTab] = useState("all");
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hidden, setHidden] = useState(() => new Set());
    const [q, setQ] = useState("");
    const [priority, setPriority] = useState("All");
    const [type, setType] = useState("All");
    const [updatedAt, setUpdatedAt] = useState(null);
    const [prefs, setPrefs] = useState(() => {
        try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") }; } catch { return DEFAULT_PREFS; }
    });
    const firstLoad = useRef(true);

    const fetchNotifs = async () => {
        try {
            const { data } = await adminNotifications();
            setItems(data?.items || []);
            setUpdatedAt(new Date());
        } catch { /* ignore */ }
        finally { setLoading(false); }
    };

    useEffect(() => {
        fetchNotifs();
        const interval = setInterval(fetchNotifs, 30000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const setPref = (k, v) => {
        const next = { ...prefs, [k]: v };
        setPrefs(next);
        try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    };

    const filtered = useMemo(() => {
        return items
            .map((it) => ({ ...it, priority: PRIORITY[it.type] || "low" }))
            .filter((it) => !hidden.has(it.id))
            .filter((it) => (type === "All" ? true : it.type === type))
            .filter((it) => (priority === "All" ? true : it.priority === priority))
            .filter((it) => {
                if (!q) return true;
                const s = q.toLowerCase();
                return (it.title || "").toLowerCase().includes(s) || (it.message || "").toLowerCase().includes(s);
            });
    }, [items, hidden, type, priority, q]);

    const markAllRead = () => {
        setHidden(new Set(items.map((it) => it.id)));
        toast.success("Marked all as read");
    };

    const lastUpdatedLabel = updatedAt ? (Date.now() - updatedAt.getTime() < 8000 ? "Just now" : updatedAt.toLocaleTimeString()) : "—";

    const today = new Date();
    const from = new Date(); from.setDate(today.getDate() - 29);
    const opt = { day: "numeric", month: "short" };
    const rangeLabel = `${from.toLocaleDateString(undefined, opt)} – ${today.toLocaleDateString(undefined, { ...opt, year: "numeric" })}`;

    return (
        <div>
            {/* Tabs */}
            <div className="adm-tabs">
                <button className={`adm-tab ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>{Ico.bell} All Notifications</button>
                <button className={`adm-tab ${tab === "prefs" ? "active" : ""}`} onClick={() => setTab("prefs")}>{Ico.gear} Preferences</button>
            </div>

            {tab === "all" ? (
                <>
                    {/* Filter bar */}
                    <div className="adm-toolbar">
                        <select className="adm-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
                            <option value="All">All Priorities</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                        </select>
                        <select className="adm-select" value={type} onChange={(e) => setType(e.target.value)}>
                            <option value="All">All Types</option>
                            <option value="dispute">Disputes</option>
                            <option value="withdrawal">Withdrawals</option>
                        </select>
                        <span className="adm-date-pill">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            {rangeLabel}
                        </span>
                        <div className="adm-toolbar-spacer" />
                        <div className="adm-search" style={{ flex: "0 0 16rem" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            <input placeholder="Search notifications…" value={q} onChange={(e) => setQ(e.target.value)} />
                        </div>
                        <button className="adm-link-btn" style={{ padding: "0.5rem 0.7rem", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "0.5rem" }} onClick={markAllRead}>✓ Mark all as read</button>
                    </div>

                    {/* Main panel */}
                    <div className="adm-panel">
                        {loading ? (
                            <div style={{ padding: "1rem" }}><div className="adm-skel" /><div className="adm-skel" /><div className="adm-skel" /></div>
                        ) : filtered.length === 0 ? (
                            <div className="adm-live-empty">
                                <div className="adm-notif-illu">
                                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                                    <span className="adm-notif-check">✓</span>
                                </div>
                                <div className="adm-live-title">No pending notifications</div>
                                <div className="adm-live-text">You're all caught up! We'll notify you when something needs your attention.</div>
                                <button className="adm-btn primary" onClick={fetchNotifs}>↻ Refresh</button>
                            </div>
                        ) : (
                            <div className="adm-notif-list">
                                {filtered.map((it) => (
                                    <div key={it.id} className="adm-notif-item">
                                        <span className={`adm-type-icon adm-escrow-icon ${it.type === "dispute" ? "amber" : "blue"}`}>{Ico[it.type] || Ico.bell}</span>
                                        <div className="adm-notif-body">
                                            <div className="adm-notif-top">
                                                <strong>{it.title}</strong>
                                                <Badge value={it.priority} tone={it.priority === "high" ? "red" : it.priority === "medium" ? "amber" : "grey"} />
                                            </div>
                                            <span className="adm-notif-msg">{it.message}</span>
                                        </div>
                                        <span className="adm-notif-time">{fmtDateTime(it.at)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="adm-panel">
                    <div className="adm-panel-title">Notification Preferences</div>
                    <div className="adm-muted" style={{ marginBottom: "1rem" }}>Choose which platform alerts you want to be notified about. Saved on this device.</div>
                    {[
                        { k: "disputes", label: "Disputes", desc: "New disputes raised by members." },
                        { k: "withdrawals", label: "Withdrawals", desc: "Driver withdrawal requests awaiting review." },
                        { k: "safety", label: "Safety reports & SOS", desc: "Safety incidents and emergency alerts." },
                        { k: "system", label: "System alerts", desc: "Platform health and operational notices." },
                    ].map((row) => (
                        <label key={row.k} className="adm-pref-row">
                            <div><strong>{row.label}</strong><span>{row.desc}</span></div>
                            <input type="checkbox" checked={!!prefs[row.k]} onChange={(e) => setPref(row.k, e.target.checked)} />
                        </label>
                    ))}
                </div>
            )}

            {/* Feature strip */}
            <div className="adm-tips" style={{ marginTop: "1.4rem" }}>
                <div className="adm-tips-grid">
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.bell}</span>
                        <div><strong>Real-time Alerts</strong><span>Get instant notifications for critical events.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.gear}</span>
                        <div><strong>Customizable</strong><span>Configure what you want to be notified about.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg></span>
                        <div><strong>Reliable &amp; Secure</strong><span>Delivered securely and never miss important updates.</span></div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="adm-live-foot">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                <span>Auto-refreshes every 30 seconds.<br />Last updated: {lastUpdatedLabel}</span>
            </div>
        </div>
    );
};

export default AdminNotifications;
