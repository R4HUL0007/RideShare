import React, { useCallback, useEffect, useState } from "react";
import { adminPersonalSettlements, adminPersonalDashboard, adminRunSettlement } from "../../services/personalRideService";
import { StatCard, Badge, fmtDateTime } from "./AdminUI";
import { toast } from "react-toastify";

const inr = (n) => `₹${(n ?? 0).toLocaleString("en-IN")}`;
const TONE = { pending: "amber", processing: "blue", settled: "green", failed: "red" };

const Ico = {
    rupee: <span style={{ fontWeight: 800, fontSize: "1.05rem" }}>₹</span>,
    users: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>,
    clock: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    check: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
    cal: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>,
};

const AdminSettlements = () => {
    const [metrics, setMetrics] = useState(null);
    const [items, setItems] = useState([]);
    const [meta, setMeta] = useState(null);
    const [status, setStatus] = useState("All");
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [m, s] = await Promise.all([
                adminPersonalDashboard(),
                adminPersonalSettlements({ page, status: status === "All" ? undefined : status }),
            ]);
            setMetrics(m.data);
            setItems(s.data.items || []);
            setMeta(s.data.meta || null);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [page, status]);

    useEffect(() => { load(); }, [load]);

    const runNow = async () => {
        if (!window.confirm("Run the settlement engine now? This settles all pending driver earnings into payout batches.")) return;
        setRunning(true);
        try {
            const { data } = await adminRunSettlement();
            toast.success(data.message || "Settlement run complete");
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || "Settlement run failed");
        } finally { setRunning(false); }
    };

    const m = metrics || {};

    return (
        <div>
            <div className="adm-stats">
                <StatCard icon={Ico.rupee} value={loading ? "—" : inr(m.totalRevenue)} label="Total Revenue" sub="paid personalized rides" />
                <StatCard icon={Ico.users} value={loading ? "—" : inr(m.totalDriverEarnings)} label="Driver Earnings" sub="net across all rides" />
                <StatCard icon={Ico.clock} value={loading ? "—" : inr(m.pendingPayouts)} label="Pending Payouts" sub="awaiting settlement" />
                <StatCard icon={Ico.check} value={loading ? "—" : inr(m.completedPayouts)} label="Completed Payouts" sub="settled to drivers" />
                <StatCard icon={Ico.cal} value={loading ? "—" : inr(m.weeklyPending)} label="This Week's Payout" sub="ledger pending now" />
            </div>

            <div className="adm-toolbar">
                <select className="adm-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                    <option value="All">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="settled">Settled</option>
                    <option value="failed">Failed</option>
                </select>
                <div className="adm-toolbar-spacer" />
                <button className="adm-btn primary" onClick={runNow} disabled={running}>{running ? "Running…" : "⚙ Run Settlement Now"}</button>
            </div>

            <div className="adm-table-card">
                {loading ? (
                    <div style={{ padding: "1rem" }}><div className="adm-skel" /><div className="adm-skel" /><div className="adm-skel" /></div>
                ) : items.length === 0 ? (
                    <div className="adm-empty"><span style={{ fontSize: "1.8rem" }}>🧾</span><span>No settlements yet. They generate every Friday (or run one now).</span></div>
                ) : (
                    <>
                        <div className="adm-table-wrap">
                            <table className="adm-table">
                                <thead><tr><th>Batch</th><th>Driver</th><th>Rides</th><th>Gross</th><th>Commission</th><th>Net Paid</th><th>UPI</th><th>Status</th><th>Processed</th></tr></thead>
                                <tbody>
                                    {items.map((s) => (
                                        <tr key={s._id}>
                                            <td><span className="adm-mono">{s.batchId}</span></td>
                                            <td>{s.driver_id?.name || "—"}</td>
                                            <td>{s.rideCount}</td>
                                            <td>{inr(s.totalGross)}</td>
                                            <td>{inr(s.totalCommission)}</td>
                                            <td><strong>{inr(s.totalNet)}</strong></td>
                                            <td><span className="adm-mono">{s.upiId || "—"}</span></td>
                                            <td><Badge value={s.status} tone={TONE[s.status]} />{s.payoutRef === "SIMULATED" && <span className="adm-cell-sub"> sim</span>}</td>
                                            <td>{s.processedAt ? fmtDateTime(s.processedAt) : "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="adm-table-foot">
                            <div className="adm-foot-pager">
                                <button className="adm-btn" disabled={!meta || meta.page <= 1} onClick={() => setPage((meta?.page || 1) - 1)}>← Prev</button>
                                <span className="adm-foot-info">Page {meta?.page || 1} of {meta?.pages || 1} · {meta?.total || 0} total</span>
                                <button className="adm-btn" disabled={!meta || meta.page >= meta.pages} onClick={() => setPage((meta?.page || 1) + 1)}>Next →</button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div className="adm-tips" style={{ marginTop: "1.4rem" }}>
                <div className="adm-tips-grid">
                    <div className="adm-tip"><span className="adm-tip-icon">{Ico.cal}</span><div><strong>Weekly Settlement</strong><span>Runs automatically every Friday across all drivers.</span></div></div>
                    <div className="adm-tip"><span className="adm-tip-icon">{Ico.check}</span><div><strong>UPI Payouts</strong><span>Net earnings are paid to each driver's UPI via Razorpay.</span></div></div>
                    <div className="adm-tip"><span className="adm-tip-icon">{Ico.clock}</span><div><strong>Auto Retry</strong><span>Failed payouts are retried automatically.</span></div></div>
                </div>
            </div>
        </div>
    );
};

export default AdminSettlements;
