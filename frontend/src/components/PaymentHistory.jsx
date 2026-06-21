import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { getMyPayments, confirmCompletion } from "../services/paymentService";
import { StatusBadge, EscrowBadge } from "./payments/PaymentDialogs";
import ThemedSelect from "./ThemedSelect";
import "../styles/payments.css";

const ReceiptModal = lazy(() => import("./payments/ReceiptModal"));
const DisputeModal = lazy(() => import("./payments/DisputeModal"));

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

const STATUS_OPTIONS = [
    { value: "All", label: "All statuses" },
    { value: "Successful", label: "Successful" },
    { value: "Pending", label: "Pending" },
    { value: "Failed", label: "Failed" },
    { value: "Cancelled", label: "Cancelled" },
    { value: "Refunded", label: "Refunded" },
];

const SCOPE_OPTIONS = [{ value: "month", label: "This Month" }, { value: "all", label: "All time" }];

/* ---------------- stat card (with sparkline) ---------------- */
function PStat({ icon, label, value, sub, accent }) {
    return (
        <div className={`payh-stat accent-${accent}`}>
            <div className="payh-stat-head">
                <span className="payh-stat-icon">{icon}</span>
                <span className="payh-stat-label">{label}</span>
                <svg className="payh-stat-spark" viewBox="0 0 64 24" fill="none" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M1 18 L10 12 L18 16 L27 7 L36 13 L45 5 L54 10 L63 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </div>
            <div className="payh-stat-value">{value}</div>
            {sub ? <div className="payh-stat-sub">{sub}</div> : null}
        </div>
    );
}

