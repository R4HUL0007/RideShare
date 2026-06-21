import React, { useState } from "react";
import { adminRides, adminCancelRide } from "../../services/adminService";
import { Badge, Modal, StatCard, useAdminList, fmtDateTime } from "./AdminUI";
import { toast } from "react-toastify";

const AdminRides = () => {
    const { items, meta, stats, loading, params, setParam, setPage, reload } = useAdminList(adminRides, {});
    const [cancelModal, setCancelModal] = useState(null);
    const [reason, setReason] = useState("");
    const [menu, setMenu] = useState(null);
    const [showMore, setShowMore] = useState(false);

    const handleCancel = async () => {
        if (!cancelModal) return;
        if (reason.trim().length < 5) { toast.info("Please add a reason for cancellation (at least 5 characters)."); return; }
        try {
            await adminCancelRide(cancelModal._id, reason);
            toast.success("Ride cancelled");
            setCancelModal(null);
            setReason("");
            reload();
        } catch (e) {
            toast.error(e.response?.data?.message || "Failed to cancel ride");
        }
    };

    const copyId = (r) => {
        setMenu(null);
        try { navigator.clipboard.writeText(String(r._id)); toast.success("Ride ID copied"); }
        catch { toast.info(String(r._id)); }
    };

    const clearFilters = () => setParam({ q: "", status: "All" });

    const exportCsv = () => {
        if (!items.length) { toast.info("Nothing to export"); return; }
        const head = ["Route", "Driver", "Vehicle", "Date", "Seats", "Passengers", "Price", "Status"];
        const lines = items.map((r) => [
            `${r.source} → ${r.destination}`,
            r.user_id?.name || "",
            r.vehicle_id ? `${r.vehicle_id.make} ${r.vehicle_id.model}` : "",
            fmtDateTime(r.timing),
            r.seatsAvailable, r.passengerCount || 0,
            r.pricePerPerson ? `₹${r.pricePerPerson}` : "Free",
            r.status,
        ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
        const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `rides-page-${meta?.page || 1}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    // Last-30-days range label for the toolbar pill.
    const today = new Date();
    const from = new Date(); from.setDate(today.getDate() - 29);
    const opt = { day: "numeric", month: "short" };
    const rangeLabel = `${from.toLocaleDateString(undefined, opt)} – ${today.toLocaleDateString(undefined, { ...opt, year: "numeric" })}`;

    const st = stats || {};

    return (
        <div>
            {/* Stat cards */}
            <div className="adm-stats">
                <StatCard icon="🚗" value={loading ? "—" : (st.total ?? 0)} label="Total Rides" sub="vs last 30 days" />
                <StatCard icon="✅" value={loading ? "—" : (st.completed ?? 0)} label="Completed Rides" sub="vs last 30 days" />
                <StatCard icon="🕒" value={loading ? "—" : (st.ongoing ?? 0)} label="Ongoing Rides" sub="vs last 30 days" />
                <StatCard icon="✖" value={loading ? "—" : (st.cancelled ?? 0)} label="Cancelled Rides" sub="vs last 30 days" />
                <StatCard icon="⭐" value={loading ? "—" : (st.avgRating ?? 0).toFixed(1)} label="Avg. Rating" sub="vs last 30 days" />
            </div>

            {/* Toolbar */}
            <div className="adm-toolbar">
                <div className="adm-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                        placeholder="Search by source or destination…"
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
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 17H4a2 2 0 0 1-2-2v-3.34a2 2 0 0 1 .38-1.17l1.86-2.5A2 2 0 0 1 5.85 7H15l3.5 4.5 1.9.63A2 2 0 0 1 22 14v1a2 2 0 0 1-2 2h-1"></path>
                                <circle cx="7" cy="17" r="2"></circle>
                                <circle cx="17" cy="17" r="2"></circle>
                            </svg>
                        </div>
                        <div className="adm-rides-empty-title">No rides found</div>
                        <div className="adm-rides-empty-text">There are no rides matching your current filters.<br />Try adjusting your search or filter settings.</div>
                        <button className="adm-btn primary" onClick={clearFilters}>↻ Clear Filters</button>
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
                                        <th>Route</th><th>Driver</th><th>Vehicle</th><th>Date</th>
                                        <th>Seats</th><th>Passengers</th><th>Price</th><th>Tracking</th><th>Status</th><th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((r) => (
                                        <tr key={r._id}>
                                            <td>{r.source} → {r.destination}</td>
                                            <td>{r.user_id?.name || "—"}</td>
                                            <td>{r.vehicle_id ? `${r.vehicle_id.make} ${r.vehicle_id.model}` : "—"}</td>
                                            <td>{fmtDateTime(r.timing)}</td>
                                            <td>{r.seatsAvailable}</td>
                                            <td>{r.passengerCount || 0}</td>
                                            <td>{r.pricePerPerson ? `₹${r.pricePerPerson}` : "Free"}</td>
                                            <td><Badge value={r.tracking?.state || "scheduled"} /></td>
                                            <td><Badge value={r.status} /></td>
                                            <td>
                                                <div className="adm-btn-row" style={{ alignItems: "center" }}>
                                                    <button className="adm-icon-btn adm-dots" onClick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); setMenu({ row: r, x: rect.right, y: rect.bottom }); }} aria-label="More actions" title="More actions">⋮</button>
                                                </div>
                                            </td>
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

            {/* Did you know? tips */}
            <div className="adm-tips">
                <div className="adm-tips-head">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18h6"></path>
                        <path d="M10 22h4"></path>
                        <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path>
                    </svg>
                    Did you know?
                </div>
                <div className="adm-tips-grid">
                    <div className="adm-tip">
                        <span className="adm-tip-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 17H4a2 2 0 0 1-2-2v-3.34a2 2 0 0 1 .38-1.17l1.86-2.5A2 2 0 0 1 5.85 7H15l3.5 4.5 1.9.63A2 2 0 0 1 22 14v1a2 2 0 0 1-2 2h-1"></path>
                                <circle cx="7" cy="17" r="2"></circle>
                                <circle cx="17" cy="17" r="2"></circle>
                            </svg>
                        </span>
                        <div><strong>Track ride performance</strong><span>Monitor completed rides, cancellations, and user ratings to improve service quality.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="20" x2="12" y2="10"></line>
                                <line x1="18" y1="20" x2="18" y2="4"></line>
                                <line x1="6" y1="20" x2="6" y2="16"></line>
                            </svg>
                        </span>
                        <div><strong>Use filters to find faster</strong><span>Filter by date, status, or location to quickly find the rides you need.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </span>
                        <div><strong>Export ride data</strong><span>Download ride reports for analysis or record keeping.</span></div>
                    </div>
                </div>
            </div>

            {/* Three-dot quick-actions menu */}
            {menu && (
                <>
                    <div className="adm-menu-backdrop" onClick={() => setMenu(null)} />
                    <div className="adm-menu" style={{ top: menu.y + 4, left: Math.max(8, menu.x - 200) }}>
                        {menu.row.status !== "Cancelled" && menu.row.status !== "Completed" && (
                            <button className="danger" onClick={() => { setCancelModal(menu.row); setMenu(null); }}>✖ Cancel Ride…</button>
                        )}
                        <button onClick={() => copyId(menu.row)}>⧉ Copy Ride ID</button>
                    </div>
                </>
            )}

            {cancelModal && (
                <Modal
                    title={`Cancel ride: ${cancelModal.source} → ${cancelModal.destination}?`}
                    onClose={() => { setCancelModal(null); setReason(""); }}
                    actions={
                        <>
                            <button className="adm-btn" onClick={() => { setCancelModal(null); setReason(""); }}>Back</button>
                            <button className="adm-btn danger" onClick={handleCancel}>Confirm Cancel</button>
                        </>
                    }
                >
                    <p style={{ fontSize: "0.82rem", color: "#9ca3af", marginBottom: "0.7rem" }}>
                        This will cancel the ride and notify all participants.
                    </p>
                    <textarea
                        className="adm-textarea"
                        placeholder="Reason for cancellation (required, at least 5 characters)…"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                    />
                </Modal>
            )}
        </div>
    );
};

export default AdminRides;
