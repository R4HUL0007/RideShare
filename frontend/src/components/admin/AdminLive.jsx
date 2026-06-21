import React, { useEffect, useRef, useState } from "react";
import { adminLive } from "../../services/adminService";

// Tiny inline sparkline from a rolling sample history.
const Sparkline = ({ data, color }) => {
    const w = 120, h = 36;
    if (!data || data.length < 2) {
        return <svg className="adm-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"><line x1="0" y1={h - 4} x2={w} y2={h - 4} stroke={color} strokeWidth="2" strokeOpacity="0.5" /></svg>;
    }
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / range) * (h - 8)]);
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    return (
        <svg className="adm-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="1.6" fill={color} />)}
        </svg>
    );
};

const ICONS = {
    users: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
    car: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H4a2 2 0 0 1-2-2v-3.34a2 2 0 0 1 .38-1.17l1.86-2.5A2 2 0 0 1 5.85 7H15l3.5 4.5 1.9.63A2 2 0 0 1 22 14v1a2 2 0 0 1-2 2h-1"></path><circle cx="7" cy="17" r="2"></circle><circle cx="17" cy="17" r="2"></circle></svg>,
    pin: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>,
};

const AdminLive = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [updatedAt, setUpdatedAt] = useState(null);
    const histRef = useRef({ online: [], rides: [], tracking: [] });
    const [, force] = useState(0);

    const fetchLive = async () => {
        try {
            const { data: d } = await adminLive();
            setData(d);
            const h = histRef.current;
            h.online.push(d?.onlineUsers ?? 0); h.rides.push(d?.activeRides ?? 0); h.tracking.push(d?.liveTracking ?? 0);
            Object.keys(h).forEach((k) => { if (h[k].length > 14) h[k].shift(); });
            setUpdatedAt(new Date());
            force((n) => n + 1);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    };

    useEffect(() => {
        fetchLive();
        const interval = setInterval(fetchLive, 10000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const h = histRef.current;
    const cards = [
        { icon: ICONS.users, value: data?.onlineUsers ?? 0, label: "Online Users", color: "#34d399", hist: h.online },
        { icon: ICONS.car, value: data?.activeRides ?? 0, label: "Active Rides", color: "#818cf8", hist: h.rides },
        { icon: ICONS.pin, value: data?.liveTracking ?? 0, label: "Live Tracking Sessions", color: "#fb7185", hist: h.tracking },
    ];
    const list = data?.activeRideList || [];
    const lastUpdatedLabel = updatedAt ? (Date.now() - updatedAt.getTime() < 5000 ? "Just now" : updatedAt.toLocaleTimeString()) : "—";

    return (
        <div>
            {/* Stat cards with sparklines */}
            <div className="adm-live-stats">
                {cards.map((c) => (
                    <div className="adm-stat adm-live-card" key={c.label}>
                        <span className="adm-stat-icon" style={{ color: c.color }}>{c.icon}</span>
                        <div className="adm-stat-body">
                            <div className="adm-stat-value">{loading ? "—" : c.value}</div>
                            <div className="adm-stat-label">{c.label}</div>
                            <div className="adm-stat-sub">— vs last 5 minutes</div>
                        </div>
                        <Sparkline data={c.hist} color={c.color} />
                    </div>
                ))}
            </div>

            {/* Main panel */}
            <div className="adm-panel" style={{ marginTop: "1.4rem" }}>
                {loading ? (
                    <div style={{ padding: "1rem" }}><div className="adm-skel" /><div className="adm-skel" /><div className="adm-skel" /></div>
                ) : list.length > 0 ? (
                    <>
                        <div className="adm-panel-title">📍 Live Tracking Rides</div>
                        {list.map((r) => (
                            <div key={r._id} className="adm-kv">
                                <span className="k">{r.source} → {r.destination}</span>
                                <span>{r.user_id?.name || "Driver"} • {r.tracking?.state}</span>
                            </div>
                        ))}
                        <div style={{ textAlign: "center", marginTop: "1rem" }}>
                            <button className="adm-btn primary" onClick={fetchLive}>↻ Refresh Now</button>
                        </div>
                    </>
                ) : (
                    <div className="adm-live-empty">
                        <div className="adm-live-illu">
                            <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 18a4 4 0 0 1 0-8"></path>
                                <path d="M9 14a8 8 0 0 1 0-8"></path>
                                <circle cx="14" cy="14" r="4"></circle>
                                <line x1="16.8" y1="16.8" x2="21" y2="21"></line>
                            </svg>
                        </div>
                        <div className="adm-live-title">No active live tracking sessions right now.</div>
                        <div className="adm-live-text">When users start live tracking, you'll see real-time activity here.</div>
                        <button className="adm-btn primary" onClick={fetchLive}>↻ Refresh Now</button>
                    </div>
                )}
            </div>

            {/* Feature strip */}
            <div className="adm-tips" style={{ marginTop: "1.4rem" }}>
                <div className="adm-tips-grid">
                    <div className="adm-tip">
                        <span className="adm-tip-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg></span>
                        <div><strong>Real-time Updates</strong><span>See activity as it happens.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg></span>
                        <div><strong>Reliable Monitoring</strong><span>Continuous and accurate data.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></span>
                        <div><strong>Auto Refresh</strong><span>Updates every 10 seconds.</span></div>
                    </div>
                </div>
            </div>

            {/* Refresh footer */}
            <div className="adm-live-foot">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                <span>Auto-refreshes every 10 seconds.<br />Last updated: {lastUpdatedLabel}</span>
            </div>
        </div>
    );
};

export default AdminLive;
