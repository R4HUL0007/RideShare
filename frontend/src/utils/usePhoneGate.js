import { useEffect, useState } from "react";
import axiosInstance from "./axiosConfig";
import { API_BASE_URL } from "./constants";
import { getPublicConfig } from "../services/authService";

// Shared phone-verification gate. Fetches the public runtime config (is phone
// verification enforced?) plus the current user's phone status, and returns a
// single `blocked` flag used to DISABLE ride-action buttons (Book / Confirm /
// Request) and show a helpful message. Mirrors the backend gate so the UI and
// the API agree on who may act.
//
//   { required, verified, blocked, loading }
//   blocked === (required && !verified)  once loading is done.
//
// While loading, `blocked` is false so we never flash a disabled button for a
// verified user; the backend gate remains the authoritative guard regardless.
export default function usePhoneGate() {
    const [state, setState] = useState({ required: false, verified: false, loading: true });

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
                if (active) setState({ required, verified, loading: false });
            } catch {
                if (active) setState({ required: false, verified: false, loading: false });
            }
        })();
        return () => { active = false; };
    }, []);

    return {
        ...state,
        blocked: !state.loading && state.required && !state.verified,
    };
}
