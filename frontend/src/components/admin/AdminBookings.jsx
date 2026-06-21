import React, { useState } from "react";
import { adminBookings } from "../../services/adminService";
import { Badge, StatCard, useAdminList, fmtDateTime } from "./AdminUI";
import { toast } from "react-toastify";

// Inline SVG icons (avoids emoji-font rendering issues on some systems).
const Ico = {
    book: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>,
    check: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
    clock: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    x: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>,
    today: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><line x1="12" y1="14" x2="12" y2="18"></line></svg>,
};

const AdminBookings = () => {
    const { items, meta, stats, loading, params, setParam, setPage } = useAdminList(adminBookings, {});
    const [showMore, setShowMore] = useState(false);

    const clearFilters = () => setParam({ q: "", status: "All" });

    const exportCsv = () => {
        if (!items.length) { toast.info("Nothing to export"); return; }
        const head = ["Passenger", "Driver", "Route", "Date", "Seats", "Ride Status"];
        const lines = items.map((r) => [
            r.passenger, r.driver, r.route, fmtDateTime(r.timing), r.seats, r.rideStatus,
        ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
        const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `bookings-page-${meta?.page || 1}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const today = new Date();
    const from = new Date(); from.setDate(today.getDate() - 29);
    const opt = { day: "numeric", month: "short" };
    const rangeLabel = `${from.toLocaleDateString(undefined, opt)} – ${today.toLocaleDateString(undefined, { ...opt, year: "numeric" })}`;

    const st = stats || {};

    return (
        <div>
            {/* Stat cards */}
            <div className="adm-stats">
                <StatCard icon={Ico.book} value={loading ? "—" : (st.total ?? 0)} label="Total Bookings" sub="vs last 30 days" />
                <StatCard icon={Ico.check} value={loading ? "—" : (st.confirmed ?? 0)} label="Confirmed" sub="vs last 30 days" />
                <StatCard icon={Ico.clock} value={loading ? "—" : (st.pending ?? 0)} label="Pending" sub="vs last 30 days" />
                <StatCard icon={Ico.x} value={loading ? "—" : (st.cancelled ?? 0)} label="Cancelled" sub="vs last 30 days" />
                <StatCard icon={Ico.today} value={loading ? "—" : (st.today ?? 0)} label="Today's Bookings" sub="vs yesterday" />
            </div>

            {/* Toolbar */}
            <div className="adm-toolbar">
                <div className="adm-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                        placeholder="Search by source, name, email, or phone…"
                        value={params.q || ""}
                        onChange={(e) => setParam({ q: e.target.value })}
                    />
                </div>
                <select className="adm-select" value={params.status || "All"} onChange={(e) => setParam({ status: e.target.value })}>
                    <option value="All">All Status</option>
                    <option value="Available">Available</option>
                    <option value="Booked">Booked</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
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
                            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                                <line x1="9" y1="12" x2="15" y2="12"></line>
                                <line x1="9" y1="16" x2="13" y2="16"></line>
                            </svg>
                        </div>
                        <div className="adm-rides-empty-title">No bookings found</div>
                        <div className="adm-rides-empty-text">We couldn't find any bookings matching your current filters.<br />Try adjusting your search or filter settings.</div>
                        <button className="adm-btn primary" onClick={clearFilters}>⛃ Clear Filters</button>
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
                                    <tr>
                                        <th>Passenger</th><th>Driver</th><th>Route</th><th>Date</th><th>Seats</th><th>Ride Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((r, i) => (
                                        <tr key={`${r.rideId}-${i}`}>
                                            <td>{r.passenger}</td>
                                            <td>{r.driver}</td>
                                            <td>{r.route}</td>
                                            <td>{fmtDateTime(r.timing)}</td>
                                            <td>{r.seats}</td>
                                            <td><Badge value={r.rideStatus} /></td>
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

            {/* Tips strip */}
            <div className="adm-tips adm-tips--4">
                <div className="adm-tips-grid">
                    <div className="adm-tip">
                        <span className="adm-tip-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"></path></svg>
                        </span>
                        <div><strong>Manage Bookings Efficiently</strong><span>Use filters to quickly find bookings, track status, and export reports.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        </span>
                        <div><strong>Search &amp; Filter</strong><span>Find bookings by source, destination, date, status and more.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg>
                        </span>
                        <div><strong>Track &amp; Monitor</strong><span>Monitor booking status and identify trends over time.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </span>
                        <div><strong>Export Data</strong><span>Export booking reports for analysis or record keeping.</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminBookings;
