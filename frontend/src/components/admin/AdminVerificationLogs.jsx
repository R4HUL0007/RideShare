import React, { useEffect, useState } from "react";
import { adminVerificationLogs, adminVerificationAnalytics } from "../../services/checkinService";
import { useAdminList, fmtDateTime, StatCard } from "./AdminUI";
import { toast } from "react-toastify";

const EVENT_LABEL = {
    code_generated: "Code generated", checked_in: "Checked in", boarding_verified: "Boarding verified",
    verification_failed: "Verification failed", ride_started: "Ride started", ride_completed: "Ride completed",
    dropoff_confirmed: "Drop-off confirmed", passenger_no_show: "Passenger no-show", driver_no_show: "Driver no-show",
    issue_reported: "Issue reported",
};

const Ico = {
    check: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
    ban: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>,
    trend: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg>,
    alert: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
    heart: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>,
};

const AdminVerificationLogs = () => {
    const { items, meta, loading, params, setParam, setPage } = useAdminList(adminVerificationLogs, {});
    const [stats, setStats] = useState(null);
    const [showMore, setShowMore] = useState(false);

    useEffect(() => {
        adminVerificationAnalytics(30).then(({ data }) => setStats(data)).catch(() => {});
    }, []);

    const clearFilters = () => setParam({ event: "All" });

    const exportCsv = () => {
        if (!items.length) { toast.info("Nothing to export"); return; }
        const head = ["Event", "Ride", "By", "Passenger", "Time"];
        const lines = items.map((r) => [
            EVENT_LABEL[r.event] || r.event,
            r.ride_id ? `${r.ride_id.source} → ${r.ride_id.destination}` : "",
            r.actor_id?.name || "", r.passenger_id?.name || "", fmtDateTime(r.createdAt),
        ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
        const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `checkins-page-${meta?.page || 1}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const today = new Date();
    const from = new Date(); from.setDate(today.getDate() - 29);
    const opt = { day: "numeric", month: "short" };
    const rangeLabel = `${from.toLocaleDateString(undefined, opt)} – ${today.toLocaleDateString(undefined, { ...opt, year: "numeric" })}`;

    const s = stats || {};

    return (
        <div>
            {/* Stat cards */}
            <div className="adm-stats">
                <StatCard icon={Ico.check} value={s.checkInSuccessRate != null ? `${s.checkInSuccessRate}%` : (loading ? "—" : "0%")} label="Check-in → Verified" sub="vs last 30 days" />
                <StatCard icon={Ico.ban} value={s.noShows ?? (loading ? "—" : 0)} label="No-shows (30d)" sub="vs last 30 days" />
                <StatCard icon={Ico.trend} value={s.noShowRate != null ? `${s.noShowRate}%` : (loading ? "—" : "0%")} label="No-show Rate" sub="vs last 30 days" />
                <StatCard icon={Ico.alert} value={s.verificationFailures ?? (loading ? "—" : 0)} label="Verification Failures" sub="vs last 30 days" />
                <StatCard icon={Ico.heart} value={s.completionConfirmations ?? (loading ? "—" : 0)} label="Drop-off Confirmations" sub="vs last 30 days" />
            </div>

            {/* Toolbar */}
            <div className="adm-toolbar">
                <select className="adm-select" value={params.event || "All"} onChange={(e) => setParam({ event: e.target.value })}>
                    <option value="All">All Events</option>
                    {Object.entries(EVENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <span className="adm-date-pill">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    {rangeLabel}
                </span>
                <button className={`adm-btn ${showMore ? "primary" : ""}`} onClick={() => setShowMore((v) => !v)}>⛃ More Filters</button>
                <div className="adm-toolbar-spacer" />
                <button className="adm-btn" onClick={exportCsv}>⤓ Export</button>
            </div>

            {showMore && (
                <div className="adm-morefilters">
                    <span className="adm-muted">Refine results</span>
                    <button className="adm-btn" onClick={clearFilters}>Clear all filters</button>
                </div>
            )}

            {/* Table / empty state */}
            <div className="adm-table-card">
                {loading ? (
                    <div style={{ padding: "1rem" }}><div className="adm-skel" /><div className="adm-skel" /><div className="adm-skel" /></div>
                ) : items.length === 0 ? (
                    <div className="adm-rides-empty">
                        <div className="adm-rides-empty-illu">
                            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 2h6a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1V4a2 2 0 0 1 2-2z"></path>
                                <path d="M9 13l1.5 1.5L14 11"></path>
                            </svg>
                        </div>
                        <div className="adm-rides-empty-title">No verification events yet</div>
                        <div className="adm-rides-empty-text">There are no verification events matching your current filters.<br />Try adjusting your date range or filter settings.</div>
                        <div className="adm-btn-row" style={{ justifyContent: "center" }}>
                            <button className="adm-btn primary" onClick={clearFilters}>⛃ Clear Filters</button>
                            <button className="adm-btn" onClick={clearFilters}>↻ Reset Filters</button>
                        </div>
                        <div className="adm-foot-pager" style={{ marginTop: "1.4rem" }}>
                            <button className="adm-btn" disabled>← Prev</button>
                            <span className="adm-foot-info">Page {meta?.page || 1} of {meta?.pages || 1} · {meta?.total || 0} total</span>
                            <button className="adm-btn" disabled>Next →</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="adm-table-wrap">
                            <table className="adm-table">
                                <thead>
                                    <tr><th>Event</th><th>Ride</th><th>By</th><th>Passenger</th><th>Time</th></tr>
                                </thead>
                                <tbody>
                                    {items.map((r) => (
                                        <tr key={r._id}>
                                            <td style={{ fontWeight: 700 }}>{EVENT_LABEL[r.event] || r.event}</td>
                                            <td>{r.ride_id ? `${r.ride_id.source} → ${r.ride_id.destination}` : "—"}</td>
                                            <td>{r.actor_id?.name || "—"}</td>
                                            <td>{r.passenger_id?.name || "—"}</td>
                                            <td>{fmtDateTime(r.createdAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="adm-table-foot">
                            <div className="adm-foot-pager">
                                <button className="adm-btn" disabled={!meta || meta.page <= 1} onClick={() => setPage((meta?.page || 1) - 1)}>← Prev</button>
                                <span className="adm-foot-info">Page {meta?.page || 1} of {meta?.pages || 1} · {meta?.total || 0} total</span>
                                <button className="adm-btn" disabled={!meta || meta.page >= meta.pages} onClick={() => setPage((meta?.page || 1) + 1)}>Next →</button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* About Ride Check-Ins strip */}
            <div className="adm-tips adm-tips--5">
                <div className="adm-tips-grid">
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.check}</span>
                        <div><strong>About Ride Check-Ins</strong><span>Monitor check-in activity to ensure timely verification and rider safety.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.check}</span>
                        <div><strong>Verified</strong><span>Rider checked in and was successfully verified.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.ban}</span>
                        <div><strong>No-show</strong><span>Rider did not check in within the expected time.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.alert}</span>
                        <div><strong>Failures</strong><span>Verification attempt was unsuccessful.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.heart}</span>
                        <div><strong>Drop-off</strong><span>Rider was safely dropped off and confirmed.</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminVerificationLogs;
