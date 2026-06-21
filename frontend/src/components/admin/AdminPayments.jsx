import React, { useState } from "react";
import { adminPayments } from "../../services/adminService";
import { Badge, StatCard, useAdminList, fmtDateTime } from "./AdminUI";
import EscrowRowActions from "./EscrowRowActions";
import { toast } from "react-toastify";

const Ico = {
    wallet: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4z"></path></svg>,
    check: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
    clock: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    x: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>,
    shield: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>,
    rupee: <span style={{ fontWeight: 800, fontSize: "1.2rem" }}>₹</span>,
};

const AdminPayments = () => {
    const { items, meta, stats, loading, params, setParam, setPage, reload } = useAdminList(adminPayments, {});
    const [showMore, setShowMore] = useState(false);

    const clearFilters = () => setParam({ q: "", status: "All", escrow: "All" });
    const inr = (n) => `₹${(n ?? 0).toLocaleString("en-IN")}`;

    const exportCsv = () => {
        if (!items.length) { toast.info("Nothing to export"); return; }
        const head = ["Order ID", "Passenger", "Driver", "Amount", "Driver Earnings", "Payment", "Escrow", "Date"];
        const lines = items.map((r) => [
            r.order_id, r.user_id?.name || "", r.driver_id?.name || "",
            r.amount, r.driverEarnings || 0, r.status, r.escrowStatus, fmtDateTime(r.paidAt || r.createdAt),
        ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
        const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `payments-page-${meta?.page || 1}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const today = new Date();
    const from = new Date(); from.setDate(today.getDate() - 29);
    const opt = { day: "numeric", month: "short" };
    const rangeLabel = `${from.toLocaleDateString(undefined, opt)} – ${today.toLocaleDateString(undefined, { ...opt, year: "numeric" })}`;

    const st = stats || {};

    return (
        <div>
            {/* Stat cards */}
            <div className="adm-stats">
                <StatCard icon={Ico.wallet} value={loading ? "—" : (st.total ?? 0)} label="Total Payments" sub="vs last 30 days" />
                <StatCard icon={Ico.check} value={loading ? "—" : (st.completed ?? 0)} label="Completed" sub="vs last 30 days" />
                <StatCard icon={Ico.clock} value={loading ? "—" : (st.pending ?? 0)} label="Pending" sub="vs last 30 days" />
                <StatCard icon={Ico.x} value={loading ? "—" : (st.failedCancelled ?? 0)} label="Failed / Cancelled" sub="vs last 30 days" />
                <StatCard icon={Ico.shield} value={loading ? "—" : inr(st.escrowHeld)} label="Escrow Held" sub="vs last 30 days" />
                <StatCard icon={Ico.rupee} value={loading ? "—" : inr(st.totalAmount)} label="Total Amount" sub="vs last 30 days" />
            </div>

            {/* Toolbar */}
            <div className="adm-toolbar">
                <div className="adm-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                        placeholder="Search by transaction ID, user, phone, or amount…"
                        value={params.q || ""}
                        onChange={(e) => setParam({ q: e.target.value })}
                    />
                </div>
                <select className="adm-select" value={params.status || "All"} onChange={(e) => setParam({ status: e.target.value })}>
                    <option value="All">All Payment Status</option>
                    <option value="Pending">Pending</option>
                    <option value="Successful">Successful</option>
                    <option value="Failed">Failed</option>
                    <option value="Cancelled">Cancelled</option>
                    <option value="Refunded">Refunded</option>
                </select>
                <select className="adm-select" value={params.escrow || "All"} onChange={(e) => setParam({ escrow: e.target.value })}>
                    <option value="All">All Escrow Status</option>
                    <option value="held">Held</option>
                    <option value="awaiting_completion">Awaiting Completion</option>
                    <option value="released">Released</option>
                    <option value="disputed">Disputed</option>
                    <option value="refunded">Refunded</option>
                </select>
                <span className="adm-date-pill">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    {rangeLabel}
                </span>
                <button className={`adm-btn ${showMore ? "primary" : ""}`} onClick={() => setShowMore((v) => !v)}>⛃ More Filters</button>
                <div className="adm-toolbar-spacer" />
                <button className="adm-btn" onClick={exportCsv}>⤓ Export</button>
            </div>

            {showMore && (
                <div className="adm-morefilters">
                    <span className="adm-muted">Refine results</span>
                    <button className="adm-btn" onClick={clearFilters}>Clear all filters</button>
                </div>
            )}

            {/* Table / empty state */}
            <div className="adm-table-card">
                {loading ? (
                    <div style={{ padding: "1rem" }}><div className="adm-skel" /><div className="adm-skel" /><div className="adm-skel" /></div>
                ) : items.length === 0 ? (
                    <div className="adm-rides-empty">
                        <div className="adm-rides-empty-illu">
                            <svg width="58" height="58" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
                                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path>
                                <path d="M18 12a2 2 0 0 0 0 4h4v-4z"></path>
                            </svg>
                        </div>
                        <div className="adm-rides-empty-title">No payments found</div>
                        <div className="adm-rides-empty-text">There are no payments matching your current filters.<br />Try adjusting your search or filter settings.</div>
                        <div className="adm-btn-row" style={{ justifyContent: "center" }}>
                            <button className="adm-btn primary" onClick={clearFilters}>⛃ Clear Filters</button>
                            <button className="adm-btn" onClick={clearFilters}>↻ Reset All Filters</button>
                        </div>
                        <div className="adm-foot-pager" style={{ marginTop: "1.4rem" }}>
                            <button className="adm-btn" disabled>← Prev</button>
                            <span className="adm-foot-info">Page {meta?.page || 1} of {meta?.pages || 1} · {meta?.total || 0} total</span>
                            <button className="adm-btn" disabled>Next →</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="adm-table-wrap">
                            <table className="adm-table">
                                <thead>
                                    <tr>
                                        <th>Order ID</th><th>Passenger</th><th>Driver</th><th>Amount</th>
                                        <th>Driver Earnings</th><th>Payment</th><th>Escrow</th><th>Date</th><th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((r) => (
                                        <tr key={r._id}>
                                            <td><span className="adm-mono">{(r.order_id || "").slice(-12)}</span></td>
                                            <td>{r.user_id?.name || "—"}</td>
                                            <td>{r.driver_id?.name || "—"}</td>
                                            <td>{inr(r.amount)}</td>
                                            <td>{inr(r.driverEarnings || 0)}</td>
                                            <td><Badge value={r.status} /></td>
                                            <td><Badge value={r.escrowStatus} /></td>
                                            <td>{fmtDateTime(r.paidAt || r.createdAt)}</td>
                                            <td><EscrowRowActions row={r} onDone={reload} /></td>
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

            {/* Tips strip */}
            <div className="adm-tips adm-tips--5">
                <div className="adm-tips-grid">
                    <div className="adm-tip">
                        <span className="adm-tip-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"></path></svg>
                        </span>
                        <div><strong>Explore payment insights</strong><span>Use these tools to analyze and manage payments effectively.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg>
                        </span>
                        <div><strong>Payment Reports</strong><span>View detailed payment reports and analytics.</span></div>
                        <span className="adm-tip-arrow"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                        </span>
                        <div><strong>User Transactions</strong><span>See payment history and activity by user.</span></div>
                        <span className="adm-tip-arrow"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                        </span>
                        <div><strong>Escrow Overview</strong><span>Track escrow balances and releases.</span></div>
                        <span className="adm-tip-arrow"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </span>
                        <div><strong>Export Data</strong><span>Download payment data for analysis.</span></div>
                        <span className="adm-tip-arrow"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPayments;
