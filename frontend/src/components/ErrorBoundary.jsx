import React from "react";
import { reportError } from "../utils/faro";

// Detect the "stale deploy" class of errors: after a redeploy the HTML in an
// open tab references hashed JS chunks that no longer exist on the server, so a
// lazy import (e.g. a route) fails. These are recoverable with one fresh reload.
const isChunkError = (err) => {
    const m = `${err?.name || ""} ${err?.message || ""}`;
    return /ChunkLoadError|Loading chunk|dynamically imported module|module script failed|Failed to fetch dynamically/i.test(m);
};

const RELOAD_KEY = "rs-chunk-reloaded";

// App-wide error boundary. Without one, ANY render crash blanks the whole app
// to a white screen. This catches it, auto-recovers from stale-chunk errors
// (one reload), and otherwise shows a friendly fallback with a reload button.
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, recovering: false };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, recovering: isChunkError(error) };
    }

    componentDidCatch(error) {
        if (isChunkError(error)) {
            // Stale bundle after a deploy → force ONE reload to fetch fresh JS.
            try {
                if (!sessionStorage.getItem(RELOAD_KEY)) {
                    sessionStorage.setItem(RELOAD_KEY, "1");
                    window.location.reload();
                    return;
                }
            } catch { /* sessionStorage unavailable */ }
        }
        // eslint-disable-next-line no-console
        console.error("[ErrorBoundary]", error);
        // Report to Grafana Faro (prod-only; no-op otherwise) so we can see
        // real user crashes with stack traces.
        reportError(error, "ErrorBoundary");
    }

    render() {
        if (this.state.hasError) {
            // A reload is in flight for stale-chunk recovery — render nothing.
            if (this.state.recovering) return null;
            return (
                <div style={{
                    minHeight: "100vh", display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: "1rem",
                    background: "#0a0a0b", color: "#f4f4f5", textAlign: "center", padding: "1.5rem",
                }}>
                    <h2 style={{ margin: 0, fontWeight: 800 }}>Something went wrong</h2>
                    <p style={{ margin: 0, color: "#9ca3af", maxWidth: "26rem" }}>
                        The page hit an unexpected error. Reloading usually fixes it.
                    </p>
                    <button
                        onClick={() => { try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ } window.location.reload(); }}
                        style={{
                            padding: "0.7rem 1.4rem", fontWeight: 700, borderRadius: "0.7rem",
                            border: "none", cursor: "pointer", color: "#0a0a0b",
                            background: "linear-gradient(135deg,#fff,#d4d4d8)",
                        }}
                    >
                        Reload
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
