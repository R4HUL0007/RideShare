import React, { useEffect, useState } from "react";
import { aiAnalytics, aiReindex } from "../../services/aiService";
import { StatCard, LineChart, Donut } from "./AdminUI";
import axiosInstance from "../../utils/axiosConfig";
import { API_BASE_URL } from "../../utils/constants";
import { toast } from "react-toastify";

// Decorative sparkline (visual accent on the top KPI cards, like the mockup).
const Spark = ({ color, seed = 1 }) => {
    const w = 130, h = 38, n = 12;
    const pts = Array.from({ length: n }, (_, i) => {
        const base = Math.sin((i / n) * Math.PI * 2 + seed) * 0.5 + 0.5;
        const rise = i / (n - 1);
        const y = h - 4 - (base * 0.5 + rise * 0.5) * (h - 10);
        return [(i / (n - 1)) * w, y];
    });
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    return (
        <svg className="adm-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

const I = (paths) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>;
const Ico = {
    bot: I(<><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></>),
    target: I(<><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></>),
    alert: I(<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></>),
    tool: I(<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>),
    search: I(<><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></>),
    check: I(<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></>),
    route: I(<><circle cx="6" cy="19" r="3"></circle><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"></path><circle cx="18" cy="5" r="3"></circle></>),
    pin: I(<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></>),
    ticket: I(<><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"></path></>),
    eye: I(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></>),
    click: I(<><path d="M9 9l5 12 1.8-5.2L21 14z"></path><path d="M7.2 2.2 8 5.1"></path><path d="m5.1 8-2.9-.8"></path></>),
    trend: I(<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></>),
};

const DONUT_COLORS = ["#a78bfa", "#f0abfc", "#818cf8", "#6b7280", "#4b5563"];

const AdminAIInsights = () => {
    const [data, setData] = useState(null);
    const [routeData, setRouteData] = useState(null);
    const [recoData, setRecoData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [reindexing, setReindexing] = useState(false);

    const load = () => {
        setLoading(true);
        Promise.allSettled([
            aiAnalytics(30),
            axiosInstance.get(`${API_BASE_URL}/admin/route-analytics`, { params: { days: 30 } }),
            axiosInstance.get(`${API_BASE_URL}/recommendations/analytics`, { params: { days: 30 } }),
        ]).then(([ai, route, reco]) => {
            if (ai.status === "fulfilled") setData(ai.value.data);
            if (route.status === "fulfilled") setRouteData(route.value.data);
            if (reco.status === "fulfilled") setRecoData(reco.value.data);
        }).finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const handleReindex = async () => {
        setReindexing(true);
        try {
            const { data } = await aiReindex();
            toast.success(`Knowledge base re-indexed (${data.chunks} chunks)`);
        } catch { toast.error("Reindex failed"); }
        finally { setReindexing(false); }
    };

    const d = data || {};
    const rd = routeData || {};
    const rc = recoData || {};
    const totalInteractions = (d.intents || []).reduce((s, i) => s + i.count, 0);

    const tools = d.topTools || [];
    const toolTotal = tools.reduce((s, t) => s + t.count, 0);
    const donutSegs = tools.map((t, i) => ({ label: t.tool, value: t.count, color: DONUT_COLORS[i % DONUT_COLORS.length] }));

    return (
        <div>
            {/* Top KPI cards with sparklines */}
            <div className="adm-ai-kpis">
                <div className="adm-stat adm-live-card"><span className="adm-stat-icon" style={{ color: "#a78bfa" }}>{Ico.bot}</span><div className="adm-stat-body"><div className="adm-stat-value">{loading ? "—" : totalInteractions}</div><div className="adm-stat-label">Total Interactions (30d)</div><div className="adm-stat-sub">— vs last 30 days</div></div><Spark color="#a78bfa" seed={1} /></div>
                <div className="adm-stat adm-live-card"><span className="adm-stat-icon" style={{ color: "#f472b6" }}>{Ico.target}</span><div className="adm-stat-body"><div className="adm-stat-value">{loading ? "—" : `${d.retrievalGroundingRate ?? 0}%`}</div><div className="adm-stat-label">RAG Grounding Rate</div><div className="adm-stat-sub">— vs last 30 days</div></div><Spark color="#f472b6" seed={2} /></div>
                <div className="adm-stat adm-live-card"><span className="adm-stat-icon" style={{ color: "#fbbf24" }}>{Ico.alert}</span><div className="adm-stat-body"><div className="adm-stat-value">{loading ? "—" : d.failedQueries ?? 0}</div><div className="adm-stat-label">Failed Queries</div><div className="adm-stat-sub">— vs last 30 days</div></div><Spark color="#fbbf24" seed={3} /></div>
                <div className="adm-stat adm-live-card"><span className="adm-stat-icon" style={{ color: "#818cf8" }}>{Ico.tool}</span><div className="adm-stat-body"><div className="adm-stat-value">{loading ? "—" : tools.length}</div><div className="adm-stat-label">Tools In Use</div><div className="adm-stat-sub">— vs last 30 days</div></div><Spark color="#818cf8" seed={4} /></div>
            </div>

            {/* Smart Route Matching */}
            <div className="adm-panel" style={{ marginTop: "1.2rem" }}>
                <div className="adm-section-head">
                    <span className="adm-section-title">🧭 Smart Route Matching <span className="adm-muted">(30d)</span></span>
                </div>
                <div className="adm-stats" style={{ marginBottom: 0 }}>
                    <StatCard icon={Ico.search} value={loading ? "—" : (rd.searches ?? 0)} label="Smart Searches" sub="— vs last 30 days" />
                    <StatCard icon={Ico.check} value={loading ? "—" : `${rd.matchSuccessRate ?? 0}%`} label="Match Success Rate" sub="— vs last 30 days" />
                    <StatCard icon={Ico.route} value={loading ? "—" : (rd.intermediateStopMatches ?? 0)} label="On-route Matches" sub="— vs last 30 days" />
                    <StatCard icon={Ico.pin} value={loading ? "—" : (rd.nearbyDestinationMatches ?? 0)} label="Nearby-dest Matches" sub="— vs last 30 days" />
                    <StatCard icon={Ico.ticket} value={loading ? "—" : `${rd.conversionRate ?? 0}%`} label="Conversion Rate" sub="— vs last 30 days" />
                </div>
            </div>

            {/* Recommendations */}
            <div className="adm-panel" style={{ marginTop: "1.2rem" }}>
                <div className="adm-section-head">
                    <span className="adm-section-title">🎯 Recommendations <span className="adm-muted">(30d)</span></span>
                </div>
                <div className="adm-stats" style={{ marginBottom: 0 }}>
                    <StatCard icon={Ico.eye} value={loading ? "—" : (rc.impression ?? 0)} label="Impressions" sub="— vs last 30 days" />
                    <StatCard icon={Ico.click} value={loading ? "—" : (rc.click ?? 0)} label="Clicks" sub="— vs last 30 days" />
                    <StatCard icon={Ico.trend} value={loading ? "—" : `${rc.ctr ?? 0}%`} label="Click-through Rate" sub="— vs last 30 days" />
                    <StatCard icon={Ico.check} value={loading ? "—" : (rc.conversion ?? 0)} label="Conversions" sub="— vs last 30 days" />
                    <StatCard icon={Ico.ticket} value={loading ? "—" : `${rc.conversionRate ?? 0}%`} label="Reco Conversion" sub="— vs last 30 days" />
                </div>
            </div>

            {/* Charts row */}
            <div className="adm-grid2" style={{ marginTop: "1.2rem" }}>
                <div className="adm-panel">
                    <div className="adm-panel-title">📈 Intents <span className="adm-muted">(last 30 days)</span></div>
                    <LineChart data={d.daily} xKey="_id" yKey="count" />
                </div>
                <div className="adm-panel">
                    <div className="adm-panel-title">
                        <span>🛠️ Most Used Tools</span>
                        <button className="adm-btn primary" onClick={handleReindex} disabled={reindexing}>{reindexing ? "Re-indexing…" : "↻ Re-index Knowledge Base"}</button>
                    </div>
                    <div className="adm-donut-wrap">
                        <div className="adm-donut-center">
                            <Donut segments={donutSegs} />
                            <div className="adm-donut-label"><strong>{loading ? "—" : toolTotal}</strong><span>Total</span></div>
                        </div>
                        <div className="adm-donut-legend">
                            {tools.length === 0 ? (
                                <span className="adm-muted">No tool usage yet.</span>
                            ) : tools.map((t, i) => (
                                <div className="adm-legend-item" key={t.tool}>
                                    <span className="adm-legend-dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                                    <span className="adm-legend-name">{t.tool}</span>
                                    <span className="adm-legend-val">{toolTotal ? Math.round((t.count / toolTotal) * 100) : 0}% ({t.count})</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Most Common Questions */}
            <div className="adm-panel" style={{ marginTop: "1.2rem" }}>
                <div className="adm-panel-title">💬 Most Common Questions</div>
                {(d.topQuestions || []).length === 0 ? (
                    <div className="adm-empty"><span style={{ fontSize: "1.6rem" }}>💬</span><span>No questions found in the last 30 days.</span></div>
                ) : (
                    <div className="adm-table-wrap" style={{ border: "none" }}>
                        <table className="adm-table">
                            <thead><tr><th>Question</th><th>Intent</th><th>Interactions</th><th>Trend (30d)</th></tr></thead>
                            <tbody>
                                {(d.topQuestions || []).map((q, i) => (
                                    <tr key={i}>
                                        <td style={{ textTransform: "none" }}>{q.question}</td>
                                        <td>{q.intent || "—"}</td>
                                        <td>{q.count}</td>
                                        <td><Spark color="#a78bfa" seed={i + 1} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminAIInsights;
