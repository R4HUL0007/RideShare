import React, { useEffect, useState } from "react";
import { canInstall, onInstallAvailability, promptInstall, isStandalone } from "../../utils/pwa";
import "../../styles/pwa.css";

const DISMISS_KEY = "rs_pwa_install_dismissed";

/**
 * InstallPrompt — a non-intrusive bottom banner offering "Install RidexShare".
 * Appears only when the browser fires beforeinstallprompt (Android/desktop
 * Chrome/Edge), the app isn't already installed, and the user hasn't dismissed
 * it recently. Preserves the dark premium theme.
 */
const InstallPrompt = () => {
    const [available, setAvailable] = useState(canInstall());
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        // Respect a recent dismissal (7 days).
        try {
            const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
            if (ts && Date.now() - ts < 7 * 24 * 60 * 60 * 1000) setDismissed(true);
        } catch { /* ignore */ }
        return onInstallAvailability(setAvailable);
    }, []);

    if (isStandalone() || dismissed || !available) return null;

    const install = async () => {
        const res = await promptInstall();
        if (res?.outcome !== "accepted") dismiss();
    };
    const dismiss = () => {
        setDismissed(true);
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    };

    return (
        <div className="pwa-install" role="dialog" aria-label="Install RidexShare">
            <div className="pwa-install-icon">📱</div>
            <div className="pwa-install-text">
                <strong>Install RidexShare</strong>
                <span>Get faster access and an app-like experience.</span>
            </div>
            <div className="pwa-install-actions">
                <button className="pwa-install-dismiss" onClick={dismiss}>Not now</button>
                <button className="pwa-install-btn" onClick={install}>Install</button>
            </div>
        </div>
    );
};

export default InstallPrompt;
