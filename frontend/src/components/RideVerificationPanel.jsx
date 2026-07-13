import React, { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "react-toastify";
import { getVerification, checkIn, verifyCode, reportNoShow } from "../services/checkinService";
import "../styles/verifyride.css";

/**
 * RideVerificationPanel — boarding verification UI embedded in the live
 * tracking screen.
 *   Passenger: shows their 4-digit code + QR, and a "Check In" button once the
 *              driver has arrived.
 *   Driver:    shows the passenger roster + a code-entry field to verify
 *              boarding. Surfaces no-show reporting.
 *
 * Props: rideId, trackingState, isDriver, onVerifiedChange(count)
 */
const RideVerificationPanel = ({ rideId, trackingState, isDriver, onVerifiedChange }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);

    // Keep the latest onVerifiedChange in a ref so `load` doesn't depend on it.
    // Depending on the inline callback caused an unbounded re-fetch loop: the
    // parent recreated the callback every render → `load` identity changed →
    // effect re-ran → fetched → called back → re-render → … (pegged the CPU
    // during an active ride). The ref breaks that cycle.
    const onVerifiedChangeRef = useRef(onVerifiedChange);
    useEffect(() => { onVerifiedChangeRef.current = onVerifiedChange; }, [onVerifiedChange]);

    const load = useCallback(async () => {
        try {
            const { data } = await getVerification(rideId);
            setData(data);
            if (data.role === "driver") onVerifiedChangeRef.current?.(data.verifiedCount || 0, (data.passengers || []).length);
        } catch {
            /* not a participant / error — panel stays hidden */
        } finally { setLoading(false); }
    }, [rideId]);

    // Load on mount + whenever the ride id or tracking state changes (e.g. the
    // driver arrives). Single effect — `load` is stable now.
    useEffect(() => { load(); }, [load, trackingState]);

    const doCheckIn = async () => {
        setBusy(true);
        try {
            const { data } = await checkIn(rideId);
            toast.success("Checked in! Show your code to the driver.");
            setData((d) => ({ ...d, checkedIn: true, code: data.code }));
        } catch (e) {
            toast.error(e.response?.data?.message || "Couldn't check in");
        } finally { setBusy(false); }
    };

    const doVerify = async (e) => {
        e?.preventDefault();
        const otpLen = data?.otpLength || 6;
        if (!new RegExp(`^\\d{${otpLen}}$`).test(code)) { toast.error(`Enter the passenger's ${otpLen}-digit code.`); return; }
        setBusy(true);
        try {
            const { data } = await verifyCode(rideId, code);
            toast.success(data.message || "Boarding verified");
            setCode("");
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || "Verification failed");
        } finally { setBusy(false); }
    };

    const doNoShow = async (passengerId) => {
        try {
            await reportNoShow(rideId, passengerId ? { passengerId } : {});
            toast.info("No-show reported and stored for review.");
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || "Couldn't report");
        }
    };

    if (loading || !data) return null;
    const completed = trackingState === "completed";
    const started = trackingState === "in_progress";

    // ---------- Passenger view ----------
    if (data.role === "passenger") {
        if (completed) return null;
        return (
            <div className="vr-panel">
                <div className="vr-head">
                    <span className="vr-title">🎫 Boarding verification</span>
                    {data.boardingVerified
                        ? <span className="vr-pill ok">Verified ✅</span>
                        : data.checkedIn ? <span className="vr-pill warn">Checked in</span>
                            : <span className="vr-pill">Not checked in</span>}
                </div>

                {!started && !data.boardingVerified && (
                    <>
                        <p className="vr-hint">Share this code with your driver before boarding.</p>
                        <div className="vr-code" aria-label={`Boarding code ${data.code}`}>
                            {String(data.code || "").split("").map((ch, i) => (
                                <span key={i} className="vr-code-cell">{ch}</span>
                            ))}
                        </div>
                        {!data.checkedIn && (
                            <button className="vr-btn" onClick={doCheckIn} disabled={busy}>
                                {busy ? "Checking in…" : "✅ Check In"}
                            </button>
                        )}
                        <button className="vr-btn ghost" onClick={() => doNoShow()}>Driver didn't arrive?</button>
                    </>
                )}

                {data.boardingVerified && !started && (
                    <p className="vr-ok-msg">✅ You're verified. Enjoy your ride!</p>
                )}
                {started && (
                    <p className="vr-ok-msg">🚗 Ride in progress. You'll confirm drop-off when it ends.</p>
                )}
            </div>
        );
    }

    // ---------- Driver view ----------
    const pax = data.passengers || [];
    const otpLen = data.otpLength || 6;
    return (
        <div className="vr-panel">
            <div className="vr-head">
                <span className="vr-title">🎫 Verify boarding</span>
                <span className="vr-pill ok">{data.verifiedCount}/{pax.length} verified</span>
            </div>

            {!started && !completed && (
                <form className="vr-verify-form" onSubmit={doVerify}>
                    <input
                        className="vr-input"
                        inputMode="numeric"
                        maxLength={otpLen}
                        placeholder={`Enter passenger's ${otpLen}-digit code`}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, otpLen))}
                    />
                    <button className="vr-btn" type="submit" disabled={busy || code.length !== otpLen}>Verify</button>
                </form>
            )}

            <div className="vr-roster">
                {pax.map((p) => (
                    <div key={p.user_id} className="vr-roster-row">
                        <span className="vr-roster-name">{p.name}{p.seats > 1 ? ` · ${p.seats} seats` : ""}</span>
                        {p.boardingVerified
                            ? <span className="vr-pill ok">Verified ✅</span>
                            : p.noShow ? <span className="vr-pill bad">No-show</span>
                                : p.checkedIn
                                    ? <span className="vr-pill warn">Checked in</span>
                                    : <span className="vr-pill">Waiting</span>}
                        {!p.boardingVerified && !p.noShow && !started && !completed && (
                            <button className="vr-mini" onClick={() => doNoShow(p.user_id)} title="Report no-show">No-show</button>
                        )}
                    </div>
                ))}
            </div>

            {!started && !completed && data.verifiedCount === 0 && pax.length > 0 && (
                <p className="vr-hint warn">Verify at least one passenger's code to start the ride.</p>
            )}
        </div>
    );
};

export default RideVerificationPanel;
