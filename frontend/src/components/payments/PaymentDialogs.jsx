import React from "react";
import "../../styles/payments.css";

/* ---------------- shared helpers ---------------- */
export const StatusBadge = ({ status }) => {
    const cls = String(status || "").toLowerCase().replace(/\s+/g, "-");
    return <span className={`pay-badge ${cls}`}>{status}</span>;
};

// Human-friendly escrow status → label + badge class.
const ESCROW_LABELS = {
    none: { label: "—", cls: "cancelled" },
    held: { label: "Escrow Active", cls: "pending" },
    awaiting_completion: { label: "Awaiting Completion", cls: "pending" },
    released: { label: "Released", cls: "successful" },
    disputed: { label: "Disputed", cls: "failed" },
    refunded: { label: "Refunded", cls: "refunded" },
};
export const EscrowBadge = ({ status }) => {
    const e = ESCROW_LABELS[status] || ESCROW_LABELS.none;
    return <span className={`pay-badge ${e.cls}`}>{e.label}</span>;
};

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * CheckoutModal — payment summary shown BEFORE opening Razorpay. Lists the ride
 * summary + a payment breakdown (fare / platform fee / tax / total). The CTA
 * triggers the Razorpay checkout (handled by the parent).
 *
 * props: { ride, seats, breakdown, busy, onPay, onClose }
 *   breakdown: { perSeat, fare, platformFee, tax, total } (rupees)
 */
export const CheckoutModal = ({ ride, seats, breakdown, busy, onPay, onClose }) => {
    const driver = ride.user_id || {};
    const v = ride.vehicle_id || {};
    const b = breakdown || {};
    return (
        <div className="pay-overlay" role="dialog" aria-modal="true" aria-label="Payment summary">
            <div className="pay-backdrop" onClick={busy ? undefined : onClose} />
            <div className="pay-modal">
                <div className="pay-modal-head">
                    <h2 className="pay-modal-title">Payment Summary</h2>
                    <button className="pay-close" onClick={onClose} disabled={busy} aria-label="Close">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Ride summary */}
                <div className="pay-summary-block">
                    <div className="pay-summary-title">Ride</div>
                    <div className="pay-route-mini">
                        <span className="ln"><span className="pay-dot pickup" />{ride.source || "—"}</span>
                        <span className="ln"><span className="pay-dot drop" />{ride.destination || "—"}</span>
                    </div>
                    <div style={{ marginTop: "0.7rem" }}>
                        <div className="pay-sum-row"><span className="lbl">Driver</span><span className="val">{driver.name || "—"}</span></div>
                        <div className="pay-sum-row"><span className="lbl">Vehicle</span><span className="val">{v.make ? `${v.make} ${v.model}` : "—"}</span></div>
                        <div className="pay-sum-row"><span className="lbl">When</span><span className="val">{fmtDate(ride.timing)} · {fmtTime(ride.timing)}</span></div>
                        <div className="pay-sum-row"><span className="lbl">Seats</span><span className="val">{seats}</span></div>
                    </div>
                </div>

                {/* Payment breakdown */}
                <div className="pay-summary-block">
                    <div className="pay-summary-title">Payment Breakdown</div>
                    <div className="pay-sum-row"><span className="lbl">Ride fare ({seats} × ₹{b.perSeat ?? 0})</span><span className="val">₹{b.fare ?? 0}</span></div>
                    {b.platformFee > 0 && (
                        <div className="pay-sum-row"><span className="lbl">Platform fee</span><span className="val">included</span></div>
                    )}
                    <div className="pay-sum-row"><span className="lbl">Taxes</span><span className="val">₹{b.tax ?? 0}</span></div>
                    <div className="pay-sum-row total"><span className="lbl">Total payable</span><span className="val">₹{b.total ?? 0}</span></div>
                </div>

                <div className="pay-actions">
                    <button className="pay-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
                    <button className="pay-btn" onClick={onPay} disabled={busy}>
                        {busy ? <span className="pay-spin" /> : `Pay ₹${b.total ?? 0}`}
                    </button>
                </div>
                <div className="pay-secure-note">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    Secured by Razorpay · verified on our server
                </div>
            </div>
        </div>
    );
};

/**
 * PaymentSuccess — 🎉 success screen after verified payment.
 * props: { payment, ride, onViewBooking, onReceipt, onDone }
 */
export const PaymentSuccess = ({ payment, ride, onViewBooking, onReceipt, onDone }) => {
    const r = ride || payment?.ride || {};
    return (
        <div className="pay-overlay" role="dialog" aria-modal="true" aria-label="Payment successful">
            <div className="pay-backdrop" onClick={onDone} />
            <div className="pay-result">
                <div className="pay-result-badge ok">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0a0a0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <h2 className="pay-result-title">🎉 Payment Successful</h2>
                <div className="pay-result-rows">
                    <div className="pay-sum-row"><span className="lbl">Transaction ID</span><span className="val pay-txid">{payment?.payment_id || payment?.order_id || "—"}</span></div>
                    <div className="pay-sum-row"><span className="lbl">Ride</span><span className="val">{r.source} → {r.destination}</span></div>
                    <div className="pay-sum-row"><span className="lbl">Amount paid</span><span className="val">₹{payment?.amount ?? 0}</span></div>
                    <div className="pay-sum-row"><span className="lbl">Date &amp; time</span><span className="val">{fmtDate(payment?.paidAt || Date.now())} · {fmtTime(payment?.paidAt || Date.now())}</span></div>
                </div>
                <div className="pay-result-actions">
                    <button className="pay-btn ghost" onClick={onReceipt}>Download Receipt</button>
                    <button className="pay-btn ghost" onClick={onDone}>Dashboard</button>
                    <button className="pay-btn" onClick={onViewBooking}>View Booking</button>
                </div>
            </div>
        </div>
    );
};

/**
 * PaymentFailure — ❌ failure screen.
 * props: { reason, onRetry, onClose }
 */
export const PaymentFailure = ({ reason, onRetry, onClose }) => (
    <div className="pay-overlay" role="dialog" aria-modal="true" aria-label="Payment failed">
        <div className="pay-backdrop" onClick={onClose} />
        <div className="pay-result">
            <div className="pay-result-badge err">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </div>
            <h2 className="pay-result-title">❌ Payment Failed</h2>
            <div className="pay-result-rows">
                <div className="pay-sum-row"><span className="lbl">Reason</span><span className="val">{reason || "The payment could not be completed."}</span></div>
            </div>
            <div className="pay-result-actions">
                <button className="pay-btn ghost" onClick={onClose}>Back to Ride</button>
                <button className="pay-btn" onClick={onRetry}>Retry Payment</button>
            </div>
        </div>
    </div>
);
