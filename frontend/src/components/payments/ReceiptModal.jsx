import React, { useEffect, useState } from "react";
import { getReceipt } from "../../services/paymentService";
import { StatusBadge } from "./PaymentDialogs";
import "../../styles/payments.css";

const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * ReceiptModal — fetches and renders a printable receipt for a payment. The
 * "Download PDF" action uses the browser's print-to-PDF (the @media print rule
 * in payments.css isolates the receipt).
 *
 * props: { paymentId, preload?, onClose }
 *   preload: an already-loaded payment object (skips the fetch)
 */
const ReceiptModal = ({ paymentId, preload, onClose }) => {
    const [payment, setPayment] = useState(preload || null);
    const [loading, setLoading] = useState(!preload);

    useEffect(() => {
        if (preload) return;
        let active = true;
        setLoading(true);
        getReceipt(paymentId)
            .then(({ data }) => { if (active) setPayment(data); })
            .catch(() => { if (active) setPayment(null); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [paymentId, preload]);

    const payer = payment?.user_id || {};
    const driver = payment?.driver_id || {};
    const ride = payment?.ride_id || payment?.routeSnapshot || {};
    const bd = payment?.amountBreakdown || {};

    return (
        <div className="pay-overlay" role="dialog" aria-modal="true" aria-label="Receipt">
            <div className="pay-backdrop" onClick={onClose} />
            <div className="pay-modal" style={{ maxWidth: "32rem" }}>
                <div className="pay-modal-head">
                    <h2 className="pay-modal-title">Receipt</h2>
                    <button className="pay-close" onClick={onClose} aria-label="Close">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                </div>

                {loading ? (
                    <div className="pay-loading"><span className="pay-spin light" /></div>
                ) : !payment ? (
                    <div className="pay-empty"><span className="pay-empty-title">Receipt unavailable</span></div>
                ) : (
                    <>
                        <div className="pay-receipt">
                            <div className="pay-receipt-head">
                                <div>
                                    <div className="pay-receipt-brand">RidexShare</div>
                                    <div style={{ fontSize: "0.74rem", color: "#9ca3af" }}>Payment Receipt</div>
                                </div>
                                <div style={{ textAlign: "right", fontSize: "0.74rem", color: "#9ca3af" }}>
                                    <div>{fmtDateTime(payment.paidAt || payment.createdAt)}</div>
                                    <div style={{ marginTop: "0.3rem" }}><StatusBadge status={payment.status} /></div>
                                </div>
                            </div>

                            <div className="pay-receipt-sec">
                                <h4>Ride</h4>
                                <div className="pay-receipt-row"><span className="k">From</span><span>{ride.source || "—"}</span></div>
                                <div className="pay-receipt-row"><span className="k">To</span><span>{ride.destination || "—"}</span></div>
                                <div className="pay-receipt-row"><span className="k">When</span><span>{fmtDateTime(ride.timing)}</span></div>
                                <div className="pay-receipt-row"><span className="k">Seats</span><span>{payment.seats}</span></div>
                            </div>

                            <div className="pay-receipt-sec">
                                <h4>Passenger &amp; Driver</h4>
                                <div className="pay-receipt-row"><span className="k">Passenger</span><span>{payer.name || "—"}</span></div>
                                <div className="pay-receipt-row"><span className="k">Driver</span><span>{driver.name || "—"}</span></div>
                            </div>

                            <div className="pay-receipt-sec">
                                <h4>Transaction</h4>
                                <div className="pay-receipt-row"><span className="k">Order ID</span><span>{payment.order_id}</span></div>
                                <div className="pay-receipt-row"><span className="k">Payment ID</span><span>{payment.payment_id || "—"}</span></div>
                                <div className="pay-receipt-row"><span className="k">Ride fare</span><span>₹{bd.fare ?? payment.amount}</span></div>
                                {bd.tax > 0 && <div className="pay-receipt-row"><span className="k">Taxes</span><span>₹{bd.tax}</span></div>}
                                <div className="pay-receipt-row pay-receipt-total"><span>Total Paid</span><span>₹{payment.amount}</span></div>
                            </div>
                        </div>

                        <div className="pay-actions">
                            <button className="pay-btn ghost" onClick={onClose}>Close</button>
                            <button className="pay-btn" onClick={() => window.print()}>Download PDF</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ReceiptModal;
