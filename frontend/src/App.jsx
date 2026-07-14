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
        // Clear the stale-chunk reload guard only AFTER the app has run for a
        // few seconds. Lazy-route chunk errors happen AFTER mount, so clearing
        // it immediately would re-arm the guard and cause an infinite reload
        // loop when a chunk keeps failing. Waiting means a genuine later deploy
        // can still recover once, but a persistent failure shows the error
        // fallback instead of looping.
        const t = setTimeout(() => {
            try { sessionStorage.removeItem("rs-chunk-reloaded"); } catch { /* ignore */ }
        }, 8000);
        return () => { clearTimeout(t); window.removeEventListener("rs-sw-update", onUpdate); };
    }, []);

    return (
        <>
            <ErrorBoundary>
                <AppRouter />
            </ErrorBoundary>
            <ToastContainer
                position="top-right"
                autoClose={3000}
                theme="dark"
                newestOnTop
                closeOnClick
                pauseOnHover
                draggable={false}
            />
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
