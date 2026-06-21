import React, { useState } from "react";
import { adminReviews, adminRemoveReview } from "../../services/adminService";
import { StatCard, useAdminList, fmtDate } from "./AdminUI";
import { toast } from "react-toastify";

const Ico = {
    star: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>,
    clock: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    check: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
    x: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>,
    flag: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>,
    shield: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>,
    chat: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>,
};

const Stars = ({ n }) => (
    <span style={{ color: "#fcd34d", letterSpacing: "1px" }}>{"★".repeat(n || 0)}<span style={{ color: "#3f3f46" }}>{"★".repeat(5 - (n || 0))}</span></span>
);

const AdminReviews = () => {
    const { items, meta, stats, loading, params, setParam, setPage, reload } = useAdminList(adminReviews, {});
    const [removeModal, setRemoveModal] = useState(null);
    const [removeReason, setRemoveReason] = useState("");
    const [menu, setMenu] = useState(null);
    const [showMore, setShowMore] = useState(false);

    const handleRemove = async () => {
        if (!removeModal) return;
        if (removeReason.trim().length < 5) { toast.info("Please add a reason for removal (at least 5 characters)."); return; }
        try {
            await adminRemoveReview(removeModal._id, removeReason);
            toast.success("Review removed");
            setRemoveModal(null);
            setRemoveReason("");
            reload();
        } catch (e) {
            toast.error(e.response?.data?.message || "Failed to remove review");
        }
    };

    const copyId = (r) => {
        setMenu(null);
        try { navigator.clipboard.writeText(String(r._id)); toast.success("Review ID copied"); }
        catch { toast.info(String(r._id)); }
    };

    const clearFilters = () => setParam({ q: "", rating: "All", maxRating: "" });

    const exportCsv = () => {
        if (!items.length) { toast.info("Nothing to export"); return; }
        const head = ["Reviewer", "Reviewee", "Ride", "Rating", "Comment", "Date"];
        const lines = items.map((r) => [
            r.reviewer?.name || "", r.reviewee?.name || "",
            r.ride ? `${r.ride.source} → ${r.ride.destination}` : "",
            r.rating, r.comment || "", fmtDate(r.createdAt),
        ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
        const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `reviews-page-${meta?.page || 1}.csv`; a.click();
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
                <StatCard icon={Ico.star} value={loading ? "—" : (st.total ?? 0)} label="Total Reviews" sub="all time" />
                <StatCard icon={Ico.check} value={loading ? "—" : (st.approved ?? 0)} label="Published" sub="visible to users" />
            </div>

            {/* Toolbar */}
            <div className="adm-toolbar">
                <div className="adm-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                        placeholder="Search by reviewer, ride, or comment…"
                        value={params.q || ""}
                        onChange={(e) => setParam({ q: e.target.value })}
                    />
                </div>
                <select className="adm-select" value={params.rating || "All"} onChange={(e) => setParam({ rating: e.target.value, maxRating: "" })}>
                    <option value="All">All Ratings</option>
                    <option value="5">5 stars</option>
                    <option value="4">4 stars</option>
                    <option value="3">3 stars</option>
                    <option value="2">2 stars</option>
                    <option value="1">1 star</option>
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
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                <polygon points="12 7.5 13 10 15.5 10.2 13.6 11.9 14.2 14.4 12 13 9.8 14.4 10.4 11.9 8.5 10.2 11 10"></polygon>
                            </svg>
                        </div>
                        <div className="adm-rides-empty-title">No reviews found</div>
                        <div className="adm-rides-empty-text">There are no reviews matching your current filters.<br />Try adjusting your search or filter settings.</div>
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
                                    <tr>
                                        <th>Reviewer</th><th>Reviewee</th><th>Ride</th><th>Rating</th><th>Comment</th><th>Date</th><th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((r) => (
                                        <tr key={r._id}>
                                            <td>{r.reviewer?.name || "—"}</td>
                                            <td>{r.reviewee?.name || "—"}</td>
                                            <td>{r.ride ? `${r.ride.source} → ${r.ride.destination}` : "—"}</td>
                                            <td><Stars n={r.rating} /></td>
                                            <td>
                                                <span title={r.comment} style={{ maxWidth: "220px", display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}>
                                                    {r.comment || "—"}
                                                </span>
                                            </td>
                                            <td>{fmtDate(r.createdAt)}</td>
                                            <td><button className="adm-icon-btn adm-dots" onClick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); setMenu({ row: r, x: rect.right, y: rect.bottom }); }} aria-label="More actions" title="More actions">⋮</button></td>
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

            {/* About Reviews strip */}
            <div className="adm-tips adm-tips--5">
                <div className="adm-tips-grid">
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.star}</span>
                        <div><strong>About Reviews</strong><span>Reviews help build trust and improve service quality. Moderate fairly and respond professionally.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.star}</span>
                        <div><strong>Fair &amp; Transparent</strong><span>Ensure every review is treated fairly.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.shield}</span>
                        <div><strong>Quality Control</strong><span>Approve genuine reviews and reject spam.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.flag}</span>
                        <div><strong>Safe Community</strong><span>Keep the platform safe from abuse.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.chat}</span>
                        <div><strong>Better Experience</strong><span>Quality reviews lead to better experiences.</span></div>
                    </div>
                </div>
            </div>

            {/* Three-dot quick-actions menu */}
            {menu && (
                <>
                    <div className="adm-menu-backdrop" onClick={() => setMenu(null)} />
                    <div className="adm-menu" style={{ top: menu.y + 4, left: Math.max(8, menu.x - 200) }}>
                        <button className="danger" onClick={() => { setRemoveModal(menu.row); setMenu(null); }}>🗑 Remove Review…</button>
                        <button onClick={() => copyId(menu.row)}>⧉ Copy Review ID</button>
                    </div>
                </>
            )}

            {removeModal && (
                <div className="adm-overlay" onMouseDown={(e) => e.target === e.currentTarget && (setRemoveModal(null), setRemoveReason(""))}>
                    <div className="adm-modal" role="dialog" aria-modal="true">
                        <div className="adm-modal-title">Remove Review?</div>
                        <div className="adm-kv"><span className="k">By</span><span>{removeModal.reviewer?.name}</span></div>
                        <div className="adm-kv"><span className="k">For</span><span>{removeModal.reviewee?.name}</span></div>
                        <div className="adm-kv"><span className="k">Rating</span><span><Stars n={removeModal.rating} /></span></div>
                        <div className="adm-kv"><span className="k">Comment</span><span>{removeModal.comment || "None"}</span></div>
                        <p style={{ marginTop: "0.8rem", fontSize: "0.82rem", color: "#fca5a5" }}>
                            This action is irreversible. The reviewee's rating aggregates will be recomputed.
                        </p>
                        <textarea
                            className="adm-textarea"
                            style={{ marginTop: "0.6rem" }}
                            placeholder="Reason for removal (required, at least 5 characters)…"
                            value={removeReason}
                            onChange={(e) => setRemoveReason(e.target.value)}
                        />
                        <div className="adm-modal-actions">
                            <button className="adm-btn" onClick={() => { setRemoveModal(null); setRemoveReason(""); }}>Cancel</button>
                            <button className="adm-btn danger" onClick={handleRemove}>Remove</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminReviews;