const PaymentHistory = ({ onOpenSidebar, onNavigate }) => {
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState("All");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [summaryScope, setSummaryScope] = useState("month");
    const [receiptId, setReceiptId] = useState(null);
    const [disputePayment, setDisputePayment] = useState(null);
    const [confirmingId, setConfirmingId] = useState(null);

    const load = () => {
        setLoading(true);
        getMyPayments()
            .then(({ data }) => setPayments(Array.isArray(data) ? data : []))
            .catch(() => setPayments([]))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        return payments.filter((p) => {
            if (status !== "All" && p.status !== status) return false;
            const t = p.createdAt ? new Date(p.createdAt).getTime() : 0;
            if (fromDate && t < new Date(fromDate).setHours(0, 0, 0, 0)) return false;
            if (toDate && t > new Date(toDate).setHours(23, 59, 59, 999)) return false;
            return true;
        });
    }, [payments, status, fromDate, toDate]);

    // All-time headline stats for the top cards.
    const stats = useMemo(() => {
        const successful = payments.filter((p) => p.status === "Successful");
        return {
            total: payments.length,
            completed: successful.length,
            pending: payments.filter((p) => p.status === "Pending").length,
            amount: successful.reduce((s, p) => s + (Number(p.amount) || 0), 0),
        };
    }, [payments]);

    // Scoped summary (This Month / All time) for the right rail.
    const summary = useMemo(() => {
        const now = new Date();
        const inScope = (p) => {
            if (summaryScope === "all") return true;
            const d = p.createdAt ? new Date(p.createdAt) : null;
            return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        };
        const list = payments.filter(inScope);
        const successful = list.filter((p) => p.status === "Successful");
        return {
            total: list.length,
            successful: successful.length,
            pending: list.filter((p) => p.status === "Pending").length,
            amount: successful.reduce((s, p) => s + (Number(p.amount) || 0), 0),
        };
    }, [payments, summaryScope]);

    // Most recent transactions for the activity card.
    const recent = useMemo(
        () => [...payments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 3),
        [payments]
    );

    const route = (p) => {
        const r = p.ride_id || p.routeSnapshot || {};
        return `${r.source || "—"} → ${r.destination || "—"}`;
    };

    const hasFilters = status !== "All" || fromDate || toDate;
    const clearFilters = () => { setStatus("All"); setFromDate(""); setToDate(""); };

    // Escrow awaiting passenger action (confirm / dispute).
    const isActionable = (p) =>
        p.status === "Successful" && ["held", "awaiting_completion"].includes(p.escrowStatus);

    const handleConfirm = async (p) => {
        setConfirmingId(p._id);
        try {
            await confirmCompletion(p._id);
            toast.success("Payment released to your driver. Thanks for confirming!");
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Couldn't release payment.");
        } finally {
            setConfirmingId(null);
        }
    };

    const Actions = ({ p }) => (
        <>
            {isActionable(p) && (
                <>
                    <button className="pay-btn sm" onClick={() => handleConfirm(p)} disabled={confirmingId === p._id}>
                        {confirmingId === p._id ? <span className="pay-spin" /> : "Confirm"}
                    </button>
                    <button className="pay-btn ghost sm" onClick={() => setDisputePayment(p)}>Report</button>
                </>
            )}
            {p.status === "Successful" && (
                <button className="pay-btn ghost sm" onClick={() => setReceiptId(p._id)}>Receipt</button>
            )}
        </>
    );

    return (
        <div className="pay-root">
            <div className="pay-topbar">
                {onOpenSidebar && (
                    <button className="pay-hamburger" onClick={onOpenSidebar} aria-label="Open menu">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                    </button>
                )}
                <span className="payh-title-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><circle cx="17" cy="14" r="1.4" /></svg>
                </span>
                <div className="pay-heading">
                    <h1 className="pay-page-title">Payment History</h1>
                    <p className="pay-subtitle">All your ride payments and receipts in one place.</p>
                </div>
            </div>

            {/* Stats */}
            <div className="payh-stats">
                <PStat accent="violet" label="Total Payments" sub="All time payments" value={loading ? "—" : stats.total}
                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>} />
                <PStat accent="green" label="Completed" sub="Successful payments" value={loading ? "—" : stats.completed}
                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="9 12 11.5 14.5 16 9.5" /></svg>} />
                <PStat accent="amber" label="Pending" sub="Awaiting completion" value={loading ? "—" : stats.pending}
                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>} />
                <PStat accent="blue" label="Total Amount" sub="Total amount paid" value={loading ? "—" : `₹${stats.amount}`}
                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>} />
            </div>

            {/* Filters */}
            <div className="pay-filters payh-filterbar">
                <div className="pay-filter">
                    <label className="pay-filter-label">Date Range</label>
                    <div className="payh-daterange">
                        <input type="date" className="pay-input" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} aria-label="From date" />
                        <span className="payh-daterange-sep">–</span>
                        <input type="date" className="pay-input" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} aria-label="To date" />
                    </div>
                </div>
                <div className="pay-filter">
                    <label className="pay-filter-label" htmlFor="pay-status">Status</label>
                    <ThemedSelect id="pay-status" theme="dark" value={status} onChange={setStatus} options={STATUS_OPTIONS} ariaLabel="Status filter" />
                </div>
                <button className="pay-btn ghost payh-clear" onClick={clearFilters} disabled={!hasFilters}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                    Clear Filters
                </button>
            </div>

            {/* Two-column layout */}
            <div className="payh-layout">
                <div className="payh-main">
                    {loading ? (
                        <div><div className="pay-skeleton" /><div className="pay-skeleton" /><div className="pay-skeleton" /></div>
                    ) : filtered.length === 0 ? (
                        <div className="payh-empty-card">
                            <span className="payh-empty-art" aria-hidden="true">🧾</span>
                            <span className="pay-empty-title">No payments yet</span>
                            <span className="pay-empty-sub">Payments for your booked rides will appear here.</span>
                            <button className="pay-btn payh-book" onClick={() => onNavigate?.("findRides")}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" /></svg>
                                Book a Ride
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Desktop table */}
                            <div className="pay-table-wrap">
                                <table className="pay-table">
                                    <thead>
                                        <tr>
                                            <th>Transaction</th>
                                            <th>Route</th>
                                            <th>Driver</th>
                                            <th>Amount</th>
                                            <th>Date</th>
                                            <th>Payment</th>
                                            <th>Escrow</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((p) => (
                                            <tr key={p._id}>
                                                <td className="pay-txid">{p.payment_id || p.order_id}</td>
                                                <td className="pay-route-cell">{route(p)}</td>
                                                <td>{p.driver_id?.name || "—"}</td>
                                                <td className="pay-amount">₹{p.amount}</td>
                                                <td>{fmtDate(p.createdAt)}</td>
                                                <td><StatusBadge status={p.status} /></td>
                                                <td>{p.status === "Successful" ? <EscrowBadge status={p.escrowStatus} /> : "—"}</td>
                                                <td><div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}><Actions p={p} /></div></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile cards */}
                            <div className="pay-cards">
                                {filtered.map((p) => (
                                    <div className="pay-card" key={p._id}>
                                        <div className="pay-card-row"><span className="k">Route</span><span className="v">{route(p)}</span></div>
                                        <div className="pay-card-row"><span className="k">Driver</span><span className="v">{p.driver_id?.name || "—"}</span></div>
                                        <div className="pay-card-row"><span className="k">Amount</span><span className="v">₹{p.amount}</span></div>
                                        <div className="pay-card-row"><span className="k">Date</span><span className="v">{fmtDate(p.createdAt)}</span></div>
                                        <div className="pay-card-row"><span className="k">Payment</span><span className="v"><StatusBadge status={p.status} /></span></div>
                                        {p.status === "Successful" && (
                                            <div className="pay-card-row"><span className="k">Escrow</span><span className="v"><EscrowBadge status={p.escrowStatus} /></span></div>
                                        )}
                                        <div className="pay-card-row"><span className="k">Txn</span><span className="v pay-txid">{p.payment_id || p.order_id}</span></div>
                                        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                                            <Actions p={p} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Feature strip */}
                    <div className="payh-features">
                        <div className="payh-feature">
                            <span className="payh-feature-icon green"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg></span>
                            <div className="payh-feature-text"><span className="payh-feature-title">Secure Payments</span><span className="payh-feature-sub">Your payments are safe and encrypted</span></div>
                        </div>
                        <div className="payh-feature">
                            <span className="payh-feature-icon blue"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg></span>
                            <div className="payh-feature-text"><span className="payh-feature-title">Digital Receipts</span><span className="payh-feature-sub">Get instant receipts for every payment</span></div>
                        </div>
                        <div className="payh-feature">
                            <span className="payh-feature-icon amber"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg></span>
                            <div className="payh-feature-text"><span className="payh-feature-title">Easy Refunds</span><span className="payh-feature-sub">Quick and hassle-free refunds</span></div>
                        </div>
                    </div>
                </div>

                {/* Right rail */}
                <aside className="payh-rail">
                    {/* Payment Summary */}
                    <section className="payh-rail-card">
                        <div className="payh-rail-head">
                            <h2 className="payh-rail-title">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
                                Payment Summary
                            </h2>
                            <div className="payh-rail-scope">
                                <ThemedSelect id="payh-scope" theme="dark" value={summaryScope} onChange={setSummaryScope} options={SCOPE_OPTIONS} ariaLabel="Summary period" />
                            </div>
                        </div>
                        <ul className="payh-summary">
                            <li className="payh-sum-row"><span>Total Payments</span><span className="payh-sum-v">{loading ? "—" : summary.total}</span></li>
                            <li className="payh-sum-row"><span>Successful Payments</span><span className="payh-sum-v">{loading ? "—" : summary.successful}</span></li>
                            <li className="payh-sum-row"><span>Pending Payments</span><span className="payh-sum-v">{loading ? "—" : summary.pending}</span></li>
                            <li className="payh-sum-row"><span>Total Amount</span><span className="payh-sum-v money">{loading ? "—" : `₹${summary.amount}`}</span></li>
                        </ul>
                        <button className="payh-rail-btn" onClick={() => setSummaryScope((s) => (s === "month" ? "all" : "month"))}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
                            View detailed summary
                            <svg className="payh-rail-btn-arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                    </section>

                    {/* Recent Activity */}
                    <section className="payh-rail-card">
                        <div className="payh-rail-head">
                            <h2 className="payh-rail-title">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
                                Recent Activity
                            </h2>
                            {recent.length > 0 ? <button className="payh-link" onClick={clearFilters}>View all</button> : null}
                        </div>
                        {recent.length === 0 ? (
                            <div className="payh-activity-empty">
                                <span className="payh-activity-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg></span>
                                <div><p className="payh-activity-title">No recent payments</p><p className="payh-activity-sub">Your recent transactions will show up here.</p></div>
                            </div>
                        ) : (
                            <ul className="payh-activity">
                                {recent.map((p) => (
                                    <li key={p._id} className="payh-activity-row">
                                        <span className="payh-activity-route" title={route(p)}>{route(p)}</span>
                                        <span className="payh-activity-meta">
                                            <span className="payh-activity-amt">₹{p.amount}</span>
                                            <StatusBadge status={p.status} />
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Need help */}
                    <section className="payh-rail-card payh-help" role="button" tabIndex={0} onClick={() => onNavigate?.("safety")} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onNavigate?.("safety")}>
                        <span className="payh-help-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></svg></span>
                        <div className="payh-help-text">
                            <span className="payh-help-title">Need help?</span>
                            <span className="payh-help-sub">If you have any questions about payments, feel free to contact support.</span>
                        </div>
                        <svg className="payh-help-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </section>
                </aside>
            </div>

            {receiptId && (
                <Suspense fallback={null}>
                    <ReceiptModal paymentId={receiptId} onClose={() => setReceiptId(null)} />
                </Suspense>
            )}
            {disputePayment && (
                <Suspense fallback={null}>
                    <DisputeModal
                        payment={disputePayment}
                        onClose={() => setDisputePayment(null)}
                        onDone={() => { setDisputePayment(null); load(); }}
                    />
                </Suspense>
            )}
        </div>
    );
};

export default PaymentHistory;
