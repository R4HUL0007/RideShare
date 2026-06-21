import React, { useState } from "react";
import { adminWithdrawals, adminDecideWithdrawal } from "../../services/adminService";
import { Badge, Modal, StatCard, useAdminList, fmtDateTime } from "./AdminUI";
import { toast } from "react-toastify";

const Ico = {
    file: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>,
    clock: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    check: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
    x: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>,
    bank: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>,
};

const AdminWithdrawals = () => {
    const { items, meta, stats, loading, params, setParam, setPage, reload } = useAdminList(adminWithdrawals, {});
    const [decideModal, setDecideModal] = useState(null);
    const [note, setNote] = useState("");
    const [showMore, setShowMore] = useState(false);

    const handleDecision = async (decision) => {
        if (!decideModal) return;
        if (note.trim().length < 5) {
            toast.info("Please add a note for this decision (at least 5 characters)."); return;
        }
        try {
            await adminDecideWithdrawal(decideModal._id, decision, note);
            toast.success(`Withdrawal ${decision === "approve" ? "approved" : "rejected"}`);
            setDecideModal(null);
            setNote("");
            reload();
        } catch (e) {
            toast.error(e.response?.data?.message || "Action failed");
        }
    };

    const clearFilters = () => setParam({ q: "", status: "All", method: "All" });
    const inr = (n) => `₹${(n ?? 0).toLocaleString("en-IN")}`;

    const exportCsv = () => {
        if (!items.length) { toast.info("Nothing to export"); return; }
        const head = ["Driver", "Email", "UPI ID", "Amount", "Method", "Status", "Requested"];
        const lines = items.map((r) => [
            r.driver_id?.name || "", r.driver_id?.email || "", r.upiId || "",
            r.amount, r.method, r.status, fmtDateTime(r.createdAt),
        ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
        const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `withdrawals-page-${meta?.page || 1}.csv`; a.click();
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
                <StatCard icon={Ico.file} value={loading ? "—" : (st.total ?? 0)} label="Total Requests" sub="vs last 30 days" />
                <StatCard icon={Ico.clock} value={loading ? "—" : (st.pending ?? 0)} label="Pending Review" sub="vs last 30 days" />
                <StatCard icon={Ico.check} value={loading ? "—" : (st.approved ?? 0)} label="Approved" sub="vs last 30 days" />
                <StatCard icon={Ico.x} value={loading ? "—" : (st.rejected ?? 0)} label="Rejected" sub="vs last 30 days" />
                <StatCard icon={Ico.bank} value={loading ? "—" : (st.completed ?? 0)} label="Completed" sub="vs last 30 days" />
            </div>

            {/* Toolbar */}
            <div className="adm-toolbar">
                <div className="adm-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                        placeholder="Search by driver name, ID, vehicle, amount, or reason…"
                        value={params.q || ""}
                        onChange={(e) => setParam({ q: e.target.value })}
                    />
                </div>
                <select className="adm-select" value={params.status || "All"} onChange={(e) => setParam({ status: e.target.value })}>
                    <option value="All">All Status</option>
                    <option value="Requested">Requested</option>
                    <option value="Approved">Approved</option>
                    <option value="Processed">Processed</option>
                    <option value="Rejected">Rejected</option>
                </select>
                <select className="adm-select" value={params.method || "All"} onChange={(e) => setParam({ method: e.target.value })}>
                    <option value="All">All Payment Methods</option>
                    <option value="upi">UPI</option>
                    <option value="bank">Bank</option>
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
                                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
                                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path>
                                <path d="M18 12a2 2 0 0 0 0 4h4v-4z"></path>
                            </svg>
                        </div>
                        <div className="adm-rides-empty-title">No withdrawal requests</div>
                        <div className="adm-rides-empty-text">There are no withdrawal requests matching your current filters.<br />Try adjusting your search or filter settings.</div>
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
                                        <th>Driver</th><th>Email</th><th>UPI ID</th><th>Amount</th><th>Method</th><th>Status</th><th>Requested</th><th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((r) => (
                                        <tr key={r._id}>
                                            <td>{r.driver_id?.name || "—"}</td>
                                            <td><span className="adm-mono">{r.driver_id?.email || "—"}</span></td>
                                            <td>{r.upiId || "—"}</td>
                                            <td>{inr(r.amount)}</td>
                                            <td>{(r.method || "").toUpperCase()}</td>
                                            <td><Badge value={r.status} /></td>
                                            <td>{fmtDateTime(r.createdAt)}</td>
                                            <td>
                                                {(r.status === "Requested" || r.status === "Approved") ? (
                                                    <button className="adm-btn primary" onClick={() => setDecideModal(r)}>Review</button>
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

            {/* About Withdrawals strip */}
            <div className="adm-tips adm-tips--5">
                <div className="adm-tips-grid">
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.file}</span>
                        <div><strong>About Withdrawals</strong><span>Withdrawal requests are submitted by drivers when they want to cash out their earnings from the platform.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.clock}</span>
                        <div><strong>Pending Review</strong><span>Request is received and awaiting admin review.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.check}</span>
                        <div><strong>Approved</strong><span>Request is approved and payment is initiated.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.x}</span>
                        <div><strong>Rejected</strong><span>Request is rejected due to policy or verification issues.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.bank}</span>
                        <div><strong>Completed</strong><span>Amount is successfully transferred to driver.</span></div>
                    </div>
                </div>
            </div>

            {decideModal && (
                <Modal
                    title={`Withdrawal: ${inr(decideModal.amount)}`}
                    onClose={() => { setDecideModal(null); setNote(""); }}
                    actions={
                        <>
                            <button className="adm-btn" onClick={() => { setDecideModal(null); setNote(""); }}>Cancel</button>
                            <button className="adm-btn danger" onClick={() => handleDecision("reject")}>Reject</button>
                            <button className="adm-btn success" onClick={() => handleDecision("approve")}>Approve &amp; Process</button>
                        </>
                    }
                >
                    <div className="adm-kv"><span className="k">Driver</span><span>{decideModal.driver_id?.name}</span></div>
                    <div className="adm-kv"><span className="k">Email</span><span>{decideModal.driver_id?.email}</span></div>
                    <div className="adm-kv"><span className="k">UPI ID</span><span>{decideModal.upiId || "Not provided"}</span></div>
                    <div className="adm-kv"><span className="k">Amount</span><span>{inr(decideModal.amount)}</span></div>
                    <div className="adm-kv"><span className="k">Method</span><span>{decideModal.method}</span></div>
                    <div className="adm-kv"><span className="k">Requested</span><span>{fmtDateTime(decideModal.createdAt)}</span></div>

                    <div style={{ marginTop: "1rem" }}>
                        <label style={{ fontSize: "0.82rem", color: "#9ca3af", display: "block", marginBottom: "0.4rem" }}>Note (required)</label>
                        <textarea
                            className="adm-textarea"
                            placeholder="Add a note…"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default AdminWithdrawals;
