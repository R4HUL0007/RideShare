import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
    getEarnings,
    updatePayoutDetails,
    requestWithdrawal,
    getMyWithdrawals,
} from "../services/paymentService";
import { StatusBadge, EscrowBadge } from "./payments/PaymentDialogs";
import ThemedSelect from "./ThemedSelect";
import "../styles/payments.css";

const ReceiptModal = lazy(() => import("./payments/ReceiptModal"));

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

/* ---------------- stat card (with sparkline) ---------------- */
const StatCard = ({ icon, value, label, sub, accent }) => (
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

const SORT_OPTIONS = [
    { value: "latest", label: "Latest first" },
    { value: "amount", label: "Highest amount" },
];
const SCOPE_OPTIONS = [{ value: "month", label: "This Month" }, { value: "all", label: "All time" }];

const Earnings = ({ onOpenSidebar, onNavigate }) => {
    const [summary, setSummary] = useState(null);
    const [payments, setPayments] = useState([]);
    const [payoutDetails, setPayoutDetails] = useState({ upiId: "" });
    const [withdrawals, setWithdrawals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState("latest");
    const [overviewScope, setOverviewScope] = useState("month");
    const [receiptId, setReceiptId] = useState(null);
    const [upiInput, setUpiInput] = useState("");
    const [savingUpi, setSavingUpi] = useState(false);
    const [withdrawing, setWithdrawing] = useState(false);

    const load = () => {
        setLoading(true);
        Promise.allSettled([getEarnings(), getMyWithdrawals()])
            .then(([eRes, wRes]) => {
                if (eRes.status === "fulfilled") {
                    const d = eRes.value.data;
                    setSummary(d.summary || null);
                    setPayments(Array.isArray(d.payments) ? d.payments : []);
                    setPayoutDetails(d.payoutDetails || { upiId: "" });
                    setUpiInput(d.payoutDetails?.upiId || "");
                } else {
                    setSummary(null); setPayments([]);
                }
                setWithdrawals(wRes.status === "fulfilled" && Array.isArray(wRes.value.data) ? wRes.value.data : []);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const sorted = useMemo(() => {
        const list = [...payments];
        if (sortBy === "amount") list.sort((a, b) => (b.driverEarnings || 0) - (a.driverEarnings || 0));
        else list.sort((a, b) => new Date(b.paidAt || b.createdAt) - new Date(a.paidAt || a.createdAt));
        return list;
    }, [payments, sortBy]);

    const route = (p) => {
        const r = p.ride_id || p.routeSnapshot || {};
        return `${r.source || "—"} → ${r.destination || "—"}`;
    };

    const s = summary || {};

    // Earnings Overview (rail). Available + escrow are live balances (snapshot);
    // released + total can be scoped to this month from the payments list.
    const overview = useMemo(() => {
        const sm = summary || {};
        if (overviewScope === "all") {
            return { available: sm.available || 0, escrowPending: sm.escrowPending || 0, released: sm.released || 0, total: sm.total || 0 };
        }
        const now = new Date();
        const monthPays = payments.filter((p) => {
            const d = new Date(p.paidAt || p.createdAt);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        const total = monthPays.reduce((x, p) => x + (p.driverEarnings || 0), 0);
        const released = monthPays.filter((p) => p.escrowStatus === "released").reduce((x, p) => x + (p.driverEarnings || 0), 0);
        return { available: sm.available || 0, escrowPending: sm.escrowPending || 0, released, total };
    }, [summary, payments, overviewScope]);

    const recent = useMemo(
        () => [...payments].sort((a, b) => new Date(b.paidAt || b.createdAt) - new Date(a.paidAt || a.createdAt)).slice(0, 3),
        [payments]
    );

    const saveUpi = async () => {
        setSavingUpi(true);
        try {
            const { data } = await updatePayoutDetails({ upiId: upiInput.trim() });
            setPayoutDetails(data.payoutDetails || {});
            toast.success("Payout details saved.");
        } catch (err) {
            toast.error(err.response?.data?.message || "Couldn't save payout details.");
        } finally {
            setSavingUpi(false);
        }
    };

    const withdraw = async () => {
        setWithdrawing(true);
        try {
            await requestWithdrawal();
            toast.success("Withdrawal requested. Pending approval.");
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Couldn't request withdrawal.");
        } finally {
            setWithdrawing(false);
        }
    };

    const canWithdraw = (s.available || 0) > 0 && Boolean(payoutDetails.upiId);

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
                    <h1 className="pay-page-title">Earnings</h1>
                    <p className="pay-subtitle">Escrow-protected earnings from your rides</p>
                </div>
            </div>

            {/* Balance buckets */}
            <div className="payh-stats">
                <StatCard accent="violet" label="Available Balance" sub="Ready to withdraw" value={loading ? "—" : `₹${s.available ?? 0}`}
                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M16 12h.01M2 10h20" /></svg>} />
                <StatCard accent="amber" label="Escrow Pending" sub="Held in secure escrow" value={loading ? "—" : `₹${s.escrowPending ?? 0}`}
                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>} />
                <StatCard accent="green" label="Released Earnings" sub="Successfully released" value={loading ? "—" : `₹${s.released ?? 0}`}
                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="9 12 11.5 14.5 16 9.5" /></svg>} />
                <StatCard accent="blue" label="Total Earnings" sub="All time earnings" value={loading ? "—" : `₹${s.total ?? 0}`}
                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>} />
                {(s.disputed || 0) > 0 && (
                    <StatCard accent="amber" label="In Dispute" sub="Frozen pending review" value={`₹${s.disputed}`}
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>} />
                )}
            </div>

            {/* Two-column layout */}
            <div className="payh-layout">
                <div className="payh-main">
                    {/* Payout details + withdrawal */}
                    <div className="pay-summary-block" style={{ margin: 0 }}>
                        <div className="pay-summary-title">Payout Details</div>
                        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                            <div className="pay-filter grow" style={{ minWidth: "14rem" }}>
                                <label className="pay-filter-label" htmlFor="pay-upi">UPI ID</label>
                                <input
                                    id="pay-upi" className="pay-input" style={{ width: "100%" }}
                                    placeholder="name@bank" value={upiInput}
                                    onChange={(e) => setUpiInput(e.target.value)}
                                />
                            </div>
                            <button className="pay-btn ghost" onClick={saveUpi} disabled={savingUpi}>
                                {savingUpi ? <span className="pay-spin light" /> : "Save"}
                            </button>
                            <button className="pay-btn" onClick={withdraw} disabled={!canWithdraw || withdrawing} title={!payoutDetails.upiId ? "Add a UPI ID first" : (s.available || 0) <= 0 ? "No funds available yet" : ""}>
                                {withdrawing ? <span className="pay-spin" /> : `Withdraw ₹${s.available ?? 0}`}
                            </button>
                        </div>
                        <div className="pay-secure-note" style={{ justifyContent: "flex-start" }}>
                            Bank transfer support is coming soon — UPI works for now.
                        </div>
                    </div>

                    {/* Pending withdrawals */}
                    {withdrawals.length > 0 && (
                        <div className="pay-summary-block" style={{ margin: 0 }}>
                            <div className="pay-summary-title">Withdrawals</div>
                            {withdrawals.map((w) => (
                                <div className="pay-sum-row" key={w._id}>
                                    <span className="lbl">{fmtDate(w.createdAt)} · {w.upiId}</span>
                                    <span className="val">₹{w.amount} <StatusBadge status={w.status} /></span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Sort */}
                    <div className="pay-filters" style={{ margin: 0 }}>
                        <div className="pay-filter">
                            <label className="pay-filter-label" htmlFor="earn-sort">Sort</label>
                            <ThemedSelect id="earn-sort" theme="dark" value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} ariaLabel="Sort earnings" />
                        </div>
                    </div>

                    {loading ? (
                        <div><div className="pay-skeleton" /><div className="pay-skeleton" /><div className="pay-skeleton" /></div>
                    ) : sorted.length === 0 ? (
                        <div className="payh-empty-card">
                            <span className="payh-empty-art" aria-hidden="true">💰</span>
                            <span className="pay-empty-title">No earnings yet</span>
                            <span className="pay-empty-sub">When passengers pay for your rides, your escrow-held earnings will show up here.</span>
                            <button className="pay-btn payh-book" onClick={() => onNavigate?.("createRide")}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" /></svg>
                                Offer a Ride
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="pay-table-wrap">
                                <table className="pay-table">
                                    <thead>
                                        <tr>
                                            <th>Route</th>
                                            <th>Passenger</th>
                                            <th>Seats</th>
                                            <th>Earned</th>
                                            <th>Date</th>
                                            <th>Escrow</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sorted.map((p) => (
                                            <tr key={p._id}>
                                                <td className="pay-route-cell">{route(p)}</td>
                                                <td>{p.user_id?.name || "—"}</td>
                                                <td>{p.seats}</td>
                                                <td className="pay-amount">₹{p.driverEarnings ?? 0}</td>
                                                <td>{fmtDate(p.paidAt || p.createdAt)}</td>
                                                <td><EscrowBadge status={p.escrowStatus} /></td>
                                                <td><button className="pay-btn ghost sm" onClick={() => setReceiptId(p._id)}>Receipt</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="pay-cards">
                                {sorted.map((p) => (
                                    <div className="pay-card" key={p._id}>
                                        <div className="pay-card-row"><span className="k">Route</span><span className="v">{route(p)}</span></div>
                                        <div className="pay-card-row"><span className="k">Passenger</span><span className="v">{p.user_id?.name || "—"}</span></div>
                                        <div className="pay-card-row"><span className="k">Seats</span><span className="v">{p.seats}</span></div>
                                        <div className="pay-card-row"><span className="k">Earned</span><span className="v">₹{p.driverEarnings ?? 0}</span></div>
                                        <div className="pay-card-row"><span className="k">Escrow</span><span className="v"><EscrowBadge status={p.escrowStatus} /></span></div>
                                        <div className="pay-card-row"><span className="k">Date</span><span className="v">{fmtDate(p.paidAt || p.createdAt)}</span></div>
                                        <div style={{ marginTop: "0.5rem" }}>
                                            <button className="pay-btn ghost sm" onClick={() => setReceiptId(p._id)}>View Receipt</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Right rail */}
                <aside className="payh-rail">
                    {/* Earnings Overview */}
                    <section className="payh-rail-card">
                        <div className="payh-rail-head">
                            <h2 className="payh-rail-title">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></svg>
                                Earnings Overview
                            </h2>
                            <div className="payh-rail-scope">
                                <ThemedSelect id="earn-scope" theme="dark" value={overviewScope} onChange={setOverviewScope} options={SCOPE_OPTIONS} ariaLabel="Overview period" />
                            </div>
                        </div>
                        <ul className="payh-summary">
                            <li className="payh-sum-row"><span>Available Balance</span><span className="payh-sum-v money">{loading ? "—" : `₹${overview.available}`}</span></li>
                            <li className="payh-sum-row"><span>Escrow Pending</span><span className="payh-sum-v money">{loading ? "—" : `₹${overview.escrowPending}`}</span></li>
                            <li className="payh-sum-row"><span>Released Earnings</span><span className="payh-sum-v money">{loading ? "—" : `₹${overview.released}`}</span></li>
                            <li className="payh-sum-row"><span>Total Earnings</span><span className="payh-sum-v money">{loading ? "—" : `₹${overview.total}`}</span></li>
                        </ul>
                    </section>

                    {/* Recent Earnings */}
                    <section className="payh-rail-card">
                        <div className="payh-rail-head">
                            <h2 className="payh-rail-title">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
                                Recent Earnings
                            </h2>
                            {recent.length > 0 ? <button className="payh-link" onClick={() => setSortBy("latest")}>View all</button> : null}
                        </div>
                        {recent.length === 0 ? (
                            <div className="payh-activity-empty">
                                <span className="payh-activity-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg></span>
                                <div><p className="payh-activity-title">No recent earnings</p><p className="payh-activity-sub">Your recent earnings from rides will appear here.</p></div>
                            </div>
                        ) : (
                            <ul className="payh-activity">
                                {recent.map((p) => (
                                    <li key={p._id} className="payh-activity-row">
                                        <span className="payh-activity-route" title={route(p)}>{route(p)}</span>
                                        <span className="payh-activity-meta">
                                            <span className="payh-activity-amt">₹{p.driverEarnings ?? 0}</span>
                                            <EscrowBadge status={p.escrowStatus} />
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Earnings Tips */}
                    <section className="payh-rail-card">
                        <h2 className="payh-rail-title" style={{ marginBottom: "0.8rem" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-0.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" /></svg>
                            Earnings Tips
                        </h2>
                        <ul className="earn-tips">
                            {[
                                ["#6ee7b7", "Your earnings are 100% secure with escrow", "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
                                ["#93c5fd", "Earnings are released after a successful ride", "M12 7v5l3 3 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"],
                                ["#fcd34d", "Withdraw anytime to your UPI account", "M2 5h20v14H2zM2 10h20"],
                            ].map(([color, text, path], i) => (
                                <li key={i} className="earn-tip">
                                    <span className="earn-tip-icon" style={{ color }}>
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
                                    </span>
                                    <span className="earn-tip-text">{text}</span>
                                    <svg className="earn-tip-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                                </li>
                            ))}
                        </ul>
                    </section>
                </aside>
            </div>

            {receiptId && (
                <Suspense fallback={null}>
                    <ReceiptModal paymentId={receiptId} onClose={() => setReceiptId(null)} />
                </Suspense>
            )}
        </div>
    );
};

export default Earnings;
