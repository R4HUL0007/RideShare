import React, { useState } from "react";
import { adminAuditLogs } from "../../services/adminService";
import { useAdminList, Modal, fmtDateTime } from "./AdminUI";
import { toast } from "react-toastify";

const initialsOf = (name) =>
    (name || "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "A";

const humanize = (s) => (s || "").replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Icon by action category (prefix before the dot).
const catIcon = (action) => {
    const cat = (action || "").split(".")[0];
    const I = (paths) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>;
    switch (cat) {
        case "user": return { tone: "blue", el: I(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></>) };
        case "safety": return { tone: "green", el: I(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>) };
        case "dispute": return { tone: "amber", el: I(<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></>) };
        case "escrow": case "withdrawal": case "payment": return { tone: "blue", el: I(<><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></>) };
        case "verification": return { tone: "green", el: I(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M9 12l2 2 4-4"></path></>) };
        case "review": return { tone: "amber", el: I(<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>) };
        case "ride": return { tone: "grey", el: I(<><path d="M5 17H4a2 2 0 0 1-2-2v-3.34a2 2 0 0 1 .38-1.17l1.86-2.5A2 2 0 0 1 5.85 7H15l3.5 4.5 1.9.63A2 2 0 0 1 22 14v1a2 2 0 0 1-2 2h-1"></path><circle cx="7" cy="17" r="2"></circle><circle cx="17" cy="17" r="2"></circle></>) };
        default: return { tone: "grey", el: I(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></>) };
    }
};

const AdminAuditLogs = () => {
    const { items, meta, filters, loading, params, setParam, setPage } = useAdminList(adminAuditLogs, {});
    const [showMore, setShowMore] = useState(false);
    const [menu, setMenu] = useState(null);
    const [detail, setDetail] = useState(null);

    const copy = (label, value) => {
        setMenu(null);
        if (value == null || value === "") { toast.info("Nothing to copy"); return; }
        try { navigator.clipboard.writeText(String(value)); toast.success(`${label} copied`); }
        catch { toast.info(String(value)); }
    };

    const exportCsv = () => {
        if (!items.length) { toast.info("Nothing to export"); return; }
        const head = ["Action", "Admin", "Target", "Details", "IP", "Time"];
        const lines = items.map((r) => [
            r.action, r.adminName || "",
            r.targetType ? `${r.targetType} (${String(r.target_id || "").slice(-6)})` : "",
            Object.entries(r.details || {}).map(([k, v]) => `${k}: ${v}`).join("; "),
            r.ip || "", new Date(r.createdAt).toLocaleString(),
        ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
        const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "audit-logs.csv"; a.click();
        URL.revokeObjectURL(url);
    };

    const today = new Date();
    const from = new Date(); from.setDate(today.getDate() - 29);
    const opt = { day: "numeric", month: "short" };
    const rangeLabel = `${from.toLocaleDateString(undefined, opt)} – ${today.toLocaleDateString(undefined, { ...opt, year: "numeric" })}`;

    const f = filters || {};

    return (
        <div>
            {/* Toolbar */}
            <div className="adm-toolbar">
                <div className="adm-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input placeholder="Search by action, admin, target, IP…" value={params.q || ""} onChange={(e) => setParam({ q: e.target.value })} />
                </div>
                <span className="adm-date-pill">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    {rangeLabel}
                </span>
                <select className="adm-select" value={params.action || "All"} onChange={(e) => setParam({ action: e.target.value })}>
                    <option value="All">All Actions</option>
                    {(f.actions || []).map((a) => <option key={a} value={a}>{humanize(a)}</option>)}
                </select>
                <select className="adm-select" value={params.admin || "All"} onChange={(e) => setParam({ admin: e.target.value })}>
                    <option value="All">All Admins</option>
                    {(f.admins || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button className={`adm-btn ${showMore ? "primary" : ""}`} onClick={() => setShowMore((v) => !v)}>⛃ More Filters</button>
                <div className="adm-toolbar-spacer" />
                <button className="adm-btn primary" onClick={exportCsv}>⤓ Export Logs</button>
            </div>

            {showMore && (
                <div className="adm-morefilters">
                    <span className="adm-muted">Refine results</span>
                    <button className="adm-btn" onClick={() => setParam({ q: "", action: "All", admin: "All" })}>Clear all filters</button>
                </div>
            )}

            {/* Table */}
            <div className="adm-table-card">
                {loading ? (
                    <div style={{ padding: "1rem" }}><div className="adm-skel" /><div className="adm-skel" /><div className="adm-skel" /></div>
                ) : items.length === 0 ? (
                    <div className="adm-rides-empty">
                        <div className="adm-rides-empty-illu">
                            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="13" y2="17"></line></svg>
                        </div>
                        <div className="adm-rides-empty-title">No audit logs yet</div>
                        <div className="adm-rides-empty-text">Admin actions will appear here as they happen.</div>
                    </div>
                ) : (
                    <>
                        <div className="adm-table-wrap">
                            <table className="adm-table">
                                <thead>
                                    <tr><th>Action</th><th>Admin</th><th>Target</th><th>Details</th><th>IP Address</th><th>Time</th><th></th></tr>
                                </thead>
                                <tbody>
                                    {items.map((r) => {
                                        const ic = catIcon(r.action);
                                        const detailEntries = Object.entries(r.details || {});
                                        const [dk, dv] = detailEntries[0] || [];
                                        return (
                                            <tr key={r._id}>
                                                <td>
                                                    <div className="adm-type-cell">
                                                        <span className={`adm-type-icon adm-escrow-icon ${ic.tone}`}>{ic.el}</span>
                                                        <span className="adm-cell-stack"><span style={{ fontWeight: 700 }}>{r.action}</span><span className="adm-cell-sub">{humanize(r.action)}</span></span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="adm-user-cell">
                                                        <span className="adm-cell-avatar">{initialsOf(r.adminName)}</span>
                                                        <span className="adm-cell-id"><span className="adm-cell-name">{r.adminName || "—"}</span><span className="adm-admin-tag">ADMIN</span></span>
                                                    </div>
                                                </td>
                                                <td>
                                                    {r.targetType ? (
                                                        <span className="adm-cell-stack"><span className="adm-mono">{r.targetType} ({String(r.target_id || "").slice(-6)})</span><span className="adm-cell-sub" style={{ textTransform: "capitalize" }}>{r.targetType}</span></span>
                                                    ) : "—"}
                                                </td>
                                                <td>
                                                    {dk ? (
                                                        <span className="adm-cell-stack"><span className="adm-badge blue" style={{ width: "fit-content" }}>{dk}</span><span className="adm-cell-sub">{String(dv)}</span></span>
                                                    ) : "—"}
                                                </td>
                                                <td><span className="adm-mono">{r.ip || "—"}</span></td>
                                                <td>
                                                    <span className="adm-cell-stack"><span>{new Date(r.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span><span className="adm-cell-sub">{new Date(r.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span></span>
                                                </td>
                                                <td><button className="adm-icon-btn adm-dots" onClick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); setMenu({ row: r, x: rect.right, y: rect.bottom }); }} aria-label="More">⋮</button></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="adm-table-foot">
                            <div className="adm-foot-pager" style={{ margin: "0 auto" }}>
                                <button className="adm-btn" disabled={!meta || meta.page <= 1} onClick={() => setPage((meta?.page || 1) - 1)}>← Prev</button>
                                <span className="adm-foot-info">Page {meta?.page || 1} of {meta?.pages || 1} · {meta?.total || 0} total</span>
                                <button className="adm-btn" disabled={!meta || meta.page >= meta.pages} onClick={() => setPage((meta?.page || 1) + 1)}>Next →</button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Three-dot menu (logs are immutable — read-only utilities) */}
            {menu && (
                <>
                    <div className="adm-menu-backdrop" onClick={() => setMenu(null)} />
                    <div className="adm-menu" style={{ top: menu.y + 4, left: Math.max(8, menu.x - 200) }}>
                        <button onClick={() => { setDetail(menu.row); setMenu(null); }}>👁 View Details</button>
                        <button onClick={() => copy("Log ID", menu.row._id)}>⧉ Copy Log ID</button>
                        {menu.row.target_id && <button onClick={() => copy("Target ID", menu.row.target_id)}>⧉ Copy Target ID</button>}
                        {menu.row.ip && <button onClick={() => copy("IP address", menu.row.ip)}>🌐 Copy IP</button>}
                        <button onClick={() => copy("Log JSON", JSON.stringify(menu.row, null, 2))}>⎘ Copy as JSON</button>
                    </div>
                </>
            )}

            {/* Log detail modal */}
            {detail && (
                <Modal size="lg" onClose={() => setDetail(null)} actions={<button className="adm-btn" onClick={() => setDetail(null)}>Close</button>}>
                    <div className="adm-ud-head">
                        <span className={`adm-ud-head-icon adm-escrow-icon ${catIcon(detail.action).tone}`}>{catIcon(detail.action).el}</span>
                        <div>
                            <div className="adm-ud-title">{detail.action}</div>
                            <div className="adm-ud-subtitle">{humanize(detail.action)} · admin action record</div>
                        </div>
                    </div>

                    <div className="adm-rpt-grid">
                        <div className="adm-rpt-card">
                            <div className="adm-rpt-sec">📋 Action Info</div>
                            <div className="adm-rpt-row">
                                <span className="adm-rpt-label">Admin</span>
                                <span className="adm-rpt-reporter">
                                    <span className="adm-cell-avatar">{initialsOf(detail.adminName)}</span>
                                    <span className="adm-cell-stack"><span style={{ fontWeight: 700 }}>{detail.adminName || "—"}</span><span className="adm-admin-tag">ADMIN</span></span>
                                </span>
                            </div>
                            <div className="adm-rpt-row"><span className="adm-rpt-label">Target</span><span>{detail.targetType ? <span className="adm-mono">{detail.targetType} ({String(detail.target_id || "").slice(-8)})</span> : "—"}</span></div>
                            <div className="adm-rpt-row"><span className="adm-rpt-label">IP Address</span><span className="adm-mono">{detail.ip || "—"}</span></div>
                            <div className="adm-rpt-row"><span className="adm-rpt-label">Time</span><span>📅 {fmtDateTime(detail.createdAt)}</span></div>
                            <div className="adm-rpt-row"><span className="adm-rpt-label">Log ID</span><span className="adm-mono">{detail._id}</span></div>
                        </div>

                        <div className="adm-rpt-card">
                            <div className="adm-rpt-sec">📄 Details</div>
                            {Object.entries(detail.details || {}).length > 0 ? (
                                Object.entries(detail.details).map(([k, v]) => (
                                    <div className="adm-rpt-row" key={k}><span className="adm-rpt-label" style={{ textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</span><span style={{ textAlign: "right", wordBreak: "break-word" }}>{String(v)}</span></div>
                                ))
                            ) : (
                                <p style={{ fontSize: "0.84rem", color: "#9ca3af", lineHeight: 1.5 }}>No additional details were recorded for this action.</p>
                            )}
                            <div className="adm-confidential">
                                <span className="adm-confidential-icon">ℹ</span>
                                <div>
                                    <strong>Immutable record</strong>
                                    <span>Audit entries are securely logged and cannot be modified or deleted.</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Secure & Traceable strip */}
            <div className="adm-tips" style={{ marginTop: "1.4rem" }}>
                <div className="adm-audit-note">
                    <span className="adm-tip-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    </span>
                    <div className="adm-audit-note-text">
                        <strong>Secure &amp; Traceable</strong>
                        <span>All admin actions are securely logged and cannot be modified or deleted.</span>
                    </div>
                    <a className="adm-link-btn" href="#" onClick={(e) => e.preventDefault()}>Learn more ↗</a>
                </div>
            </div>
        </div>
    );
};

export default AdminAuditLogs;
