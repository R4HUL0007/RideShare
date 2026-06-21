import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminDashboard, adminAnalytics, adminLive, adminNotifications } from "../../services/adminService";
import { getPlatformImpact } from "../../services/sustainabilityService";
import { StatCard, BarChart, LineChart, Donut, fmtDateTime } from "./AdminUI";

const AdminDashboard = () => {
    const navigate = useNavigate();
    const [cards, setCards] = useState(null);
    const [analytics, setAnalytics] = useState(null);
    const [live, setLive] = useState(null);
    const [impact, setImpact] = useState(null);
    const [activity, setActivity] = useState([]);
    const [loading, setLoading] = useState(true);
    const [perfTab, setPerfTab] = useState("drivers");

    useEffect(() => {
        let active = true;
        Promise.allSettled([adminDashboard(), adminAnalytics(30), adminLive(), getPlatformImpact(), adminNotifications()])
            .then(([d, a, l, s, n]) => {
                if (!active) return;
                if (d.status === "fulfilled") setCards(d.value.data.cards);
                if (a.status === "fulfilled") setAnalytics(a.value.data);
                if (l.status === "fulfilled") setLive(l.value.data);
                if (s.status === "fulfilled") setImpact(s.value.data.total);
                if (n.status === "fulfilled") setActivity(n.value.data?.items || []);
            })
            .finally(() => active && setLoading(false));
        return () => { active = false; };
    }, []);

    const c = cards || {};
    const im = impact || {};
    const inr = (n) => `₹${(n ?? 0).toLocaleString("en-IN")}`;
    const dash = loading ? "—" : undefined;

    // Last-30-days range label for the toolbar pill.
    const today = new Date();
    const from = new Date(); from.setDate(today.getDate() - 29);
    const opt = { day: "numeric", month: "short" };
    const rangeLabel = `${from.toLocaleDateString(undefined, opt)} – ${today.toLocaleDateString(undefined, { ...opt, year: "numeric" })}`;

    // Ratings distribution (1–5) → map to counts for the mini cards.
    const ratingMap = {};
    (analytics?.ratingDist || []).forEach((r) => { ratingMap[r._id] = r.count; });
    const ratingTotal = Object.values(ratingMap).reduce((a, b) => a + b, 0);

    // Disputes breakdown. We only have an aggregate "active" count from the API,
    // so Open reflects that and the rest default to 0 (accurate on a fresh
    // platform; an approximation once historical disputes accrue).
    const openD = loading ? 0 : (c.activeDisputes || 0);
    const disputeSegs = [
        { label: "Open", value: openD, color: "#f4f4f5", pct: 0 },
        { label: "In Progress", value: 0, color: "#9ca3af", pct: 0 },
        { label: "Resolved", value: 0, color: "#4b5563", pct: 0 },
    ];
    const disputeTotal = disputeSegs.reduce((a, b) => a + b.value, 0);
    disputeSegs.forEach((s) => { s.pct = disputeTotal ? Math.round((s.value / disputeTotal) * 100) : 0; });

    const sub30 = "vs last 30 days";

    return (
        <div>
            {/* Toolbar with the active date range */}
            <div className="adm-dash-toolbar">
                <span className="adm-dash-hint">Platform overview</span>
                <span className="adm-date-pill">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    {rangeLabel}
                </span>
            </div>

            <div className="adm-stats">
                <StatCard icon="👥" value={dash ?? c.totalUsers} label="Total Users" sub={sub30} />
                <StatCard icon="🚗" value={dash ?? c.totalRides} label="Total Rides" sub={sub30} />
                <StatCard icon="📖" value={dash ?? c.totalBookings} label="Total Bookings" sub={sub30} />
                <StatCard icon="💰" value={dash ?? inr(c.totalRevenue)} label="Total Revenue" sub={sub30} />
                <StatCard icon="💳" value={dash ?? inr(c.escrowBalance)} label="Escrow Balance" sub="Held in escrow" />
                <StatCard icon="⚠️" value={dash ?? c.activeDisputes} label="Active Disputes" sub="Needs attention" />
                <StatCard icon="⭐" value={dash ?? c.totalReviews} label="Total Reviews" sub={sub30} />
                <StatCard icon="📍" value={dash ?? c.activeLiveRides} label="Active Live Rides" sub="Live now" />
            </div>

            <div className="adm-grid2">
                <div className="adm-panel">
                    <div className="adm-panel-title">
                        <span>📊 Rides Overview <span className="adm-muted">(last 30 days)</span></span>
                        <span className="adm-daily-chip">Daily</span>
                    </div>
                    <BarChart data={analytics?.rides} />
                </div>
                <div className="adm-panel">
                    <div className="adm-panel-title">
                        <span>👤 New Users <span className="adm-muted">(last 30 days)</span></span>
                        <span className="adm-daily-chip">Daily</span>
                    </div>
                    <LineChart data={analytics?.users} />
                </div>
            </div>

            <div className="adm-grid3">
                <div className="adm-panel">
                    <div className="adm-panel-title">
                        <span>💰 Revenue <span className="adm-muted">(last 30 days)</span></span>
                        <span className="adm-daily-chip">Daily</span>
                    </div>
                    <div className="adm-big-figure">{dash ?? inr(c.totalRevenue)}</div>
                    <div className="adm-figure-label">Total Revenue · {sub30}</div>
                    <BarChart data={analytics?.payments} yKey="revenue" height={120} />
                </div>

                <div className="adm-panel">
                    <div className="adm-panel-title">⭐ Ratings Distribution</div>
                    <div className="adm-ratings">
                        {[5, 4, 3, 2, 1].map((star) => {
                            const count = ratingMap[star] || 0;
                            const pct = ratingTotal ? Math.round((count / ratingTotal) * 100) : 0;
                            return (
                                <div className="adm-rating-card" key={star}>
                                    <div className="adm-rating-star">{star}★</div>
                                    <div className="adm-rating-count">{loading ? "—" : count}</div>
                                    <div className="adm-rating-pct">{pct}%</div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="adm-panel">
                    <div className="adm-panel-title">⚠️ Disputes <span className="adm-muted">(last 30 days)</span></div>
                    <div className="adm-donut-wrap">
                        <div className="adm-donut-center">
                            <Donut segments={disputeSegs} />
                            <div className="adm-donut-label">
                                <strong>{loading ? "—" : disputeTotal}</strong>
                                <span>Total Disputes</span>
                            </div>
                        </div>
                        <div className="adm-donut-legend">
                            {disputeSegs.map((s) => (
                                <div className="adm-legend-item" key={s.label}>
                                    <span className="adm-legend-dot" style={{ background: s.color }} />
                                    <span className="adm-legend-name">{s.label}</span>
                                    <span className="adm-legend-val">{loading ? "—" : s.value} ({s.pct}%)</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="adm-grid3">
                <div className="adm-panel">
                    <div className="adm-panel-title">🟢 Live Monitoring</div>
                    <div className="adm-kv"><span className="k">Online Users</span><span>{live?.onlineUsers ?? "—"}</span></div>
                    <div className="adm-kv"><span className="k">Active Rides</span><span>{live?.activeRides ?? "—"}</span></div>
                    <div className="adm-kv"><span className="k">Live Tracking Sessions</span><span>{live?.liveTracking ?? "—"}</span></div>
                    <div className="adm-kv"><span className="k">Monthly Revenue</span><span>{loading ? "—" : inr(c.monthlyRevenue)}</span></div>
                </div>

                <div className="adm-panel">
                    <div className="adm-panel-title">
                        <span>🔔 Recent Activity</span>
                        <button className="adm-link-btn" onClick={() => navigate("/admin/notifications")}>View All</button>
                    </div>
                    {activity.length === 0 ? (
                        <div className="adm-chart-empty" style={{ height: 140 }}>No recent activity</div>
                    ) : (
                        <div className="adm-activity">
                            {activity.slice(0, 5).map((a, i) => (
                                <div className="adm-activity-item" key={a.id || i}>
                                    <span className="adm-activity-icon">{a.type === "dispute" ? "⚠️" : "🏧"}</span>
                                    <div className="adm-activity-text">
                                        <strong>{a.title}</strong>
                                        <span>{a.message}</span>
                                    </div>
                                    <span className="adm-activity-time">{fmtDateTime(a.at)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="adm-panel">
                    <div className="adm-panel-title">
                        <span>🏆 Top Performers</span>
                        <span className="adm-seg">
                            <button className={`adm-seg-btn ${perfTab === "drivers" ? "active" : ""}`} onClick={() => setPerfTab("drivers")}>Drivers</button>
                            <button className={`adm-seg-btn ${perfTab === "passengers" ? "active" : ""}`} onClick={() => setPerfTab("passengers")}>Passengers</button>
                        </span>
                    </div>
                    <div className="adm-chart-empty" style={{ height: 140, flexDirection: "column", gap: "0.4rem" }}>
                        <span style={{ fontSize: "1.6rem" }}>🏅</span>
                        <span>No data yet</span>
                    </div>
                </div>
            </div>

            {/* 🌱 Platform sustainability impact + CTA */}
            <div className="adm-panel-title" style={{ marginBottom: "0.7rem" }}>🌱 Platform Environmental Impact</div>
            <div className="adm-grid-impact">
                <div className="adm-stats" style={{ marginBottom: 0 }}>
                    <StatCard icon="🌱" value={loading ? "—" : `${(im.co2SavedKg ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })} kg`} label="Total CO₂ Saved" sub="vs last 30 days" />
                    <StatCard icon="⛽" value={loading ? "—" : `${(im.fuelSavedL ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`} label="Total Fuel Saved" sub="vs last 30 days" />
                    <StatCard icon="🚗" value={loading ? "—" : (im.sharedTrips ?? 0)} label="Shared Trips" sub="vs last 30 days" />
                    <StatCard icon="🛣️" value={loading ? "—" : `${(im.sharedDistanceKm ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })} km`} label="Distance Shared" sub="vs last 30 days" />
                    <StatCard icon="🌳" value={loading ? "—" : Math.round(im.treeEquivalent ?? 0)} label="Trees Equivalent" sub="≈ trees/year" />
                </div>
                <div className="adm-cta-card">
                    <div className="adm-cta-globe">🌍</div>
                    <div className="adm-cta-title">Every shared ride creates a better tomorrow.</div>
                    <div className="adm-cta-text">Keep the community moving towards a greener campus.</div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
