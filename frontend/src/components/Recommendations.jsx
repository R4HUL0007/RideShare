import React, { useEffect, useState } from "react";
import {
    getPassengerRecommendations, getDriverInsights, getTrendingRoutes, trackRecommendation,
} from "../services/recommendationService";
import "../styles/recommendations.css";

const fmtTime = (d) => {
    if (!d) return "";
    try { return new Date(d).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
};
const matchTone = (s) => (s >= 90 ? "high" : s >= 75 ? "mid" : "low");

/**
 * Recommendations — three premium cards for the dashboard home:
 *   🎯 Recommended For You (passenger)
 *   📊 Demand Insights (driver)
 *   🔥 Trending Routes (shared)
 * Enhances discovery; never replaces manual search. Navigates via onNavigate.
 */
const Recommendations = ({ onNavigate }) => {
    const [reco, setReco] = useState(null);
    const [insights, setInsights] = useState(null);
    const [trending, setTrending] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        Promise.allSettled([getPassengerRecommendations(), getDriverInsights(7), getTrendingRoutes()])
            .then(([r, d, t]) => {
                if (!active) return;
                if (r.status === "fulfilled") setReco(r.value.data);
                if (d.status === "fulfilled") setInsights(d.value.data);
                if (t.status === "fulfilled") setTrending(t.value.data);
            })
            .finally(() => active && setLoading(false));
        return () => { active = false; };
    }, []);

    const openRide = (ride) => {
        trackRecommendation({ rideId: ride._id, kind: "click", surface: "passenger", score: ride._reco?.score, reason: ride._reco?.reason }).catch(() => {});
        onNavigate?.("findRides");
    };

    const items = reco?.items || [];
    const favRoutes = reco?.favoriteRoutes || [];
    const popular = insights?.popularDestinations || [];
    const unserved = insights?.unservedRoutes || [];
    const suggested = insights?.suggestedToCreate || [];
    const trendSearched = trending?.mostSearched || [];

    return (
        <div className="rc-wrap">
            {/* 🎯 Recommended For You */}
            <section className="rc-card rc-rise">
                <div className="rc-head">
                    <h3 className="rc-title">🎯 Recommended for you</h3>
                    {favRoutes[0] && <span className="rc-sub">Based on your usual route</span>}
                </div>
                {loading ? (
                    <div className="rc-skel-rows"><span /><span /></div>
                ) : items.length === 0 ? (
                    <div className="rc-empty">
                        <p>Book or search a few rides and we'll suggest rides on your usual routes here.</p>
                        <button className="rc-btn" onClick={() => onNavigate?.("findRides")}>Find a ride</button>
                    </div>
                ) : (
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
                )}
                {favRoutes.length > 0 && (
                    <div className="rc-chips">
                        {favRoutes.slice(0, 3).map((f, i) => (
                            <span key={i} className="rc-chip" title="Your frequent route">{f.destination}</span>
                        ))}
                    </div>
                )}
            </section>

            {/* 📊 Demand Insights (driver) */}
            <section className="rc-card rc-rise">
                <div className="rc-head">
                    <h3 className="rc-title">📊 Demand insights</h3>
                    <span className="rc-sub">Last 7 days</span>
                </div>
                {loading ? (
                    <div className="rc-skel-rows"><span /><span /></div>
                ) : (popular.length === 0 && suggested.length === 0) ? (
                    <div className="rc-empty"><p>No demand data yet. As members search for rides, high-demand routes will appear here.</p></div>
                ) : (
                    <>
                        {suggested.length > 0 && (
                            <div className="rc-insight">
                                <div className="rc-insight-lead">🚗 Opportunities to earn</div>
                                {suggested.slice(0, 3).map((s, i) => (
                                    <div key={i} className="rc-demand-row">
                                        <span>{s.destination}{s.familiar ? " (you've driven here)" : ""}</span>
                                        <span className="rc-demand-count">{s.searches} searches</span>
                                    </div>
                                ))}
                                <button className="rc-btn" onClick={() => onNavigate?.("createRide")}>Create a ride</button>
                            </div>
                        )}
                        {unserved.length > 0 && (
                            <div className="rc-insight">
                                <div className="rc-insight-lead">📍 Unserved routes (high opportunity)</div>
                                {unserved.slice(0, 3).map((u, i) => (
                                    <div key={i} className="rc-demand-row">
                                        <span>{u.destination}</span>
                                        <span className="rc-demand-count warn">{u.searches} unmet</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </section>

            {/* 🔥 Trending Routes */}
            <section className="rc-card rc-rise">
                <div className="rc-head"><h3 className="rc-title">🔥 Trending routes</h3></div>
                {loading ? (
                    <div className="rc-skel-rows"><span /><span /></div>
                ) : trendSearched.length === 0 ? (
                    <div className="rc-empty"><p>Trending destinations will show up as the community searches and books rides.</p></div>
                ) : (
                    <div className="rc-trend">
                        {trendSearched.slice(0, 6).map((t, i) => (
                            <button key={i} className="rc-trend-chip" onClick={() => onNavigate?.("findRides")}>
                                <span className="rc-trend-rank">{i + 1}</span>{t.destination}
                            </button>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

export default Recommendations;
