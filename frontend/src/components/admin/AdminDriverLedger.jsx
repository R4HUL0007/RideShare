import React from "react";
import { adminPersonalLedger } from "../../services/personalRideService";
import { StatCard, Badge, useAdminList, fmtDateTime } from "./AdminUI";

const inr = (n) => `₹${(n ?? 0).toLocaleString("en-IN")}`;
const TONE = { pending: "amber", processing: "blue", settled: "green", failed: "red" };

const Ico = {
    wallet: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4z"></path></svg>,
    clock: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    check: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
    pie: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>,
};

const AdminDriverLedger = () => {
    const { items, meta, stats, loading, params, setParam, setPage } = useAdminList(adminPersonalLedger, {});
    const st = stats || {};

    return (
        <div>
            <div className="adm-stats">
                <StatCard icon={Ico.clock} value={loading ? "—" : inr(st.pendingSettlement)} label="Pending Settlement" sub="awaiting weekly payout" />
                <StatCard icon={Ico.check} value={loading ? "—" : inr(st.settled)} label="Settled" sub="paid to drivers" />
                <StatCard icon={Ico.pie} value={loading ? "—" : inr(st.totalCommission)} label="Platform Commission" sub="all personalized rides" />
            </div>

            <div className="adm-toolbar">
                <div className="adm-toolbar-spacer" />
                <select className="adm-select" value={params.status || "All"} onChange={(e) => setParam({ status: e.target.value })}>
                    <option value="All">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="settled">Settled</option>
                    <option value="failed">Failed</option>
                </select>
            </div>

            <div className="adm-table-card">
                {loading ? (
                    <div style={{ padding: "1rem" }}><div className="adm-skel" /><div className="adm-skel" /><div className="adm-skel" /></div>
                ) : items.length === 0 ? (
                    <div className="adm-empty"><span style={{ fontSize: "1.8rem" }}>📒</span><span>No ledger entries yet.</span></div>
                ) : (
                    <>
                        <div className="adm-table-wrap">
                            <table className="adm-table">
                                <thead><tr><th>Driver</th><th>Trip</th><th>Gross</th><th>Commission</th><th>Net Earnings</th><th>Status</th><th>Date</th></tr></thead>
                                <tbody>
                                    {items.map((e) => (
                                        <tr key={e._id}>
                                            <td>{e.driver_id?.name || "—"}</td>
                                            <td>{e.ride_id?.destination?.address ? `→ ${e.ride_id.destination.address}` : <span className="adm-muted">—</span>}</td>
                                            <td>{inr(e.grossAmount)}</td>
                                            <td>{inr(e.commission)}</td>
                                            <td><strong>{inr(e.netEarnings)}</strong></td>
                                            <td><Badge value={e.status} tone={TONE[e.status]} /></td>
                                            <td>{fmtDateTime(e.createdAt)}</td>
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
        </div>
    );
};

export default AdminDriverLedger;
