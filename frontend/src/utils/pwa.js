// =======================================================
// PWA utilities — service worker registration, install prompt,
// push subscription, and status helpers. Framework-agnostic.
// =======================================================

import { API_BASE_URL } from "./constants";

let deferredPrompt = null;
const installListeners = new Set();

// VAPID public key for Web Push (optional). When unset, push subscribe is a
// graceful no-op and the app relies on existing socket notifications.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

/**
 * Register the service worker (production + dev). Notifies callers when an
 * updated SW is waiting so they can prompt a refresh.
 */
export function registerServiceWorker({ onUpdate } = {}) {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js", { scope: "/" })
            .then((reg) => {
                reg.addEventListener("updatefound", () => {
                    const sw = reg.installing;
                    if (!sw) return;
                    sw.addEventListener("statechange", () => {
                        if (sw.state === "installed" && navigator.serviceWorker.controller) {
                            onUpdate?.(reg);
                        }
                    });
                });
            })
            .catch((err) => console.warn("[PWA] SW registration failed:", err.message));
    });
}

/** Tell a waiting SW to activate immediately, then reload. */
export function applyUpdate(reg) {
    reg?.waiting?.postMessage("SKIP_WAITING");
    setTimeout(() => window.location.reload(), 300);
}

// ---- Install prompt (beforeinstallprompt) ----
export function initInstallPrompt() {
    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installListeners.forEach((cb) => cb(true));
    });
    window.addEventListener("appinstalled", () => {
        deferredPrompt = null;
        installListeners.forEach((cb) => cb(false));
    });
}

export function canInstall() {
    return Boolean(deferredPrompt);
}

export function onInstallAvailability(cb) {
    installListeners.add(cb);
    return () => installListeners.delete(cb);
}

export async function promptInstall() {
    if (!deferredPrompt) return { outcome: "unavailable" };
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    installListeners.forEach((cb) => cb(false));
    return choice;
}

/** True when launched as an installed standalone app. */
export function isStandalone() {
    return window.matchMedia?.("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;
}

// ---- Push notifications ----
export function notificationPermission() {
    return typeof Notification !== "undefined" ? Notification.permission : "unsupported";
}

function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Request permission + subscribe to push. Sends the subscription to the backend
 * (which stores it for the logged-in user). No-op when VAPID isn't configured.
 */
export async function enablePush(axiosInstance) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return { ok: false, reason: "unsupported" };
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: permission };

    if (!VAPID_PUBLIC_KEY) {
        // Local notifications still work via the SW; push delivery needs VAPID.
        return { ok: true, reason: "permission_only" };
    }
    try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
        }
        if (axiosInstance) {
            await axiosInstance.post(`${API_BASE_URL}/push/subscribe`, { subscription: sub });
        }
        return { ok: true, reason: "subscribed" };
    } catch (err) {
        return { ok: false, reason: err.message };
    }
}

export function pushSupported() {
    return "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
}
