import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "react-toastify";
import { getSocket, joinChat } from "../utils/socket";
import { acceptPersonalRide, declinePersonalRide, incomingPersonalRides } from "../services/personalRideService";
import "../styles/incomingRequest.css";

// Normalize a server request doc into the compact popup shape.
const toCard = (r) => ({
    id: String(r._id),
    pickup: r.pickup?.address,
    destination: r.destination?.address,
    distanceKm: r.distanceKm,
    fare: r.estimatedFare,
    vehicleType: r.vehicleType,
});

// How long an incoming-request card stays on screen before it auto-dismisses
// (the request also expires server-side). Uber shows a similar short window.
const AUTO_DISMISS_MS = 30000;

/**
 * Uber-style incoming ride-request popup. Mounted globally (Dashboard) so a
 * driver sees new on-demand requests no matter which page they're on. Listens
 * for the "ride_request_broadcast" socket event (emitted only to eligible,
 * verified, online drivers) and lets them Accept or Ignore right there.
 */
export default function IncomingRideRequestModal({ user, onNavigate, activeTab }) {
    const [queue, setQueue] = useState([]); // [{ id, pickup, destination, distanceKm, fare, vehicleType }]
    const [busy, setBusy] = useState(false);
    const userId = user?.id || user?._id;
    const timerRef = useRef(null);

    // Always-on listener for broadcast requests.
    useEffect(() => {
        if (!userId) return undefined;
        joinChat(userId);
        const socket = getSocket();
        const onBroadcast = (p) => {
            if (!p?.id) return;
            setQueue((q) => (q.some((r) => r.id === p.id) ? q : [...q, p]));
        };
        // Uber-style: once a request is accepted by another driver (or cancelled/
        // expired), drop it from this driver's popup so they can't act on a dead
        // request.
        const onClosed = (p) => {
            if (!p?.id) return;
            setQueue((q) => q.filter((r) => r.id !== p.id));
        };
        socket.on("ride_request_broadcast", onBroadcast);
        socket.on("ride_request_closed", onClosed);

        // Surface still-open requests that were broadcast while this driver was
        // offline / had the app closed — they see them the moment they return.
        incomingPersonalRides()
            .then(({ data }) => {
                const items = Array.isArray(data) ? data : [];
                if (!items.length) return;
                setQueue((q) => {
                    const seen = new Set(q.map((r) => r.id));
                    return [...q, ...items.map(toCard).filter((r) => r.id && !seen.has(r.id))];
                });
            })
            .catch(() => { /* non-driver or none open */ });

        return () => {
            socket.off("ride_request_broadcast", onBroadcast);
            socket.off("ride_request_closed", onClosed);
        };
    }, [userId]);

    const current = queue[0] || null;

    // Auto-dismiss the visible request after the window elapses.
    useEffect(() => {
        if (!current) return undefined;
        timerRef.current = setTimeout(() => setQueue((q) => q.slice(1)), AUTO_DISMISS_MS);
        return () => clearTimeout(timerRef.current);
    }, [current?.id]);

    const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);

    const accept = async () => {
        if (!current || busy) return;
        setBusy(true);
        try {
            await acceptPersonalRide(current.id);
            toast.success("Ride accepted — head to the pickup!");
            setQueue([]); // driver now has an active ride; clear the rest
            onNavigate?.("driveRequests");
        } catch (e) {
            toast.error(e.response?.data?.message || "Couldn't accept — it may already be taken.");
            dismiss();
        } finally { setBusy(false); }
    };

    const ignore = async () => {
        if (!current) return;
        const id = current.id;
        dismiss();
        try { await declinePersonalRide(id); } catch { /* ignore */ }
    };

    // Don't cover the Drive & Earn page — the incoming list already lives there.
    if (!current || activeTab === "driveRequests") return null;

    const youEarn = Math.round((current.fare || 0) * 0.9);

    return (
        <div className="irq-overlay" role="dialog" aria-label="New ride request">
            <div className="irq-card">
                <div className="irq-head">
                    <span className="irq-pulse" />
                    <span className="irq-title">New ride request</span>
                    {queue.length > 1 && <span className="irq-more">+{queue.length - 1} more</span>}
                </div>

                <div className="irq-fare-row">
                    <div className="irq-fare-main">₹{current.fare}<span>rider pays</span></div>
                    <div className="irq-fare-earn">₹{youEarn}<span>you earn</span></div>
                </div>

                <div className="irq-route">
                    <div className="irq-line"><span className="irq-dot pickup" /><span className="irq-addr">{current.pickup || "Pickup"}</span></div>
                    <div className="irq-conn" />
                    <div className="irq-line"><span className="irq-dot drop" /><span className="irq-addr">{current.destination || "Destination"}</span></div>
                </div>

                <div className="irq-meta">
                    <span>🚗 {current.vehicleType}</span>
                    {current.distanceKm != null && <span>📍 {current.distanceKm} km</span>}
                </div>

                <div className="irq-actions">
                    <button className="irq-btn ignore" onClick={ignore} disabled={busy}>Ignore</button>
                    <button className="irq-btn accept" onClick={accept} disabled={busy}>{busy ? "Accepting…" : "Accept"}</button>
                </div>
            </div>
        </div>
    );
}
