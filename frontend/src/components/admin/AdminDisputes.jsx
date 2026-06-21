import React, { useState } from "react";
import { adminDisputes, adminResolveDispute } from "../../services/adminService";
import { Badge, Modal, StatCard, useAdminList, fmtDateTime } from "./AdminUI";
import { toast } from "react-toastify";

const initialsOf = (name) =>
    (name || "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "U";

const Ico = {
    file: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>,
    clock: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    check: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
    x: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>,
    archive: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>,
    search: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>,
};

const REASONS = [
    { v: "ride_not_taken", t: "Ride not taken" },
    { v: "driver_no_show", t: "Driver no-show" },
    { v: "wrong_route", t: "Wrong route" },
    { v: "safety_concern", t: "Safety concern" },
    { v: "overcharged", t: "Overcharged" },
    { v: "other", t: "Other" },
];

const AdminDisputes = () => {
    const { items, meta, stats, loading, params, setParam, setPage, reload } = useAdminList(adminDisputes, {});
    const [resolveModal, setResolveModal] = useState(null);
    const [outcome, setOutcome] = useState("released");
    const [note, setNote] = useState("");
    const [showMore, setShowMore] = useState(false);

    const handleResolve = async () => {
        if (!resolveModal) return;
        if (note.trim().length < 5) { toast.info("Please add a resolution note (at least 5 characters)."); return; }
        try {
            await adminResolveDispute(resolveModal._id, outcome, note);
            toast.success(`Dispute ${outcome}`);
            setResolveModal(null);
            setNote("");
            reload();
        } catch (e) {
            toast.error(e.response?.data?.message || "Failed to resolve dispute");
        }
    };

    const clearFilters = () => setParam({ q: "", status: "All", reason: "All" });

    const exportCsv = () => {
        if (!items.length) { toast.info("Nothing to export"); return; }
        const head = ["ID", "Raised By", "Against", "Ride", "Amount", "Reason", "Status", "Outcome", "Filed"];
        const lines = items.map((r) => [
            String(r._id).slice(-8), r.raisedBy?.name || "", r.against?.name || "",
            r.ride_id ? `${r.ride_id.source} → ${r.ride_id.destination}` : "",
            r.payment_id ? r.payment_id.amount : "", (r.reason || "").replace(/_/g, " "),
            r.status, r.outcome || "", fmtDateTime(r.createdAt),
        ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
        const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `disputes-page-${meta?.page || 1}.csv`; a.click();
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
                <StatCard icon={Ico.file} value={loading ? "—" : (st.total ?? 0)} label="Total Disputes" sub="vs last 30 days" />
                <StatCard icon={Ico.clock} value={loading ? "—" : (st.open ?? 0)} label="Open Disputes" sub="vs last 30 days" />
                <StatCard icon={Ico.check} value={loading ? "—" : (st.resolved ?? 0)} label="Resolved Disputes" sub="vs last 30 days" />
                <StatCard icon={Ico.x} value={loading ? "—" : (st.cancelled ?? 0)} label="Cancelled Disputes" sub="vs last 30 days" />
                <StatCard icon={Ico.archive} value={loading ? "—" : (st.closed ?? 0)} label="Closed (No Action)" sub="vs last 30 days" />
            </div>

            {/* Toolbar */}
            <div className="adm-toolbar">
                <div className="adm-search">
                    {Ico.search}
                    <input
                        placeholder="Search by dispute ID, members, ride ID, or reason…"
                        value={params.q || ""}
                        onChange={(e) => setParam({ q: e.target.value })}
                    />
                </div>
                <select className="adm-select" value={params.status || "All"} onChange={(e) => setParam({ status: e.target.value })}>
                    <option value="All">All Status</option>
                    <option value="open">Open</option>
                    <option value="under_review">Under Review</option>
                    <option value="resolved">Resolved</option>
                </select>
                <select className="adm-select" value={params.reason || "All"} onChange={(e) => setParam({ reason: e.target.value })}>
                    <option value="All">All Reasons</option>
                    {REASONS.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
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
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                <path d="M9 12h6M12 9v6"></path>
                            </svg>
                        </div>
                        <div className="adm-rides-empty-title">No disputes found</div>
                        <div className="adm-rides-empty-text">You're all caught up! There are no disputes matching your current filters.</div>
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
                                        <th>ID</th><th>Raised By</th><th>Against</th><th>Ride</th><th>Amount</th>
                                        <th>Reason</th><th>Status</th><th>Outcome</th><th>Filed</th><th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((r) => (
                                        <tr key={r._id}>
                                            <td><span className="adm-mono">{String(r._id).slice(-8)}</span></td>
                                            <td>{r.raisedBy?.name || "—"}</td>
                                            <td>{r.against?.name || "—"}</td>
                                            <td>{r.ride_id ? `${r.ride_id.source} → ${r.ride_id.destination}` : "—"}</td>
                                            <td>{r.payment_id ? `₹${r.payment_id.amount}` : "—"}</td>
                                            <td>{r.reason?.replace(/_/g, " ") || "—"}</td>
                                            <td><Badge value={r.status} /></td>
                                            <td>{r.outcome ? <Badge value={r.outcome} /> : "—"}</td>
                                            <td>{fmtDateTime(r.createdAt)}</td>
                                            <td>
                                                {r.status !== "resolved" ? (
                                                    <button className="adm-btn primary" onClick={() => setResolveModal(r)}>Resolve</button>
                                                ) : "—"}
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

            {/* About Disputes strip */}
            <div className="adm-tips adm-tips--6">
                <div className="adm-tips-grid">
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.file}</span>
                        <div><strong>About Disputes</strong><span>Disputes are raised when members report issues with a ride or with each other.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.clock}</span>
                        <div><strong>Open</strong><span>Waiting for admin review.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.search}</span>
                        <div><strong>In Review</strong><span>Admin is reviewing the dispute.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.check}</span>
                        <div><strong>Resolved</strong><span>Dispute has been resolved.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.x}</span>
                        <div><strong>Cancelled</strong><span>Dispute was cancelled by a member.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.archive}</span>
                        <div><strong>Closed</strong><span>No action required or taken.</span></div>
                    </div>
                </div>
            </div>

            {resolveModal && (
                <Modal
                    title={null}
                    size="lg"
                    onClose={() => { setResolveModal(null); setNote(""); }}
                    actions={
                        <>
                            <button className="adm-btn" onClick={() => { setResolveModal(null); setNote(""); }}>✕ Cancel</button>
                            <button className={`adm-btn ${outcome === "refunded" ? "danger" : "success"}`} onClick={handleResolve}>
                                {outcome === "released" ? "✓ Release to Driver" : "↩ Refund Passenger"}
                            </button>
                        </>
                    }
                >
                    <div className="adm-ud-head">
                        <span className="adm-ud-head-icon" style={{ background: "rgba(245,158,11,0.16)", color: "#fbbf24", borderColor: "rgba(245,158,11,0.3)" }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        </span>
                        <div>
                            <div className="adm-ud-title">Resolve Dispute</div>
                            <div className="adm-ud-subtitle">Review the details and decide the outcome.</div>
                        </div>
                    </div>

                    <div className="adm-rpt-grid">
                        <div className="adm-rpt-card">
                            <div className="adm-rpt-sec">📋 Dispute Details</div>
                            <div className="adm-rpt-row">
                                <span className="adm-rpt-label">Raised by</span>
                                <span className="adm-rpt-reporter">
                                    <span className="adm-cell-avatar">{initialsOf(resolveModal.raisedBy?.name)}</span>
                                    <span className="adm-cell-stack"><span style={{ fontWeight: 700 }}>{resolveModal.raisedBy?.name || "—"}</span><span className="adm-cell-sub">{resolveModal.raisedBy?.email || ""}</span></span>
                                </span>
                            </div>
                            <div className="adm-rpt-row">
                                <span className="adm-rpt-label">Against</span>
                                <span className="adm-rpt-reporter">
                                    <span className="adm-cell-avatar">{initialsOf(resolveModal.against?.name)}</span>
                                    <span className="adm-cell-stack"><span style={{ fontWeight: 700 }}>{resolveModal.against?.name || "—"}</span><span className="adm-cell-sub">{resolveModal.against?.email || ""}</span></span>
                                </span>
                            </div>
                            <div className="adm-rpt-row"><span className="adm-rpt-label">Reason</span><span style={{ textTransform: "capitalize" }}>{resolveModal.reason?.replace(/_/g, " ") || "—"}</span></div>
                            {resolveModal.ride_id && <div className="adm-rpt-row"><span className="adm-rpt-label">Ride</span><span>{resolveModal.ride_id.source} → {resolveModal.ride_id.destination}</span></div>}
                            <div className="adm-rpt-row"><span className="adm-rpt-label">Amount</span><span style={{ fontWeight: 800 }}>₹{resolveModal.payment_id?.amount || 0}</span></div>
                            <div className="adm-rpt-row"><span className="adm-rpt-label">Escrow Status</span><span><Badge value={resolveModal.payment_id?.escrowStatus} /></span></div>
                            <div className="adm-rpt-row"><span className="adm-rpt-label">Filed On</span><span>📅 {fmtDateTime(resolveModal.createdAt)}</span></div>
                        </div>

                        <div className="adm-rpt-card">
                            <div className="adm-rpt-sec">📄 Description</div>
                            <p style={{ fontSize: "0.84rem", color: "#d4d4d8", lineHeight: 1.5, minHeight: "2.4rem" }}>{resolveModal.description || "No description provided."}</p>
                            <div className="adm-confidential">
                                <span className="adm-confidential-icon">ℹ</span>
                                <div>
                                    <strong>Resolution is final</strong>
                                    <span>Releasing pays the driver; refunding returns funds to the passenger. This can't be undone.</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="adm-rpt-resolution">
                        <div className="adm-rpt-sec">⚖️ Decision</div>
                        <select className="adm-select" value={outcome} onChange={(e) => setOutcome(e.target.value)} style={{ width: "100%" }}>
                            <option value="released">Reject dispute — Release funds to driver</option>
                            <option value="refunded">Uphold dispute — Refund passenger</option>
                        </select>

                        <div className="adm-rpt-sec" style={{ marginTop: "0.9rem" }}>✏️ Resolution Note <span className="adm-muted">(required, visible to both members)</span></div>
                        <div className="adm-textarea-wrap">
                            <textarea className="adm-textarea" maxLength={1000} placeholder="Add a note about the resolution…" value={note} onChange={(e) => setNote(e.target.value)} />
                            <span className="adm-char-count">{note.length}/1000</span>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default AdminDisputes;
