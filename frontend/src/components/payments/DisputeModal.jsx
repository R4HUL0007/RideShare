import React, { useState } from "react";
import { toast } from "react-toastify";
import { raiseDispute } from "../../services/paymentService";
import ThemedSelect from "../ThemedSelect";
import "../../styles/payments.css";

const REASONS = [
    { value: "ride_not_taken", label: "I didn't take this ride" },
    { value: "driver_no_show", label: "Driver never showed up" },
    { value: "wrong_route", label: "Wrong route / dropped elsewhere" },
    { value: "safety_concern", label: "Safety concern" },
    { value: "overcharged", label: "Overcharged" },
    { value: "other", label: "Other" },
];

/**
 * DisputeModal — passenger files a dispute against a payment. Freezes escrow on
 * the backend. props: { payment, onClose, onDone }
 */
const DisputeModal = ({ payment, onClose, onDone }) => {
    const [reason, setReason] = useState("");
    const [description, setDescription] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (!reason) { toast.error("Please pick a reason."); return; }
        setBusy(true);
        try {
            await raiseDispute(payment._id, { reason, description: description.trim() });
            toast.success("Dispute submitted. The payment is frozen pending review.");
            onDone?.();
        } catch (err) {
            toast.error(err.response?.data?.message || "Couldn't submit dispute.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="pay-overlay" role="dialog" aria-modal="true" aria-label="Raise a dispute">
            <div className="pay-backdrop" onClick={busy ? undefined : onClose} />
            <div className="pay-modal">
                <div className="pay-modal-head">
                    <h2 className="pay-modal-title">Report an Issue</h2>
                    <button className="pay-close" onClick={onClose} disabled={busy} aria-label="Close">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="pay-summary-block">
                    <div className="pay-summary-title">Ride</div>
                    <div className="pay-route-mini">
                        <span className="ln"><span className="pay-dot pickup" />{payment.routeSnapshot?.source || payment.ride_id?.source || "—"}</span>
                        <span className="ln"><span className="pay-dot drop" />{payment.routeSnapshot?.destination || payment.ride_id?.destination || "—"}</span>
                    </div>
                </div>

                <div className="pay-filter" style={{ marginBottom: "0.9rem" }}>
                    <label className="pay-filter-label">Reason</label>
                    <ThemedSelect theme="dark" value={reason} onChange={setReason} options={REASONS} placeholder="Select a reason" ariaLabel="Dispute reason" />
                </div>

                <div className="pay-filter grow" style={{ marginBottom: "0.4rem" }}>
                    <label className="pay-filter-label">Description (optional)</label>
                    <textarea
                        className="pay-input" style={{ minHeight: "4.5rem", resize: "vertical", width: "100%" }}
                        placeholder="Tell us what happened…" maxLength={1000}
                        value={description} onChange={(e) => setDescription(e.target.value)}
                    />
                </div>

                <div className="pay-actions">
                    <button className="pay-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
                    <button className="pay-btn" onClick={submit} disabled={busy || !reason}>
                        {busy ? <span className="pay-spin" /> : "Submit Dispute"}
                    </button>
                </div>
                <div className="pay-secure-note">
                    Filing freezes the payout until reviewed. False disputes affect your account standing.
                </div>
            </div>
        </div>
    );
};

export default DisputeModal;
