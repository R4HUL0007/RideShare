import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { isStandalone, notificationPermission, pushSupported, enablePush, canInstall, promptInstall } from "../../utils/pwa";
import axiosInstance from "../../utils/axiosConfig";
import "../../styles/pwa.css";

const APP_VERSION = "1.0.0";

/**
 * PwaStatus — shows install state, notification permission, offline capability
 * and version. Lets the user enable notifications or install the app. Drop this
 * into Profile/settings.
 */
const PwaStatus = () => {
    const [installed, setInstalled] = useState(isStandalone());
    const [perm, setPerm] = useState(notificationPermission());
    const [online, setOnline] = useState(navigator.onLine);
    const [installable, setInstallable] = useState(canInstall());
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        const t = setInterval(() => { setInstallable(canInstall()); setInstalled(isStandalone()); }, 1500);
        return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(t); };
    }, []);

    const enableNotifications = async () => {
        setBusy(true);
        try {
            const res = await enablePush(axiosInstance);
            setPerm(notificationPermission());
            if (res.ok) toast.success("Notifications enabled");
            else if (res.reason === "denied") toast.info("Notifications are blocked in your browser settings.");
            else toast.info("Notifications aren't available here.");
        } finally { setBusy(false); }
    };

    const install = async () => {
        const res = await promptInstall();
        if (res?.outcome === "accepted") setInstalled(true);
    };

    const pill = (cond, on = "On", off = "Off") => (
        <span className={`pwa-pill ${cond ? "on" : "off"}`}>{cond ? on : off}</span>
    );

    return (
        <div className="pwa-status">
            <div className="pwa-status-title">📱 App Status</div>
            <div className="pwa-status-row"><span className="k">Installed</span>{pill(installed, "Installed", "Browser")}</div>
            <div className="pwa-status-row">
                <span className="k">Notifications</span>
                <span className={`pwa-pill ${perm === "granted" ? "on" : perm === "denied" ? "off" : "warn"}`}>
                    {perm === "granted" ? "Enabled" : perm === "denied" ? "Blocked" : "Not set"}
                </span>
            </div>
            <div className="pwa-status-row"><span className="k">Connection</span>{pill(online, "Online", "Offline")}</div>
            <div className="pwa-status-row"><span className="k">Offline cache</span>{pill("serviceWorker" in navigator, "Active", "Off")}</div>
            <div className="pwa-status-row"><span className="k">Version</span><span>{APP_VERSION}</span></div>

            {perm !== "granted" && pushSupported() && (
                <button className="pwa-status-btn" onClick={enableNotifications} disabled={busy}>
                    {busy ? "Enabling…" : "Enable Notifications"}
                </button>
            )}
            {!installed && installable && (
                <button className="pwa-status-btn" style={{ marginTop: "0.6rem" }} onClick={install}>
                    Install RidexShare
                </button>
            )}
        </div>
    );
};

export default PwaStatus;
