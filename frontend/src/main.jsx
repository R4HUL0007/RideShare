import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import { GOOGLE_CLIENT_ID } from './utils/constants';
import { registerServiceWorker, initInstallPrompt } from './utils/pwa';
import './styles/index.css';

// Only mount the Google provider when a client ID is configured, so the app
// runs cleanly in environments without Google OAuth set up.
const tree = GOOGLE_CLIENT_ID ? (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <App />
    </GoogleOAuthProvider>
) : (
    <App />
);

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        {tree}
    </React.StrictMode>
);

// ---- Stale-deploy recovery ----
// Vite fires this when a dynamically-imported chunk fails to load (the user's
// tab has old HTML after a redeploy). Reload once to pull the fresh bundle.
window.addEventListener("vite:preloadError", () => {
    try {
        if (!sessionStorage.getItem("rs-chunk-reloaded")) {
            sessionStorage.setItem("rs-chunk-reloaded", "1");
            window.location.reload();
        }
    } catch { window.location.reload(); }
});

// ---- PWA bootstrap ----
// Capture the install prompt early and register the service worker. An SW
// update dispatches a window event that App listens for to show an update toast.
initInstallPrompt();
registerServiceWorker({
    onUpdate: (reg) => window.dispatchEvent(new CustomEvent("rs-sw-update", { detail: reg })),
});
