import React, { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { sendPhoneOtp as sendPhoneOtpApi, verifyPhone as verifyPhoneApi } from "../services/profileService";
import "../styles/otp.css";

/**
 * Standalone phone-verification step (SMS OTP via the backend).
 *
 * Used at signup (second OTP after email) and anywhere a mandatory phone
 * verification is needed. Requires the user to be authenticated (the backend
 * reads their phone number + provider from the session). Calls `onVerified`
 * once the phone is confirmed.
 */
const PhoneVerifyStep = ({ phoneNumber, onVerified }) => {
    const [step, setStep] = useState("sending"); // sending → otp → verifying
    const [otp, setOtp] = useState("");
    const [resendIn, setResendIn] = useState(0);
    const timerRef = useRef(null);
    const sentRef = useRef(false);

    const startCountdown = (secs = 30) => {
        clearInterval(timerRef.current);
        setResendIn(secs);
        timerRef.current = setInterval(() => {
            setResendIn((s) => {
                if (s <= 1) { clearInterval(timerRef.current); return 0; }
                return s - 1;
            });
        }, 1000);
    };

    const send = async () => {
        setStep("sending");
        try {
            await sendPhoneOtpApi();
            startCountdown(30);
            setStep("otp");
            toast.success("Verification code sent via SMS.");
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || "Couldn't send the code. Please try again.");
            setStep("otp");
            return false;
        }
    };

    // Send once on mount.
    useEffect(() => {
        if (sentRef.current) return;
        sentRef.current = true;
        send();
        return () => clearInterval(timerRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const confirm = async () => {
        if (!/^\d{4,8}$/.test(otp)) return toast.error("Enter the code from the SMS.");
        setStep("verifying");
        try {
            await verifyPhoneApi(otp);
            toast.success("Phone number verified!");
            clearInterval(timerRef.current);
            if (onVerified) onVerified();
        } catch (error) {
            toast.error(error.response?.data?.message || "Verification failed. Please try again.");
            setStep("otp");
        }
    };

    const resend = async () => {
        if (resendIn > 0 || step === "verifying") return;
        setOtp("");
        await send();
    };

    return (
        <div className="pv-step">
            <div className="pv-card">
                <div className="pv-icon" aria-hidden="true">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                </div>
                <h2 className="pv-title">Verify your phone</h2>
                <p className="pv-subtitle">
                    {step === "sending"
                        ? "Sending a verification code via SMS…"
                        : <>Enter the 6-digit code sent via SMS{phoneNumber ? <> to <strong>+91 {phoneNumber}</strong></> : ""}.</>}
                </p>

                <input
                    className="pv-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Enter code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    disabled={step === "sending" || step === "verifying"}
                    autoFocus
                />

                <button
                    className="pv-btn"
                    onClick={confirm}
                    disabled={step !== "otp" || otp.length !== 6}
                >
                    {step === "verifying" ? "Verifying…" : "Verify Phone"}
                </button>

                <button
                    className="pv-resend"
                    onClick={resend}
                    disabled={resendIn > 0 || step === "sending" || step === "verifying"}
                >
                    {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
                </button>
            </div>
        </div>
    );
};

export default PhoneVerifyStep;
