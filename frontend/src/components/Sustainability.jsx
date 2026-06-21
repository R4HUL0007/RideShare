import React, { useEffect, useState } from "react";
import { getMyImpact } from "../services/sustainabilityService";
import "../styles/sustainability.css";

const kg = (n) => `${(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })} kg`;
const litres = (n) => `${(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
const km = (n) => `${(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`;
const inr = (n) => `₹${(n ?? 0).toLocaleString("en-IN")}`;

// "vs last month" delta label for the stat cards.
const fmtDelta = (cur, prev) => {
    const c = cur || 0, p = prev || 0;
    if (p === 0 && c === 0) return "≈ 0% vs last month";
    if (p === 0) return "↑ new this month";
    const pct = Math.round(((c - p) / p) * 100);
    return `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs last month`;
};

const ImpactCard = ({ icon, value, label, sub, accent }) => (
    <div className="su-card su-rise">
        <span className={`su-card-icon accent-${accent || "green"}`}>{icon}</span>
        <div className="su-card-body">
            <div className="su-card-value">{value}</div>
            <div className="su-card-label">{label}</div>
            {sub && <div className="su-card-sub">{sub}</div>}
        </div>
    </div>
);

// Simple progress bar comparing this month vs last month.
const TrendBar = ({ label, value, max, unit }) => {
    const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    return (
        <div className="su-trend">
            <div className="su-trend-top"><span>{label}</span><span className="su-trend-val">{value.toLocaleString("en-IN", { maximumFractionDigits: 1 })} {unit}</span></div>
            <div className="su-trend-track"><span className="su-trend-fill" style={{ width: `${pct}%` }} /></div>
        </div>
    );
};

/**
 * Sustainability — "My Environmental Impact" dashboard. Read-only; derives from
 * completed ride history. Shows combined impact, driver & passenger breakdowns,
 * a monthly trend, and an educational insight.
 */
const Sustainability = ({ onOpenSidebar }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        getMyImpact()
            .then(({ data }) => { if (active) setData(data); })
            .catch(() => {})
            .finally(() => active && setLoading(false));
        return () => { active = false; };
    }, []);

    const t = data?.total || {};
    const driver = data?.driver || {};
    const passenger = data?.passenger || {};
    const tl = data?.timeline || {};
    const tm = tl.thisMonth || {};
    const lm = tl.lastMonth || {};
    const treeWhole = Math.max(0, Math.round(t.treeEquivalent || 0));
    const maxTrend = Math.max(tl.thisMonth?.co2SavedKg || 0, tl.lastMonth?.co2SavedKg || 0, tl.yearToDate?.co2SavedKg || 0, 1);

    const scrollToBreakdown = () => document.getElementById("su-breakdown")?.scrollIntoView({ behavior: "smooth" });

    return (
        <div className="su-root">
            <div className="su-topbar">
                {onOpenSidebar && (
                    <button className="su-hamburger" onClick={onOpenSidebar} aria-label="Open menu">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                    </button>
                )}
                <span className="su-title-icon" aria-hidden="true">🌱</span>
                <div className="su-heading">
                    <h1 className="su-title">My Environmental Impact</h1>
                    <p className="su-subtitle">Every shared ride makes a difference. Together, we build a greener tomorrow.</p>
                </div>
            </div>

            {/* Hero insight */}
            <div className="su-hero su-rise">
                <svg className="su-hero-art" viewBox="0 0 420 180" fill="none" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
                    <path d="M0 150 Q120 90 230 130 T420 110 V180 H0 Z" fill="rgba(16,185,129,0.10)" />
                    <path d="M120 160 Q260 120 420 150 V180 H120 Z" fill="rgba(16,185,129,0.07)" />
                    <g fill="rgba(110,231,183,0.22)">
                        <circle cx="320" cy="70" r="20" /><rect x="318" y="86" width="4" height="14" />
                        <circle cx="360" cy="90" r="14" /><rect x="358" y="100" width="3" height="10" />
                        <circle cx="285" cy="95" r="11" /><rect x="284" y="104" width="2" height="8" />
                    </g>
                    <path d="M240 180 Q300 130 420 130" stroke="rgba(255,255,255,0.12)" strokeWidth="10" fill="none" />
                    <path d="M240 180 Q300 130 420 130" stroke="rgba(255,255,255,0.18)" strokeWidth="2" strokeDasharray="8 10" fill="none" />
                </svg>
                <div className="su-hero-badge">🌳</div>
                <div className="su-hero-text">
                    <div className="su-hero-big">{loading ? "—" : kg(t.co2SavedKg)}</div>
                    <div className="su-hero-label">CO₂ emissions avoided</div>
                    <p className="su-hero-insight">{loading ? "Calculating your impact…" : data?.insight}</p>
                    <button className="su-hero-btn" onClick={scrollToBreakdown}>
                        Learn more
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                    </button>
                </div>
            </div>

            {/* Headline cards */}
            <div className="su-cards">
                <ImpactCard accent="green" icon="🌱" value={loading ? "—" : kg(t.co2SavedKg)} label="CO₂ Saved" sub={loading ? "" : fmtDelta(tm.co2SavedKg, lm.co2SavedKg)} />
                <ImpactCard accent="red" icon="⛽" value={loading ? "—" : litres(t.fuelSavedL)} label="Fuel Saved" sub={loading ? "" : fmtDelta(tm.fuelSavedL, lm.fuelSavedL)} />
                <ImpactCard accent="red" icon="🚗" value={loading ? "—" : (t.sharedTrips ?? 0)} label="Shared Trips" sub={loading ? "" : fmtDelta(tm.sharedTrips, lm.sharedTrips)} />
                <ImpactCard accent="blue" icon="🛣️" value={loading ? "—" : km(t.sharedDistanceKm)} label="Distance Shared" sub={loading ? "" : fmtDelta(tm.sharedDistanceKm, lm.sharedDistanceKm)} />
                <ImpactCard accent="green" icon="🌳" value={loading ? "—" : treeWhole} label="Trees Equivalent" sub={`≈ ${t.treeEquivalent ?? 0} trees/yr`} />
            </div>

            {/* Monthly trend */}
            <div className="su-panel su-rise">
                <div className="su-panel-head">
                    <div className="su-panel-title">📈 CO₂ saved over time</div>
                    <span className="su-period-chip">📅 This Year</span>
                </div>
                {loading ? (
                    <div className="su-skel" />
                ) : (
                    <div className="su-trends">
                        <TrendBar label="This month" value={tl.thisMonth?.co2SavedKg || 0} max={maxTrend} unit="kg" />
                        <TrendBar label="Last month" value={tl.lastMonth?.co2SavedKg || 0} max={maxTrend} unit="kg" />
                        <TrendBar label="Year to date" value={tl.yearToDate?.co2SavedKg || 0} max={maxTrend} unit="kg" />
                    </div>
                )}
            </div>

            {/* Role breakdowns */}
            <div className="su-grid2" id="su-breakdown">
                <div className="su-panel su-breakdown-card su-rise">
                    <span className="su-watermark" aria-hidden="true">🚘</span>
                    <div className="su-panel-title">🚘 As a Driver</div>
                    <p className="su-panel-sub">Your contributions to a cleaner environment</p>
                    <div className="su-kv"><span>Passengers transported</span><span>{loading ? "—" : (driver.passengersTransported ?? 0)}</span></div>
                    <div className="su-kv"><span>CO₂ saved</span><span>{loading ? "—" : kg(driver.co2SavedKg)}</span></div>
                    <div className="su-kv"><span>Fuel saved</span><span>{loading ? "—" : litres(driver.fuelSavedL)}</span></div>
                    <div className="su-kv"><span>Shared distance</span><span>{loading ? "—" : km(driver.sharedDistanceKm)}</span></div>
                </div>
                <div className="su-panel su-breakdown-card su-rise">
                    <span className="su-watermark" aria-hidden="true">🧍</span>
                    <div className="su-panel-title">🧍 As a Passenger</div>
                    <p className="su-panel-sub">Your impact as a responsible rider</p>
                    <div className="su-kv"><span>Trips shared</span><span>{loading ? "—" : (passenger.tripsShared ?? 0)}</span></div>
                    <div className="su-kv"><span>CO₂ saved</span><span>{loading ? "—" : kg(passenger.co2SavedKg)}</span></div>
                    <div className="su-kv"><span>Money saved</span><span>{loading ? "—" : inr(passenger.moneySavedInr)}</span></div>
                    <div className="su-kv"><span>Shared distance</span><span>{loading ? "—" : km(passenger.sharedDistanceKm)}</span></div>
                </div>
            </div>

            {/* Encouragement strip */}
            <div className="su-impact-strip su-rise">
                <span className="su-impact-icon">🌍</span>
                <div className="su-impact-text">
                    <strong>Small rides. Big impact.</strong>
                    <p>{(t.sharedTrips ?? 0) === 0 ? "Complete a few shared rides and your environmental impact will grow here." : "Keep sharing rides — every trip adds up to a greener campus."}</p>
                </div>
            </div>

            <p className="su-foot">Estimates based on average vehicle emissions. Actual impact varies by vehicle and conditions.</p>
        </div>
    );
};

export default Sustainability;
