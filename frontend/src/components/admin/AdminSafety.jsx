import React, { useState } from "react";
import { adminSafetyReports, adminResolveReport, adminSosEvents, adminUpdateSos } from "../../services/safetyService";
import { Badge, Modal, StatCard, useAdminList, fmtDateTime } from "./AdminUI";
import { toast } from "react-toastify";

const initialsOf = (name) =>
    (name || "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "U";

const TYPE_LABEL = {
    driver: "Driver Report", passenger: "Passenger Report", ride: "Ride Report",
    unsafe_driving: "Unsafe Driving", harassment: "Harassment", vehicle_mismatch: "Vehicle Mismatch",
    fake_profile: "Fake Profile", payment_issue: "Payment Issue", other: "Other",
};

const Ico = {
    flag: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>,
    shield: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>,
    file: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>,
    clock: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    eye: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>,
    check: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
    sos: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
    dots: "⋮",
};

const PriorityBadge = ({ p }) => {
    const tone = p === "high" ? "red" : p === "medium" ? "amber" : "green";
    const arrow = p === "high" ? "↑" : p === "low" ? "↓" : "•";
    return <Badge value={`${p} ${arrow}`} tone={tone} />;
};

const STATUS_TONE = { open: "red", under_review: "blue", resolved: "green", dismissed: "grey" };

const AdminSafety = () => {
    const [view, setView] = useState("reports");
    return (
        <div>
            <div className="adm-tabs">
                <button className={`adm-tab ${view === "reports" ? "active" : ""}`} onClick={() => setView("reports")}>{Ico.flag} Reports</button>
                <button className={`adm-tab ${view === "sos" ? "active" : ""}`} onClick={() => setView("sos")}>{Ico.sos} SOS Events</button>
            </div>
            {view === "reports" ? <Reports /> : <SosEvents />}
        </div>
    );
};

const Toolbar = ({ params, setParam, types, showMore, setShowMore, onExport, placeholder }) => {
    const today = new Date();
    const from = new Date(); from.setDate(today.getDate() - 29);
    const opt = { day: "numeric", month: "short" };
    const rangeLabel = `${from.toLocaleDateString(undefined, opt)} – ${today.toLocaleDateString(undefined, { ...opt, year: "numeric" })}`;
    return (
        <>
            <div className="adm-toolbar">
                <div className="adm-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input placeholder={placeholder} value={params.q || ""} onChange={(e) => setParam({ q: e.target.value })} />
                </div>
                <select className="adm-select" value={params.status || "All"} onChange={(e) => setParam({ status: e.target.value })}>
                    <option value="All">All Status</option>
                    <option value="open">Open</option>
                    <option value="under_review">Under Review</option>
                    <option value="resolved">Resolved</option>
                    <option value="dismissed">Dismissed</option>
                </select>
                {types && (
                    <select className="adm-select" value={params.type || "All"} onChange={(e) => setParam({ type: e.target.value })}>
                        <option value="All">All Types</option>
                        {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                )}
                <span className="adm-date-pill">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    {rangeLabel}
                </span>
                <button className={`adm-btn ${showMore ? "primary" : ""}`} onClick={() => setShowMore((v) => !v)}>⛃ More Filters</button>
                <div className="adm-toolbar-spacer" />
                <button className="adm-btn" onClick={onExport}>⤓ Export</button>
            </div>
            {showMore && (
                <div className="adm-morefilters">
                    <span className="adm-muted">Refine results</span>
                    <button className="adm-btn" onClick={() => setParam({ q: "", status: "All", type: "All" })}>Clear all filters</button>
                </div>
            )}
        </>
    );
};

const Footer = ({ meta, setPage }) => {
    const page = meta?.page || 1, limit = meta?.limit || 20, total = meta?.total || 0;
    const a = total === 0 ? 0 : (page - 1) * limit + 1;
    const b = Math.min(page * limit, total);
    return (
        <div className="adm-table-foot">
            <span className="adm-foot-info">Showing {a} to {b} of {total} results</span>
            <div className="adm-foot-pager">
                <button className="adm-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                <span className="adm-foot-info">Page {page} of {meta?.pages || 1}</span>
                <button className="adm-btn" disabled={page >= (meta?.pages || 1)} onClick={() => setPage(page + 1)}>Next →</button>
            </div>
        </div>
    );
};

/* ---------------- Safety Reports ---------------- */
const Reports = () => {
    const { items, meta, stats, loading, params, setParam, setPage, reload } = useAdminList(adminSafetyReports, {});
    const [modal, setModal] = useState(null);
    const [resolution, setResolution] = useState("");
    const [showMore, setShowMore] = useState(false);
    const [menu, setMenu] = useState(null);

    const resolve = async (status) => {
        if (!modal) return;
        if ((status === "resolved" || status === "dismissed") && resolution.trim().length < 5) {
            toast.info("Please add a resolution note (at least 5 characters)."); return;
        }
        try {
            await adminResolveReport(modal._id, status, resolution);
            toast.success(`Report ${status}`);
            setModal(null); setResolution(""); reload();
        } catch (e) { toast.error(e.response?.data?.message || "Action failed"); }
    };

    // Quick status change from the three-dot menu. Only "under_review" can fire
    // directly; resolving/dismissing require a note, so they open the modal.
    const quickAction = async (r, status) => {
        setMenu(null);
        try {
            await adminResolveReport(r._id, status, "");
            toast.success(`Report ${status.replace(/_/g, " ")}`);
            reload();
        } catch (e) { toast.error(e.response?.data?.message || "Action failed"); }
    };

    const copyId = (r) => {
        setMenu(null);
        try { navigator.clipboard.writeText(r._id); toast.success("Report ID copied"); }
        catch { toast.info(r._id); }
    };

    const openModal = (r) => { setModal(r); setResolution(r.resolution || ""); };

    const exportCsv = () => {
        if (!items.length) { toast.info("Nothing to export"); return; }
        const head = ["Type", "Reporter", "Against", "Priority", "Status", "Filed"];
        const lines = items.map((r) => [
            TYPE_LABEL[r.reportType] || r.reportType, r.reporter_id?.name || "", r.against_id?.name || "",
            r.priority, r.status, fmtDateTime(r.createdAt),
        ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
        const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "safety-reports.csv"; a.click();
        URL.revokeObjectURL(url);
    };

    const st = stats || {};

    return (
        <div>
            <div className="adm-stats">
                <StatCard icon={Ico.file} value={loading ? "—" : (st.total ?? 0)} label="Total Reports" sub="vs last 30 days" />
                <StatCard icon={Ico.flag} value={loading ? "—" : (st.open ?? 0)} label="Open" sub="vs last 30 days" />
                <StatCard icon={Ico.eye} value={loading ? "—" : (st.underReview ?? 0)} label="Under Review" sub="vs last 30 days" />
                <StatCard icon={Ico.check} value={loading ? "—" : (st.resolved ?? 0)} label="Resolved" sub="vs last 30 days" />
                <StatCard icon={Ico.sos} value={loading ? "—" : (st.sosActive ?? 0)} label="Active SOS" sub="needs attention" />
            </div>

            <Toolbar params={params} setParam={setParam} types showMore={showMore} setShowMore={setShowMore} onExport={exportCsv}
                placeholder="Search reports by type, reporter, location, or ID…" />

            <div className="adm-table-card">
                {loading ? (
                    <div style={{ padding: "1rem" }}><div className="adm-skel" /><div className="adm-skel" /><div className="adm-skel" /></div>
                ) : items.length === 0 ? (
                    <div className="adm-rides-empty">
                        <div className="adm-rides-empty-illu">{Ico.shield}</div>
                        <div className="adm-rides-empty-title">No reports found</div>
                        <div className="adm-rides-empty-text">You're all caught up. There are no safety reports matching your filters.</div>
                        <button className="adm-btn primary" onClick={() => setParam({ q: "", status: "All", type: "All" })}>⛃ Clear Filters</button>
                    </div>
                ) : (
                    <>
                        <div className="adm-table-wrap">
                            <table className="adm-table">
                                <thead><tr><th>Type</th><th>Reporter</th><th>Against</th><th>Priority</th><th>Status</th><th>Filed</th><th>Actions</th></tr></thead>
                                <tbody>
                                    {items.map((r) => (
                                        <tr key={r._id}>
                                            <td>
                                                <div className="adm-type-cell">
                                                    <span className="adm-type-icon">{Ico.shield}</span>
                                                    <span className="adm-cell-stack"><span style={{ fontWeight: 700 }}>{TYPE_LABEL[r.reportType] || r.reportType}</span><span className="adm-cell-sub">Report</span></span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="adm-user-cell">
                                                    <span className="adm-cell-avatar">{initialsOf(r.reporter_id?.name)}</span>
                                                    <span className="adm-cell-id"><span className="adm-cell-name">{r.reporter_id?.name || "—"}</span><span className="adm-cell-username">{r.reporter_id?.email || ""}</span></span>
                                                </div>
                                            </td>
                                            <td>{r.against_id?.name || "—"}</td>
                                            <td><PriorityBadge p={r.priority} /></td>
                                            <td><Badge value={r.status} tone={STATUS_TONE[r.status]} /></td>
                                            <td>
                                                <span className="adm-cell-stack"><span>{new Date(r.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span><span className="adm-cell-sub">{new Date(r.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span></span>
                                            </td>
                                            <td>
                                                <div className="adm-btn-row" style={{ alignItems: "center" }}>
                                                    <button className="adm-btn" onClick={() => openModal(r)}>Review</button>
                                                    <button className="adm-icon-btn adm-dots" onClick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); setMenu({ row: r, x: rect.right, y: rect.bottom }); }} aria-label="More">{Ico.dots}</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Footer meta={meta} setPage={setPage} />
                    </>
                )}
            </div>

            {/* Three-dot quick-actions menu */}
            {menu && (
                <>
                    <div className="adm-menu-backdrop" onClick={() => setMenu(null)} />
                    <div className="adm-menu" style={{ top: menu.y + 4, left: Math.max(8, menu.x - 200) }}>
                        <button onClick={() => { openModal(menu.row); setMenu(null); }}>👁 Open Review</button>
                        {menu.row.status !== "under_review" && <button onClick={() => quickAction(menu.row, "under_review")}>🔎 Mark Under Review</button>}
                        {menu.row.status !== "resolved" && <button onClick={() => { openModal(menu.row); setMenu(null); }}>✓ Resolve…</button>}
                        {menu.row.status !== "dismissed" && <button className="danger" onClick={() => { openModal(menu.row); setMenu(null); }}>🗑 Dismiss…</button>}
                        <button onClick={() => copyId(menu.row)}>⧉ Copy Report ID</button>
                    </div>
                </>
            )}

            {/* Review modal */}
            {modal && (
                <Modal size="lg" onClose={() => { setModal(null); setResolution(""); }}
                    actions={
                        <>
                            <button className="adm-btn" onClick={() => { setModal(null); setResolution(""); }}>✕ Cancel</button>
                            <button className="adm-btn" onClick={() => resolve("dismissed")}>🗑 Dismiss</button>
                            <button className="adm-btn success" onClick={() => resolve("resolved")}>✓ Resolve</button>
                        </>
                    }>
                    <div className="adm-ud-head">
                        <span className="adm-ud-head-icon" style={{ background: "rgba(244,63,94,0.16)", color: "#fca5a5", borderColor: "rgba(244,63,94,0.3)" }}>{Ico.sos}</span>
                        <div>
                            <div className="adm-ud-title">Report: {TYPE_LABEL[modal.reportType] || modal.reportType}</div>
                            <div className="adm-ud-subtitle">Review the details and take appropriate action.</div>
                        </div>
                    </div>

                    <div className="adm-rpt-grid">
                        <div className="adm-rpt-card">
                            <div className="adm-rpt-sec">📋 Report Details</div>
                            <div className="adm-rpt-row">
                                <span className="adm-rpt-label">Reporter</span>
                                <span className="adm-rpt-reporter">
                                    <span className="adm-cell-avatar">{initialsOf(modal.reporter_id?.name)}</span>
                                    <span className="adm-cell-stack"><span style={{ fontWeight: 700 }}>{modal.reporter_id?.name || "—"}</span><span className="adm-cell-sub">{modal.reporter_id?.email || ""}</span></span>
                                </span>
                            </div>
                            <div className="adm-rpt-row"><span className="adm-rpt-label">Reason</span><span>{modal.reason || "—"}</span></div>
                            <div className="adm-rpt-row"><span className="adm-rpt-label">Priority</span><span><PriorityBadge p={modal.priority} /></span></div>
                            <div className="adm-rpt-row"><span className="adm-rpt-label">Status</span><span><Badge value={modal.status} tone={STATUS_TONE[modal.status]} /></span></div>
                            <div className="adm-rpt-row"><span className="adm-rpt-label">Filed On</span><span>📅 {fmtDateTime(modal.createdAt)}</span></div>
                            {modal.against_id && <div className="adm-rpt-row"><span className="adm-rpt-label">Against</span><span>{modal.against_id?.name}</span></div>}
                            {modal.ride_id && <div className="adm-rpt-row"><span className="adm-rpt-label">Ride</span><span>{modal.ride_id.source} → {modal.ride_id.destination}</span></div>}
                        </div>

                        <div className="adm-rpt-card">
                            <div className="adm-rpt-sec">📄 Description</div>
                            <p style={{ fontSize: "0.84rem", color: "#d4d4d8", lineHeight: 1.5, minHeight: "2.4rem" }}>{modal.description || "No description provided."}</p>
                            {modal.evidence?.length > 0 && (
                                <div style={{ marginTop: "0.5rem" }}>
                                    {modal.evidence.map((url, i) => <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd", display: "block", fontSize: "0.82rem" }}>Attachment {i + 1} ↗</a>)}
                                </div>
                            )}
                            <div className="adm-confidential">
                                <span className="adm-confidential-icon">ℹ</span>
                                <div>
                                    <strong>Keep reports confidential</strong>
                                    <span>All report details are confidential and visible only to authorized admins.</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="adm-rpt-resolution">
                        <div className="adm-rpt-sec">✏️ Resolution Note <span className="adm-muted">(required to resolve/dismiss · visible to reporter)</span></div>
                        <div className="adm-textarea-wrap">
                            <textarea className="adm-textarea" maxLength={1000} placeholder="Add a resolution note. This will be visible to the reporter…" value={resolution} onChange={(e) => setResolution(e.target.value)} />
                            <span className="adm-char-count">{resolution.length}/1000</span>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

/* ---------------- SOS Events ---------------- */
const SosEvents = () => {
    const { items, meta, loading, params, setParam, setPage, reload } = useAdminList(adminSosEvents, {});
    const [modal, setModal] = useState(null);
    const [notes, setNotes] = useState("");
    const [showMore, setShowMore] = useState(false);

    const update = async (status) => {
        if (!modal) return;
        if ((status === "resolved" || status === "false_alarm") && notes.trim().length < 5) {
            toast.info("Please add a note (at least 5 characters)."); return;
        }
        try {
            await adminUpdateSos(modal._id, status, notes);
            toast.success(`SOS ${status.replace(/_/g, " ")}`);
            setModal(null); setNotes(""); reload();
        } catch (e) { toast.error(e.response?.data?.message || "Action failed"); }
    };

    const exportCsv = () => {
        if (!items.length) { toast.info("Nothing to export"); return; }
        const head = ["User", "Phone", "Destination", "Status", "Triggered"];
        const lines = items.map((r) => [
            r.user_id?.name || "", r.user_id?.phoneNumber || "", r.rideSnapshot?.destination || "", r.status, fmtDateTime(r.createdAt),
        ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
        const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "sos-events.csv"; a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div>
            <Toolbar params={params} setParam={setParam} showMore={showMore} setShowMore={setShowMore} onExport={exportCsv}
                placeholder="Search SOS by user, phone, or destination…" />

            <div className="adm-table-card">
                {loading ? (
                    <div style={{ padding: "1rem" }}><div className="adm-skel" /><div className="adm-skel" /><div className="adm-skel" /></div>
                ) : items.length === 0 ? (
                    <div className="adm-rides-empty">
                        <div className="adm-rides-empty-illu">{Ico.sos}</div>
                        <div className="adm-rides-empty-title">No SOS events</div>
                        <div className="adm-rides-empty-text">No emergency alerts have been triggered.</div>
                    </div>
                ) : (
                    <>
                        <div className="adm-table-wrap">
                            <table className="adm-table">
                                <thead><tr><th>User</th><th>Phone</th><th>Destination</th><th>Status</th><th>Triggered</th><th>Actions</th></tr></thead>
                                <tbody>
                                    {items.map((r) => (
                                        <tr key={r._id}>
                                            <td>
                                                <div className="adm-user-cell">
                                                    <span className="adm-cell-avatar">{initialsOf(r.user_id?.name)}</span>
                                                    <span className="adm-cell-id"><span className="adm-cell-name">{r.user_id?.name || "—"}</span></span>
                                                </div>
                                            </td>
                                            <td><span className="adm-mono">{r.user_id?.phoneNumber || "—"}</span></td>
                                            <td>{r.rideSnapshot?.destination ? `→ ${r.rideSnapshot.destination}` : "—"}</td>
                                            <td><Badge value={r.status} /></td>
                                            <td>{fmtDateTime(r.createdAt)}</td>
                                            <td><button className="adm-btn danger" onClick={() => { setModal(r); setNotes(r.adminNotes || ""); }}>Respond</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Footer meta={meta} setPage={setPage} />
                    </>
                )}
            </div>

            {modal && (
                <Modal title="🚨 SOS Emergency" onClose={() => { setModal(null); setNotes(""); }}
                    actions={
                        <>
                            <button className="adm-btn" onClick={() => update("acknowledged")}>Acknowledge</button>
                            <button className="adm-btn" onClick={() => update("false_alarm")}>False Alarm</button>
                            <button className="adm-btn success" onClick={() => update("resolved")}>Resolve</button>
                        </>
                    }>
                    <div className="adm-kv"><span className="k">User</span><span>{modal.user_id?.name} ({modal.user_id?.phoneNumber})</span></div>
                    <div className="adm-kv"><span className="k">Status</span><span><Badge value={modal.status} /></span></div>
                    <div className="adm-kv"><span className="k">Triggered</span><span>{fmtDateTime(modal.createdAt)}</span></div>
                    {modal.location?.lat && (
                        <div className="adm-kv"><span className="k">Location</span><span><a href={`https://www.google.com/maps?q=${modal.location.lat},${modal.location.lng}`} target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd" }}>View on map ↗</a></span></div>
                    )}
                    {modal.rideSnapshot?.driverName && <div className="adm-kv"><span className="k">Driver</span><span>{modal.rideSnapshot.driverName} ({modal.rideSnapshot.driverPhone})</span></div>}
                    {modal.rideSnapshot?.vehicle && <div className="adm-kv"><span className="k">Vehicle</span><span>{modal.rideSnapshot.vehicle} {modal.rideSnapshot.licensePlate}</span></div>}
                    {modal.rideSnapshot?.destination && <div className="adm-kv"><span className="k">Destination</span><span>{modal.rideSnapshot.destination}</span></div>}
                    {modal.trackingLink && <div className="adm-kv"><span className="k">Tracking</span><span><a href={modal.trackingLink} target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd" }}>Open live link ↗</a></span></div>}
                    <div className="adm-kv"><span className="k">Contacts notified</span><span>{(modal.notifiedContacts || []).length}</span></div>
                    <textarea className="adm-textarea" style={{ marginTop: "0.8rem" }} placeholder="Response notes (required to resolve / mark false alarm)…" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Modal>
            )}
        </div>
    );
};

export default AdminSafety;
