import React, { useState, useMemo } from "react";
import { adminUsers, adminUserDetail, adminSetUserStatus, adminSetUserRole, adminDeleteUser } from "../../services/adminService";
import { Badge, Modal, StatCard, useAdminList, fmtDate } from "./AdminUI";
import { toast } from "react-toastify";

// Initials for the avatar circle (e.g. "RM").
const initialsOf = (name) =>
    (name || "")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase() || "U";

const fmtDateTime = (iso) =>
    iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const ratingOf = (r) => r?.ratings?.driver?.average || r?.ratings?.passenger?.average || 0;

const ROLE_LABELS = { super_admin: "Super Admin", moderator: "Moderator", support: "Support", none: "—" };

// Small copy-to-clipboard button used on the detail rows.
const CopyBtn = ({ value }) => (
    <button
        className="adm-copy-btn"
        title="Copy"
        onClick={() => { navigator.clipboard?.writeText(String(value || "")); toast.success("Copied"); }}
    >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
    </button>
);

const AdminUsers = () => {
    const { items, meta, stats, loading, params, setParam, setPage, reload } = useAdminList(adminUsers, {});
    const [detail, setDetail] = useState(null);
    const [actionModal, setActionModal] = useState(null);
    const [reason, setReason] = useState("");
    const [deleteReason, setDeleteReason] = useState("");
    const [deleteModal, setDeleteModal] = useState(null);
    const [roleModal, setRoleModal] = useState(null);
    const [showMore, setShowMore] = useState(false);
    const [sort, setSort] = useState({ key: null, dir: "asc" });
    const [menu, setMenu] = useState(null); // { row, x, y }

    const openDetail = async (id) => {
        try {
            const { data } = await adminUserDetail(id);
            setDetail(data);
        } catch {
            toast.error("Failed to load user detail");
        }
    };

    const handleStatusChange = async () => {
        if (!actionModal) return;
        if (actionModal.status !== "active" && reason.trim().length < 5) {
            toast.info("Please add a reason (at least 5 characters)."); return;
        }
        try {
            await adminSetUserStatus(actionModal.id, actionModal.status, reason);
            toast.success(`User ${actionModal.status} successfully`);
            setActionModal(null);
            setReason("");
            reload();
            if (detail?.user?._id === actionModal.id) setDetail(null);
        } catch (e) {
            toast.error(e.response?.data?.message || "Action failed");
        }
    };

    const handleDelete = async () => {
        if (!deleteModal) return;
        if (deleteReason.trim().length < 5) {
            toast.info("Please add a reason for deletion (at least 5 characters)."); return;
        }
        try {
            await adminDeleteUser(deleteModal.id, deleteReason);
            toast.success("User deleted");
            setDeleteModal(null);
            setDeleteReason("");
            reload();
            if (detail?.user?._id === deleteModal.id) setDetail(null);
        } catch (e) {
            toast.error(e.response?.data?.message || "Delete failed");
        }
    };

    const handleRoleSave = async () => {
        if (!roleModal) return;
        if ((roleModal.reason || "").trim().length < 5) {
            toast.info("Please add a reason for this role change (at least 5 characters)."); return;
        }
        try {
            await adminSetUserRole(roleModal.id, roleModal.isAdmin, roleModal.adminRole, roleModal.reason);
            toast.success("Role updated");
            const savedId = roleModal.id;
            setRoleModal(null);
            reload();
            if (detail?.user?._id === savedId) openDetail(savedId);
        } catch (e) {
            toast.error(e.response?.data?.message || "Failed to update role");
        }
    };

    // Open the ⋮ menu anchored to the clicked button (fixed-positioned to avoid
    // being clipped by the scrolling table).
    const openMenu = (e, row) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMenu({ row, x: rect.right, y: rect.bottom });
    };

    const openRoleModal = (u) => setRoleModal({
        id: u._id, name: u.name, isAdmin: !!u.isAdmin, adminRole: u.adminRole && u.adminRole !== "none" ? u.adminRole : "moderator", reason: "",
    });

    // Client-side sort of the current page (server sorts by join date by default).
    const toggleSort = (key) =>
        setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

    const sortedRows = useMemo(() => {
        if (!sort.key) return items;
        const dir = sort.dir === "asc" ? 1 : -1;
        const val = (r) => {
            switch (sort.key) {
                case "email": return (r.email || "").toLowerCase();
                case "role": return (r.role || "").toLowerCase();
                case "rating": return ratingOf(r);
                case "status": return (r.status || "").toLowerCase();
                case "createdAt": return new Date(r.createdAt || 0).getTime();
                default: return 0;
            }
        };
        return [...items].sort((a, b) => (val(a) > val(b) ? dir : val(a) < val(b) ? -dir : 0));
    }, [items, sort]);

    // Export the currently loaded rows to CSV.
    const exportCsv = () => {
        if (!sortedRows.length) { toast.info("Nothing to export"); return; }
        const head = ["Name", "Username", "Email", "Role", "Rating", "Status", "Joined"];
        const lines = sortedRows.map((r) => [
            r.name, r.username, r.email, r.role,
            ratingOf(r) ? ratingOf(r).toFixed(1) : "",
            r.status, fmtDate(r.createdAt),
        ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
        const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `users-page-${meta?.page || 1}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const clearFilters = () => setParam({ q: "", status: "All", role: "All" });

    const st = stats || {};
    const SortHead = ({ k, children }) => (
        <th>
            <button className="adm-th-sort" onClick={() => toggleSort(k)}>
                {children}
                <span className={`adm-sort-caret ${sort.key === k ? "on" : ""}`}>
                    {sort.key === k ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}
                </span>
            </button>
        </th>
    );

    // The contextual status action buttons for a given user (shared by row + modal).
    const statusButtons = (u, onAfter) => {
        const go = (status) => { onAfter?.(); setActionModal({ id: u._id, status, name: u.name }); };
        const out = [];
        if (u.status === "active" || u.status === "flagged") {
            out.push(<button key="susp" className="adm-btn danger" onClick={() => go("suspended")}>⊘ Suspend</button>);
        }
        if (u.status === "suspended" || u.status === "frozen") {
            out.push(<button key="react" className="adm-btn success" onClick={() => go("active")}>↺ Reactivate</button>);
        }
        if (u.status !== "flagged") {
            out.push(<button key="flag" className="adm-btn" onClick={() => go("flagged")}>⚑ Flag</button>);
        }
        return out;
    };

    return (
        <div>
            {/* Stat cards */}
            <div className="adm-stats">
                <StatCard icon="👥" value={loading ? "—" : (st.total ?? 0)} label="Total Users" sub="All registered" />
                <StatCard icon="🛡️" value={loading ? "—" : (st.active ?? 0)} label="Active Users" sub="Currently active" />
                <StatCard icon="🚫" value={loading ? "—" : (st.blocked ?? 0)} label="Blocked Users" sub="Suspended accounts" />
                <StatCard icon="🧑‍🎓" value={loading ? "—" : (st.newThisMonth ?? 0)} label="New This Month" sub="Joined this month" />
                <StatCard icon="⏳" value={loading ? "—" : (st.pendingVerification ?? 0)} label="Pending Verification" sub="Awaiting review" />
            </div>

            {/* Toolbar */}
            <div className="adm-toolbar">
                <div className="adm-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                        placeholder="Search by name, email, or username…"
                        value={params.q || ""}
                        onChange={(e) => setParam({ q: e.target.value })}
                    />
                    <button className="adm-icon-btn" onClick={reload} aria-label="Refresh" title="Refresh">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                        </svg>
                    </button>
                </div>
                <select className="adm-select" value={params.status || "All"} onChange={(e) => setParam({ status: e.target.value })}>
                    <option value="All">All Status</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="frozen">Frozen</option>
                    <option value="flagged">Flagged</option>
                </select>
                <select className="adm-select" value={params.role || "All"} onChange={(e) => setParam({ role: e.target.value })}>
                    <option value="All">All Roles</option>
                    <option value="Student">Student</option>
                    <option value="Faculty">Faculty</option>
                </select>
                <button className={`adm-btn ${showMore ? "primary" : ""}`} onClick={() => setShowMore((v) => !v)}>
                    ⛃ More Filters
                </button>
                <div className="adm-toolbar-spacer" />
                <button className="adm-btn" onClick={exportCsv}>⤓ Export</button>
            </div>

            {showMore && (
                <div className="adm-morefilters">
                    <span className="adm-muted">Refine results</span>
                    <button className="adm-btn" onClick={clearFilters}>Clear all filters</button>
                </div>
            )}

            {/* Table */}
            <div className="adm-table-card">
                <div className="adm-table-wrap">
                    <table className="adm-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <SortHead k="email">Email</SortHead>
                                <SortHead k="role">Role</SortHead>
                                <SortHead k="rating">Rating</SortHead>
                                <SortHead k="status">Status</SortHead>
                                <SortHead k="createdAt">Joined</SortHead>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7}><div className="adm-skel" /><div className="adm-skel" /><div className="adm-skel" /></td></tr>
                            ) : sortedRows.length === 0 ? (
                                <tr><td colSpan={7}><div className="adm-empty"><span style={{ fontSize: "1.8rem" }}>📭</span><span>No users found.</span></div></td></tr>
                            ) : sortedRows.map((r) => {
                                const rating = ratingOf(r);
                                return (
                                    <tr key={r._id}>
                                        <td>
                                            <div className="adm-user-cell">
                                                <span className="adm-cell-avatar">{initialsOf(r.name)}</span>
                                                <span className="adm-cell-id">
                                                    <span className="adm-cell-name">{r.name}{r.isAdmin && <span className="adm-admin-tag">ADMIN</span>}</span>
                                                    <span className="adm-cell-username">@{r.username}</span>
                                                </span>
                                            </div>
                                        </td>
                                        <td><span className="adm-mono">{r.email}</span></td>
                                        <td><Badge value={r.role} tone="blue" /></td>
                                        <td>
                                            {rating > 0 ? (
                                                <span>⭐ {rating.toFixed(1)}</span>
                                            ) : (
                                                <span className="adm-cell-stack"><span>—</span><span className="adm-cell-sub">No rides yet</span></span>
                                            )}
                                        </td>
                                        <td><Badge value={r.status} /></td>
                                        <td>
                                            <span className="adm-cell-stack">
                                                <span>{fmtDate(r.createdAt)}</span>
                                                <span className="adm-cell-sub">{new Date(r.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                                            </span>
                                        </td>
                                        <td>
                                            <div className="adm-btn-row">
                                                <button className="adm-btn" onClick={() => openDetail(r._id)}>👁 View</button>
                                                {statusButtons(r)}
                                                <button className="adm-icon-btn adm-dots" onClick={(e) => openMenu(e, r)} aria-label="More actions" title="More actions">⋮</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="adm-table-foot">
                    <div className="adm-foot-pager">
                        <button className="adm-btn" disabled={!meta || meta.page <= 1} onClick={() => setPage((meta?.page || 1) - 1)}>← Prev</button>
                        <span className="adm-foot-info">Page {meta?.page || 1} of {meta?.pages || 1} · {meta?.total || 0} total</span>
                        <button className="adm-btn" disabled={!meta || meta.page >= meta.pages} onClick={() => setPage((meta?.page || 1) + 1)}>Next →</button>
                    </div>
                    <div className="adm-foot-rows">
                        <span className="adm-muted">Rows per page</span>
                        <select className="adm-select" value={params.limit || 20} onChange={(e) => setParam({ limit: Number(e.target.value) })}>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Row ⋮ dropdown menu */}
            {menu && (
                <>
                    <div className="adm-menu-backdrop" onClick={() => setMenu(null)} />
                    <div className="adm-menu" style={{ top: menu.y + 4, left: Math.max(8, menu.x - 180) }}>
                        <button onClick={() => { openRoleModal(menu.row); setMenu(null); }}>🛡️ Manage Role</button>
                        {menu.row.status !== "frozen" ? (
                            <button onClick={() => { setActionModal({ id: menu.row._id, status: "frozen", name: menu.row.name }); setMenu(null); }}>❄ Freeze</button>
                        ) : (
                            <button onClick={() => { setActionModal({ id: menu.row._id, status: "active", name: menu.row.name }); setMenu(null); }}>☀ Unfreeze</button>
                        )}
                        <button className="danger" onClick={() => { setDeleteModal({ id: menu.row._id, name: menu.row.name }); setMenu(null); }}>🗑 Delete</button>
                    </div>
                </>
            )}

            {/* User Detail Modal — "User Details" layout */}
            {detail && (() => {
                const u = detail.user || {};
                const idShort = `usr_${String(u._id || "").slice(-12)}`;
                return (
                    <Modal size="lg" onClose={() => setDetail(null)}>
                        <div className="adm-ud-head">
                            <span className="adm-ud-head-icon">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                </svg>
                            </span>
                            <div>
                                <div className="adm-ud-title">User Details</div>
                                <div className="adm-ud-subtitle">View and manage user information</div>
                            </div>
                        </div>

                        <div className="adm-ud-grid">
                            {/* Left profile column */}
                            <div className="adm-ud-profile">
                                <div className="adm-ud-avatar-wrap">
                                    <span className="adm-ud-avatar">{initialsOf(u.name)}</span>
                                    {u.status === "active" && <span className="adm-ud-avatar-dot" />}
                                </div>
                                <div className="adm-ud-name">{u.name}</div>
                                <span className="adm-ud-rolebadge">🎓 {u.role}</span>

                                <div className="adm-ud-infocards">
                                    <div className="adm-ud-infocard">
                                        <span className="adm-ud-infocard-icon">📅</span>
                                        <div>
                                            <div className="adm-ud-infocard-label">Joined On</div>
                                            <div className="adm-ud-infocard-val">{fmtDateTime(u.createdAt)}</div>
                                        </div>
                                    </div>
                                    <div className="adm-ud-infocard">
                                        <span className="adm-ud-infocard-icon">🛡️</span>
                                        <div>
                                            <div className="adm-ud-infocard-label">Account Status</div>
                                            <div className="adm-ud-infocard-val"><Badge value={u.status} /></div>
                                        </div>
                                    </div>
                                    <div className="adm-ud-infocard">
                                        <span className="adm-ud-infocard-icon">🧑‍💼</span>
                                        <div>
                                            <div className="adm-ud-infocard-label">Admin Access</div>
                                            <div className="adm-ud-infocard-val">{u.isAdmin ? `Yes · ${ROLE_LABELS[u.adminRole] || "Admin"}` : "No"}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right detail rows */}
                            <div className="adm-ud-rows">
                                <div className="adm-ud-row">
                                    <span className="adm-ud-row-icon">✉</span><span className="adm-ud-row-label">Email</span>
                                    <span className="adm-ud-row-val">{u.email}</span><CopyBtn value={u.email} />
                                </div>
                                <div className="adm-ud-row">
                                    <span className="adm-ud-row-icon">👤</span><span className="adm-ud-row-label">Username</span>
                                    <span className="adm-ud-row-val">{u.username}</span><CopyBtn value={u.username} />
                                </div>
                                <div className="adm-ud-row">
                                    <span className="adm-ud-row-icon">💼</span><span className="adm-ud-row-label">Role</span>
                                    <span className="adm-ud-row-val"><Badge value={u.role} tone="blue" /></span>
                                </div>
                                <div className="adm-ud-row">
                                    <span className="adm-ud-row-icon">⚧</span><span className="adm-ud-row-label">Gender</span>
                                    <span className="adm-ud-row-val">{u.gender}</span>
                                </div>
                                <div className="adm-ud-row">
                                    <span className="adm-ud-row-icon">📞</span><span className="adm-ud-row-label">Phone</span>
                                    <span className="adm-ud-row-val">{u.phoneNumber || "—"}</span>{u.phoneNumber && <CopyBtn value={u.phoneNumber} />}
                                </div>
                                <div className="adm-ud-row">
                                    <span className="adm-ud-row-icon">📈</span><span className="adm-ud-row-label">Status</span>
                                    <span className="adm-ud-row-val"><Badge value={u.status} /></span>
                                </div>
                                <div className="adm-ud-row">
                                    <span className="adm-ud-row-icon">🛡️</span><span className="adm-ud-row-label">Admin</span>
                                    <span className="adm-ud-row-val">{u.isAdmin ? `Yes · ${ROLE_LABELS[u.adminRole] || "Admin"}` : "No"}</span>
                                </div>
                                <div className="adm-ud-row">
                                    <span className="adm-ud-row-icon">⭐</span><span className="adm-ud-row-label">Driver Rating</span>
                                    <span className="adm-ud-row-val">⭐ {u.ratings?.driver?.average?.toFixed(1) || "0.0"} ({u.ratings?.driver?.count || 0} reviews)</span>
                                </div>
                                <div className="adm-ud-row">
                                    <span className="adm-ud-row-icon">⭐</span><span className="adm-ud-row-label">Passenger Rating</span>
                                    <span className="adm-ud-row-val">⭐ {u.ratings?.passenger?.average?.toFixed(1) || "0.0"} ({u.ratings?.passenger?.count || 0} reviews)</span>
                                </div>
                                <div className="adm-ud-row">
                                    <span className="adm-ud-row-icon">📅</span><span className="adm-ud-row-label">Joined</span>
                                    <span className="adm-ud-row-val">{fmtDateTime(u.createdAt)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="adm-ud-foot">
                            <span className="adm-ud-id">User ID: {idShort}</span>
                            <div className="adm-ud-foot-actions">
                                <button className="adm-btn" onClick={() => openRoleModal(u)}>🛡️ Manage Role</button>
                                {u.status !== "frozen" ? (
                                    <button className="adm-btn" onClick={() => setActionModal({ id: u._id, status: "frozen", name: u.name })}>❄ Freeze</button>
                                ) : (
                                    <button className="adm-btn success" onClick={() => setActionModal({ id: u._id, status: "active", name: u.name })}>☀ Unfreeze</button>
                                )}
                                {statusButtons(u)}
                                <button className="adm-btn danger" onClick={() => setDeleteModal({ id: u._id, name: u.name })}>🗑 Delete</button>
                            </div>
                        </div>
                    </Modal>
                );
            })()}

            {/* Status change confirmation */}
            {actionModal && (
                <Modal
                    title={`${actionModal.status === "active" ? "Reactivate" : actionModal.status === "flagged" ? "Flag" : actionModal.status === "frozen" ? "Freeze" : "Suspend"} ${actionModal.name}?`}
                    onClose={() => { setActionModal(null); setReason(""); }}
                    actions={
                        <>
                            <button className="adm-btn" onClick={() => { setActionModal(null); setReason(""); }}>Cancel</button>
                            <button className={`adm-btn ${actionModal.status === "active" ? "success" : "danger"}`} onClick={handleStatusChange}>
                                Confirm
                            </button>
                        </>
                    }
                >
                    <textarea
                        className="adm-textarea"
                        placeholder={actionModal.status === "active" ? "Reason (optional)…" : "Reason (required, at least 5 characters)…"}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                    />
                </Modal>
            )}

            {/* Delete confirmation */}
            {deleteModal && (
                <Modal
                    title={`Delete ${deleteModal.name}?`}
                    onClose={() => { setDeleteModal(null); setDeleteReason(""); }}
                    actions={
                        <>
                            <button className="adm-btn" onClick={() => { setDeleteModal(null); setDeleteReason(""); }}>Cancel</button>
                            <button className="adm-btn danger" onClick={handleDelete}>Delete permanently</button>
                        </>
                    }
                >
                    <p style={{ fontSize: "0.85rem", color: "#d4d4d8", lineHeight: 1.5 }}>
                        This permanently removes the account and its verification record. This action cannot be undone.
                    </p>
                    <textarea
                        className="adm-textarea"
                        style={{ marginTop: "0.7rem" }}
                        placeholder="Reason for deletion (required, at least 5 characters)…"
                        value={deleteReason}
                        onChange={(e) => setDeleteReason(e.target.value)}
                    />
                </Modal>
            )}

            {/* Manage role */}
            {roleModal && (
                <Modal
                    title={`Manage Role · ${roleModal.name}`}
                    onClose={() => setRoleModal(null)}
                    actions={
                        <>
                            <button className="adm-btn" onClick={() => setRoleModal(null)}>Cancel</button>
                            <button className="adm-btn primary" onClick={handleRoleSave}>Save</button>
                        </>
                    }
                >
                    <label className="adm-role-toggle">
                        <input
                            type="checkbox"
                            checked={roleModal.isAdmin}
                            onChange={(e) => setRoleModal((m) => ({ ...m, isAdmin: e.target.checked }))}
                        />
                        <span>Grant admin access</span>
                    </label>
                    {roleModal.isAdmin && (
                        <div style={{ marginTop: "0.9rem" }}>
                            <div className="adm-muted" style={{ marginBottom: "0.4rem" }}>Admin role</div>
                            <select
                                className="adm-select"
                                style={{ width: "100%" }}
                                value={roleModal.adminRole}
                                onChange={(e) => setRoleModal((m) => ({ ...m, adminRole: e.target.value }))}
                            >
                                <option value="super_admin">Super Admin — full access</option>
                                <option value="moderator">Moderator — manage content & users</option>
                                <option value="support">Support — view & assist</option>
                            </select>
                        </div>
                    )}
                    <div style={{ marginTop: "0.9rem" }}>
                        <div className="adm-muted" style={{ marginBottom: "0.4rem" }}>Reason (required, at least 5 characters)</div>
                        <textarea
                            className="adm-textarea"
                            placeholder="Why are you changing this user's role?…"
                            value={roleModal.reason || ""}
                            onChange={(e) => setRoleModal((m) => ({ ...m, reason: e.target.value }))}
                        />
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default AdminUsers;
