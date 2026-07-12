import { getWebInstrumentations, initializeFaro } from "@grafana/faro-web-sdk";
import { TracingInstrumentation } from "@grafana/faro-web-tracing";

// Grafana Faro — frontend observability (captures JS errors/crashes, console
// logs, page loads, and traces). Guarded to the production domain so local /
// Docker testing never ships noise to Grafana. The collector URL is a public
// client key (safe to ship in the bundle).
const FARO_URL =
    "https://faro-collector-prod-ap-south-1.grafana.net/collect/0ac7c45899d653a40275ea43f558fe8f";

let faroInstance = null;

export function initFaro() {
    if (typeof window === "undefined") return null;
    if (window.location.hostname !== "ridexshare.online") return null; // prod only
    if (faroInstance) return faroInstance;
    try {
        faroInstance = initializeFaro({
            url: FARO_URL,
            app: { name: "RidexShare", version: "1.0.0", environment: "production" },
            instrumentations: [
                ...getWebInstrumentations(),
                new TracingInstrumentation(),
            ],
        });
    } catch {
        /* never block the app if telemetry init fails */
    }
    return faroInstance;
}

// Manually report an error (used by the ErrorBoundary for React render crashes,
// which don't always reach the global window.onerror handler).
export function reportError(error, context) {
    try {
        if (faroInstance?.api?.pushError && error instanceof Error) {
            faroInstance.api.pushError(error, context ? { context } : undefined);
        }
    } catch {
        /* ignore */
    }
}
