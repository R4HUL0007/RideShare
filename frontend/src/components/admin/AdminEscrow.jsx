import React, { useCallback, useEffect, useState } from "react";
import { adminEscrow, adminPayments } from "../../services/adminService";
import { Badge, useAdminList, fmtDateTime } from "./AdminUI";
import EscrowRowActions from "./EscrowRowActions";
import { toast } from "react-toastify";

const ICONS = {
    lock: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>,
    clock: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    check: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
    alert: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
    refund: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>,
};

const STEPS = [
    { n: 1, tone: "grey", icon: ICONS.lock, title: "Held", desc: "Passenger pays, funds are locked in escrow." },
    { n: 2, tone: "amber", icon: ICONS.clock, title: "Awaiting Completion", desc: "Ride is completed, 24h auto-release clock starts." },
    { n: 3, tone: "green", icon: ICONS.check, title: "Released", desc: "Funds are released to driver (passenger confirmed / auto / admin)." },
    { n: 4, tone: "red", icon: ICONS.alert, title: "Disputed", desc: "Passenger raises a dispute, funds are frozen until admin resolves." },
    { n: 5, tone: "blue", icon: ICONS.refund, title: "Refunded", desc: "Dispute upheld, funds are returned to passenger." },
];

const AdminEscrow = () => {
    const [buckets, setBuckets] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showMore, setShowMore] = useState(false);
    // Transaction list (real escrow records) with server filters + actions.
    const { items, meta, loading: listLoading, params, setParam, setPage, reload } = useAdminList(adminPayments, {});

    const loadBuckets = useCallback(() => {
        setLoading(true);
        adminEscrow()
            .then(({ data }) => setBuckets(data.buckets))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { loadBuckets(); }, [loadBuckets]);

    const afterAction = () => { reload(); loadBuckets(); };

    const inr = (n) => `₹${(n ?? 0).toLocaleString("en-IN")}`;
    const b = buckets || {};

    const cards = [
        { key: "held", icon: ICONS.lock, tone: "grey", label: "Held in Escrow", pill: "Locked funds" },
        { key: "awaiting_completion", icon: ICONS.clock, tone: "amber", label: "Awaiting Completion", pill: "In progress" },
        { key: "released", icon: ICONS.check, tone: "green", label: "Released to Drivers", pill: "Completed" },
        { key: "disputed", icon: ICONS.alert, tone: "red", label: "Disputed (Frozen)", pill: "Requires attention" },
        { key: "refunded", icon: ICONS.refund, tone: "blue", label: "Refunded", pill: "Returned" },
    ];

    const exportCsv = () => {
        const rows = cards.map((c) => [c.label, b[c.key] || 0]);
        const csv = ["Bucket,Amount", ...rows.map((r) => `"${r[0]}",${r[1]}`)].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "escrow-summary.csv"; a.click();
        URL.revokeObjectURL(url);
    };

    const today = new Date();
    const from = new Date(); from.setDate(today.getDate() - 29);
    const opt = { day: "numeric", month: "short" };
    const rangeLabel = `${from.toLocaleDateString(undefined, opt)} – ${today.toLocaleDateString(undefined, { ...opt, year: "numeric" })}`;

    return (
        <div>
            {/* Stat cards with status pills */}
            <div className="adm-stats">
                {cards.map((c) => (
                    <div className="adm-stat adm-escrow-card" key={c.key}>
                        <span className={`adm-stat-icon adm-escrow-icon ${c.tone}`}>{c.icon}</span>
                        <div className="adm-stat-body">
                            <div className="adm-stat-value">{loading ? "—" : inr(b[c.key])}</div>
                            <div className="adm-stat-label">{c.label}</div>
                            <span className={`adm-badge ${c.tone}`} style={{ marginTop: "0.45rem" }}>{c.pill}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Toolbar — filters the transaction list below */}
            <div className="adm-toolbar">
                <div className="adm-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input placeholder="Search by transaction ID, passenger, driver…" value={params.q || ""} onChange={(e) => setParam({ q: e.target.value })} />
                </div>
                <select className="adm-select" value={params.status || "All"} onChange={(e) => setParam({ status: e.target.value })}>
                    <option value="All">All Payment Status</option>
                    <option value="Successful">Successful</option>
                    <option value="Pending">Pending</option>
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
                    <span className="adm-muted">Tip: filter by "Awaiting Completion" to find rides whose funds are ready to release.</span>
                    <button className="adm-btn" onClick={() => setParam({ q: "", status: "All", escrow: "All" })}>Clear</button>
                </div>
            )}

            {/* Escrow transactions */}
            <div className="adm-table-card">
                {listLoading ? (
                    <div style={{ padding: "1rem" }}><div className="adm-skel" /><div className="adm-skel" /><div className="adm-skel" /></div>
                ) : items.length === 0 ? (
                    <div className="adm-empty"><span style={{ fontSize: "1.8rem" }}>💳</span><span>No transactions match these filters.</span></div>
                ) : (
                    <>
                        <div className="adm-table-wrap">
                            <table className="adm-table">
                                <thead>
                                    <tr><th>Order ID</th><th>Passenger</th><th>Driver</th><th>Amount</th><th>Driver Earnings</th><th>Payment</th><th>Escrow</th><th>Date</th><th>Actions</th></tr>
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
                                            <td><EscrowRowActions row={r} onDone={afterAction} /></td>
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

            {/* Escrow Flow */}
            <div className="adm-panel" style={{ marginTop: "0.2rem" }}>
                <div className="adm-panel-title" style={{ display: "block", marginBottom: "0.3rem" }}>Escrow Flow</div>
                <div className="adm-muted" style={{ marginBottom: "1.4rem" }}>Understanding how escrow works on the platform.</div>
                <div className="adm-flow">
                    {STEPS.map((s, i) => (
                        <React.Fragment key={s.n}>
                            <div className="adm-flow-step">
                                <div className={`adm-flow-icon ${s.tone}`}>
                                    <span className={`adm-flow-num ${s.tone}`}>{s.n}</span>
                                    {s.icon}
                                </div>
                                <div className="adm-flow-title">{s.title}</div>
                                <div className="adm-flow-desc">{s.desc}</div>
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className="adm-flow-arrow" aria-hidden="true">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                </div>
                            )}
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* Escrow Insights */}
            <div className="adm-tips adm-tips--5">
                <div className="adm-tips-grid">
                    <div className="adm-tip">
                        <span className="adm-tip-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg></span>
                        <div><strong>Escrow Insights</strong><span>Quick overview of escrow activity.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>
                        <div><strong>Safe &amp; Secure</strong><span>Funds are held securely until all conditions are met.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></span>
                        <div><strong>Automatic Process</strong><span>24h auto-release ensures smooth transactions.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg></span>
                        <div><strong>Dispute Protection</strong><span>Disputes are handled fairly with admin oversight.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></span>
                        <div><strong>Full Transparency</strong><span>Track every escrow transaction with complete visibility.</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminEscrow;
