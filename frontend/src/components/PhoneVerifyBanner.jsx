import { useEffect, useState } from "react";
import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";
import { getPublicConfig } from "../services/authService";
import "../styles/phoneVerifyBanner.css";

// Compact inline banner shown ONLY on the ride-action pages (create / find /
// request) when phone verification is enforced and the current user hasn't
// verified their phone yet. Mirrors the driver-verification banner style.
// `action` customises the sentence (e.g. "book a ride"). `onNavigate` routes
// the user to their Profile to verify.
const PhoneVerifyBanner = ({ action = "continue", onNavigate, className = "" }) => {
    const [show, setShow] = useState(false);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const [cfg, me] = await Promise.all([
                    getPublicConfig().catch(() => ({ data: {} })),
                    axiosInstance.get(`${API_BASE_URL}/auth/me`).catch(() => ({ data: {} })),
                ]);
                const required = Boolean(cfg?.data?.requirePhoneVerification);
                const verified = Boolean(me?.data?.phoneVerified);
                if (active) setShow(required && !verified);
            } catch { /* stay hidden on error — never block the page */ }
        })();
        return () => { active = false; };
    }, []);

    if (!show) return null;

    return (
        <div className={`pvb-banner ${className}`.trim()}>
            <div className="pvb-main">
                <span className="pvb-icon" aria-hidden="true">📱</span>
                <div>
                    <h3 className="pvb-title">Phone verification required</h3>
                    <p className="pvb-text">Verify your phone number to {action}. It only takes a minute.</p>
                </div>
            </div>
            <button
                type="button"
                className="pvb-btn"
                onClick={() => (onNavigate ? onNavigate("profile") : null)}
            >
                Verify Phone
            </button>
        </div>
    );
};

export default PhoneVerifyBanner;
