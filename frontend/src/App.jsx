import React, { useEffect, useState } from "react";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import AppRouter from './router';
import ErrorBoundary from './components/ErrorBoundary';
import InstallPrompt from './components/pwa/InstallPrompt';
import { applyUpdate } from './utils/pwa';

function App() {
    // Surfaced when a new service worker is waiting (app update available).
    const [updateReg, setUpdateReg] = useState(null);

    useEffect(() => {
        const onUpdate = (e) => setUpdateReg(e.detail);
        window.addEventListener("rs-sw-update", onUpdate);
        // App mounted successfully → clear the stale-chunk reload guard so a
        // future deploy can recover again.
        try { sessionStorage.removeItem("rs-chunk-reloaded"); } catch { /* ignore */ }
        return () => window.removeEventListener("rs-sw-update", onUpdate);
    }, []);

    return (
        <>
            <ErrorBoundary>
                <AppRouter />
            </ErrorBoundary>
            <ToastContainer position="top-right" autoClose={3000} />
            <InstallPrompt />
            {updateReg && (
                <div className="pwa-update" role="alert">
                    <span>🚀 A new version is available.</span>
                    <button onClick={() => applyUpdate(updateReg)}>Update</button>
                </div>
            )}
        </>
    );
}

export default App;
