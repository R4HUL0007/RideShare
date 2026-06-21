import React, { useState } from "react";
import { adminVerificationList, adminVerificationDetail, adminVerificationDecision } from "../../services/verificationService";
import { Badge, Modal, StatCard, useAdminList, fmtDate } from "./AdminUI";
import { toast } from "react-toastify";

const Ico = {
    file: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>,
    clock: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    check: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
    x: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>,
    expired: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><line x1="9" y1="16" x2="15" y2="16"></line></svg>,
};

const AdminVerification = () => {
    const { items, meta, stats, loading, params, setParam, setPage, reload } = useAdminList(adminVerificationList, {});
    const [detail, setDetail] = useState(null);
    const [decideModal, setDecideModal] = useState(null);
    const [remarks, setRemarks] = useState("");
    const [showMore, setShowMore] = useState(false);

    const openDetail = async (id) => {
        try {
            const { data } = await adminVerificationDetail(id);
            setDetail(data);
        } catch { toast.error("Failed to load verification."); }
    };

    const handleDecision = async (decision) => {
        if (!decideModal) return;
        if (remarks.trim().length < 5) {
            toast.info("Please add remarks for this decision (at least 5 characters)."); return;
        }
        try {
            await adminVerificationDecision(decideModal._id, decision, remarks);
            toast.success(`Verification ${decision}.`);
            setDecideModal(null); setDetail(null); setRemarks("");
            reload();
        } catch (e) { toast.error(e.response?.data?.message || "Action failed."); }
    };

    const clearFilters = () => setParam({ q: "", status: "All" });

    const exportCsv = () => {
        if (!items.length) { toast.info("Nothing to export"); return; }
        const head = ["Driver", "Email", "Vehicles", "Status", "Submitted"];
        const lines = items.map((r) => [
            r.user_id?.name || "", r.user_id?.email || "",
            (r.vehicles || []).map((v) => v.vehicle_id?.make ? `${v.vehicle_id.make} ${v.vehicle_id.model}` : "").filter(Boolean).join("; "),
            r.status, fmtDate(r.submittedAt),
        ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
        const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `verifications-page-${meta?.page || 1}.csv`; a.click();
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
                <StatCard icon={Ico.file} value={loading ? "—" : (st.total ?? 0)} label="Total Submissions" sub="vs last 30 days" />
                <StatCard icon={Ico.clock} value={loading ? "—" : (st.pending ?? 0)} label="Pending Review" sub="vs last 30 days" />
                <StatCard icon={Ico.check} value={loading ? "—" : (st.approved ?? 0)} label="Approved" sub="vs last 30 days" />
                <StatCard icon={Ico.x} value={loading ? "—" : (st.rejected ?? 0)} label="Rejected" sub="vs last 30 days" />
                <StatCard icon={Ico.expired} value={loading ? "—" : (st.expired ?? 0)} label="Expired" sub="vs last 30 days" />
            </div>

            {/* Toolbar */}
            <div className="adm-toolbar">
                <div className="adm-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                        placeholder="Search by driver name, license number, or submission ID…"
                        value={params.q || ""}
                        onChange={(e) => setParam({ q: e.target.value })}
                    />
                </div>
                <select className="adm-select" value={params.status || "All"} onChange={(e) => setParam({ status: e.target.value })}>
                    <option value="All">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="not_submitted">Not Submitted</option>
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
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                <path d="M12 11l1.5 1.5L17 9"></path>
                            </svg>
                        </div>
                        <div className="adm-rides-empty-title">No verifications found</div>
                        <div className="adm-rides-empty-text">There are no verification submissions matching your current filters.<br />Try adjusting your search or filter settings.</div>
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
                                        <th>Driver</th><th>Email</th><th>Vehicles</th><th>Status</th><th>Submitted</th><th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((r) => (
                                        <tr key={r._id}>
                                            <td>{r.user_id?.name || "—"}</td>
                                            <td><span className="adm-mono">{r.user_id?.email || "—"}</span></td>
                                            <td>{(r.vehicles || []).map((v) => v.vehicle_id?.make ? `${v.vehicle_id.make} ${v.vehicle_id.model}` : "—").join(", ") || "—"}</td>
                                            <td><Badge value={r.status} /></td>
                                            <td>{fmtDate(r.submittedAt)}</td>
                                            <td>
                                                <div className="adm-btn-row">
                                                    <button className="adm-btn" onClick={() => openDetail(r._id)}>Review</button>
                                                    {r.status === "pending" && <button className="adm-btn success" onClick={() => setDecideModal(r)}>Decide</button>}
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

            {/* About Verification strip */}
            <div className="adm-tips adm-tips--5">
                <div className="adm-tips-grid">
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.file}</span>
                        <div><strong>About Verification</strong><span>Drivers submit their license and vehicle documents for admin review before they can publish rides.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.clock}</span>
                        <div><strong>Pending Review</strong><span>Documents submitted and awaiting admin review.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.check}</span>
                        <div><strong>Approved</strong><span>Driver is verified and can create rides.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.x}</span>
                        <div><strong>Rejected</strong><span>Documents were invalid — driver may resubmit.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.expired}</span>
                        <div><strong>Expired</strong><span>Verification needs to be renewed.</span></div>
                    </div>
                </div>
            </div>

            {/* Detail Modal */}
            {detail && (
                <Modal title={`Verification: ${detail.user_id?.name || "Driver"}`} onClose={() => setDetail(null)}>
                    <div className="adm-kv"><span className="k">Email</span><span>{detail.user_id?.email}</span></div>
                    <div className="adm-kv"><span className="k">Role</span><span>{detail.user_id?.role}</span></div>
                    <div className="adm-kv"><span className="k">Status</span><span><Badge value={detail.status} /></span></div>
                    <div className="adm-kv"><span className="k">Submitted</span><span>{fmtDate(detail.submittedAt)}</span></div>
                    {detail.adminRemarks && <div className="adm-kv"><span className="k">Remarks</span><span>{detail.adminRemarks}</span></div>}

                    <div style={{ marginTop: "1rem" }}>
                        <div className="adm-panel-title">Driving License</div>
                        {detail.drivingLicense?.url ? (
                            <a href={detail.drivingLicense.url} target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd" }}>View Document ↗</a>
                        ) : <span style={{ color: "#6b7280" }}>Not uploaded</span>}
                    </div>

                    {(detail.vehicles || []).map((v, i) => (
                        <div key={i} style={{ marginTop: "1rem" }}>
                            <div className="adm-panel-title">{v.vehicle_id?.make} {v.vehicle_id?.model} ({v.vehicle_id?.licensePlate || "No plate"})</div>
                            <div className="adm-kv"><span className="k">RC</span><span>{v.rc?.url ? <a href={v.rc.url} target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd" }}>View ↗</a> : "Not uploaded"}</span></div>
                            <div className="adm-kv"><span className="k">Front Photo</span><span>{v.photos?.front?.url ? <a href={v.photos.front.url} target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd" }}>View ↗</a> : "—"}</span></div>
                            <div className="adm-kv"><span className="k">Side Photo</span><span>{v.photos?.side?.url ? <a href={v.photos.side.url} target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd" }}>View ↗</a> : "—"}</span></div>
                            <div className="adm-kv"><span className="k">Rear Photo</span><span>{v.photos?.rear?.url ? <a href={v.photos.rear.url} target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd" }}>View ↗</a> : "—"}</span></div>
                        </div>
                    ))}

                    <div className="adm-modal-actions">
                        <button className="adm-btn" onClick={() => setDetail(null)}>Close</button>
                        {detail.status === "pending" && (
                            <button className="adm-btn success" onClick={() => { setDecideModal(detail); }}>Decide</button>
                        )}
                    </div>
                </Modal>
            )}

            {/* Decision Modal */}
            {decideModal && (
                <Modal
                    title={`Decide: ${decideModal.user_id?.name || "Driver"}`}
                    onClose={() => { setDecideModal(null); setRemarks(""); }}
                    actions={
                        <>
                            <button className="adm-btn" onClick={() => { setDecideModal(null); setRemarks(""); }}>Cancel</button>
                            <button className="adm-btn danger" onClick={() => handleDecision("rejected")}>Reject</button>
                            <button className="adm-btn success" onClick={() => handleDecision("approved")}>Approve</button>
                        </>
                    }
                >
                    <p style={{ fontSize: "0.82rem", color: "#9ca3af", marginBottom: "0.7rem" }}>Review the documents first (click "Review"), then approve or reject.</p>
                    <textarea className="adm-textarea" placeholder="Remarks (required · visible to driver)…" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                </Modal>
            )}
        </div>
    );
};

export default AdminVerification;
