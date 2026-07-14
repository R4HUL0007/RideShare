import React, { useEffect, useState } from "react";
import { getPassengerRecommendations, trackRecommendation } from "../services/recommendationService";
import "../styles/recommendations.css";

const fmtTime = (d) => {
    if (!d) return "";
    try { return new Date(d).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
};
const matchTone = (s) => (s >= 90 ? "high" : s >= 75 ? "mid" : "low");

/**
 * Recommendations — a single, focused "Recommended for you" section for the
 * dashboard home. Personalized ride suggestions based on the user's own
 * history (favorite/frequent routes).
 *
 * Deliberately minimal: it renders NOTHING at all when there are no
 * recommendations (new users, or users without enough history yet). We don't
 * show empty prompts, demand insights, or trending clutter — just relevant
 * rides once we actually have some to suggest.
 */
const Recommendations = ({ onNavigate }) => {
    const [items, setItems] = useState(null); // null = loading, [] = none
    const [sub, setSub] = useState("");

    useEffect(() => {
        let active = true;
        getPassengerRecommendations()
            .then(({ data }) => {
                if (!active) return;
                setItems(Array.isArray(data?.items) ? data.items : []);
                setSub(data?.favoriteRoutes?.[0] ? "Based on your usual routes" : "");
            })
            .catch(() => { if (active) setItems([]); });
        return () => { active = false; };
    }, []);

    const openRide = (ride) => {
        trackRecommendation({ rideId: ride._id, kind: "click", surface: "passenger", score: ride._reco?.score, reason: ride._reco?.reason }).catch(() => {});
        onNavigate?.("findRides");
    };

    // Hide entirely while loading and for users with no recommendations yet.
    if (!items || items.length === 0) return null;

    return (
        <section className="rc-card rc-rise">
            <div className="rc-head">
                <h3 className="rc-title">🎯 Recommended for you</h3>
                {sub && <span className="rc-sub">{sub}</span>}
            </div>
            <div className="rc-list">
                {items.slice(0, 4).map((r) => (
                    <button key={r._id} className="rc-ride" onClick={() => openRide(r)}>
                        <div className="rc-ride-main">
                            <span className="rc-ride-route">{r.source} → {r.destination}</span>
                            <span className="rc-ride-meta">{fmtTime(r.timing)} · {r.seatsAvailable} seat{r.seatsAvailable !== 1 ? "s" : ""}{r.pricePerPerson ? ` · ₹${r.pricePerPerson}` : " · Free"}</span>
                            {r._reco?.reason && <span className="rc-ride-reason">{r._reco.reason}</span>}
                        </div>
                        {r._reco?.score != null && <span className={`rc-score ${matchTone(r._reco.score)}`}>{r._reco.score}%</span>}
                    </button>
                ))}
            </div>
        </section>
    );
};

export default Recommendations;
