import React, { useState } from "react";
import { toast } from "react-toastify";
import { triggerSos } from "../../services/safetyService";
import "../../styles/safety.css";

/**
 * SosButton — a highly visible emergency trigger. Shown during active rides /
 * live tracking. Two-step: confirm → trigger. Captures location + ride context
 * and alerts emergency contacts + the admin team.
 *
 * Props:
 *   rideId   (optional) the active ride to attach context to
 *   compact  (optional) render a smaller inline variant
 */
const SosButton = ({ rideId = null, compact = false }) => {
    const [confirming, setConfirming] = useState(false);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);

    const fire = async () => {
        setSending(true);
        // Capture current location (best-effort; SOS proceeds even if denied).
        const getLocation = () => new Promise((resolve) => {
            if (!navigator.geolocation) return resolve(null);
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => resolve(null),
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
            );
        });
        try {
            const loc = await getLocation();
            const { data } = await triggerSos({ rideId, lat: loc?.lat, lng: loc?.lng });
            setResult(data.sos);
            toast.success("🚨 Emergency alert sent to your contacts and the safety team.");
            setConfirming(false);
        } catch (err) {
            toast.error(err.response?.data?.message || "Couldn't send SOS. Please call emergency services directly.");
        } finally {
            setSending(false);
        }
    };

    return (
        <>
            <button
                type="button"
                className={`sos-btn${compact ? " compact" : ""}`}
                onClick={() => setConfirming(true)}
                aria-label="Emergency SOS"
            >
                <span className="sos-pulse" aria-hidden="true" />
                🚨 {compact ? "SOS" : "Emergency"}
            </button>

            {confirming && (
                <div className="sos-overlay" onMouseDown={(e) => e.target === e.currentTarget && !sending && setConfirming(false)}>
                    <div className="sos-modal" role="dialog" aria-modal="true">
                        {!result ? (
                            <>
                                <div className="sos-modal-icon">🚨</div>
                                <h3 className="sos-modal-title">Trigger an emergency alert?</h3>
                                <p className="sos-modal-text">
                                    We'll immediately share your current location, ride details and a live tracking
                                    link with your emergency contacts and the RidexShare safety team.
                                </p>
                                <div className="sos-modal-actions">
                                    <button className="sos-cancel" onClick={() => setConfirming(false)} disabled={sending}>Cancel</button>
                                    <button className="sos-confirm" onClick={fire} disabled={sending}>
                                        {sending ? "Sending…" : "Trigger SOS"}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="sos-modal-icon">✅</div>
                                <h3 className="sos-modal-title">Alert sent</h3>
                                <p className="sos-modal-text">
                                    {result.notifiedCount > 0
                                        ? `${result.notifiedCount} emergency contact${result.notifiedCount > 1 ? "s" : ""} and the safety team have been notified.`
                                        : "The safety team has been notified. Add emergency contacts so they're alerted too."}
                                </p>
                                {result.trackingLink && (
                                    <button className="sos-copy" onClick={() => { navigator.clipboard?.writeText(result.trackingLink); toast.success("Tracking link copied"); }}>
                                        Copy tracking link
                                    </button>
                                )}
                                <div className="sos-modal-actions">
                                    <button className="sos-cancel" onClick={() => { setConfirming(false); setResult(null); }}>Close</button>
                                    <a className="sos-call" href="tel:112">Call 112</a>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default SosButton;
