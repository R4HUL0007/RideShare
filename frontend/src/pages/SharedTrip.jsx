import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL } from "../utils/constants";
import { getSocket } from "../utils/socket";
import "../styles/safety.css";

const STATE_LABEL = {
    scheduled: "Scheduled", enroute: "En route", arriving: "Arriving",
    arrived: "Arrived", in_progress: "In progress", completed: "Completed",
};

/**
 * SharedTrip — PUBLIC, read-only live tracking view resolved from a secure
 * share token. No authentication required (the token is the credential). Shows
 * route, driver/vehicle, status and live driver location via Socket.io.
 */
const SharedTrip = () => {
    const { token } = useParams();
    const [trip, setTrip] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [driverLoc, setDriverLoc] = useState(null);
    const [state, setState] = useState("scheduled");

    const load = useCallback(async () => {
        try {
            // Public endpoint — use a bare axios call (no auth interceptor needed).
            const { data } = await axios.get(`${API_BASE_URL}/safety/trip/${token}`);
            setTrip(data);
            setState(data.tracking?.state || "scheduled");
            if (data.tracking?.driverLocation?.lat != null) setDriverLoc(data.tracking.driverLocation);
        } catch (err) {
            setError(err.response?.data?.message || "This tracking link is invalid or has expired.");
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { load(); }, [load]);

    // Live updates (the location event carries the rideId; we listen broadly
    // since this public page doesn't know it, and the backend snapshot reload
    // keeps it fresh as a fallback).
    useEffect(() => {
        const socket = getSocket();
        const onLoc = (p) => {
            if (p.location?.lat != null) setDriverLoc(p.location);
            if (p.state) setState(p.state);
        };
        const onStatus = (p) => { if (p.state) setState(p.state); };
        socket.on("ride:location", onLoc);
        socket.on("ride:status", onStatus);
        const poll = setInterval(load, 30000); // safety refresh
        return () => { socket.off("ride:location", onLoc); socket.off("ride:status", onStatus); clearInterval(poll); };
    }, [load]);

    if (loading) {
        return <div className="st-root"><div className="st-center"><span className="sf-stat-icon">📍</span><p>Loading shared trip…</p></div></div>;
    }
    if (error) {
        return <div className="st-root"><div className="st-center"><span className="sf-stat-icon">🔒</span><p>{error}</p></div></div>;
    }

    const mapsUrl = driverLoc?.lat
        ? `https://www.google.com/maps?q=${driverLoc.lat},${driverLoc.lng}`
        : (trip.destinationCoords?.lat ? `https://www.google.com/maps?q=${trip.destinationCoords.lat},${trip.destinationCoords.lng}` : null);

    return (
        <div className="st-root">
            <div className="st-card">
                <div className="st-badge">🛡 Shared via RidexShare</div>
                <h1 className="st-route">{trip.source} → {trip.destination}</h1>
                <span className={`sf-status ${state === "completed" ? "green" : state === "in_progress" ? "amber" : "grey"}`} style={{ alignSelf: "flex-start" }}>{STATE_LABEL[state] || state}</span>

                <div className="st-rows">
                    <div className="st-row"><span>Driver</span><span>{trip.driverName}</span></div>
                    {trip.vehicle && <div className="st-row"><span>Vehicle</span><span>{trip.vehicle}</span></div>}
                    {trip.licensePlate && <div className="st-row"><span>Plate</span><span>{trip.licensePlate}</span></div>}
                    <div className="st-row"><span>Status</span><span>{STATE_LABEL[state] || state}</span></div>
                    {driverLoc?.lat && <div className="st-row"><span>Live location</span><span>{driverLoc.lat.toFixed(4)}, {driverLoc.lng.toFixed(4)}</span></div>}
                </div>

                {mapsUrl && (
                    <a className="sf-btn full" href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ textAlign: "center", textDecoration: "none", display: "block" }}>
                        Open in Google Maps
                    </a>
                )}
                <p className="st-foot">This is a live, read-only view of a trip someone shared with you for their safety.</p>
            </div>
        </div>
    );
};

export default SharedTrip;
