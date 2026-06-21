import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminTicketList, adminTicketGet, adminTicketReply, adminTicketUpdate, adminTicketClear, adminTicketDelete } from "../../services/supportService";
import { StatCard, Badge, Modal, fmtDateTime } from "./AdminUI";
import { toast } from "react-toastify";

const initialsOf = (name) =>
    (name || "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "U";

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

const STATUS_TONE = { open: "amber", in_progress: "blue", closed: "green" };
const STATUS_LABEL = { open: "Open", in_progress: "In Progress", closed: "Closed" };

// Pre-fixed quick replies the agent can send with one click.
const CANNED = [
    "Hi! Thanks for reaching out. How can I help you today?",
    "Sorry for the inconvenience you're facing.",
    "Could you share a few more details, please?",
    "I'm looking into this right now — one moment.",
    "Thanks for your patience!",
    "This has been resolved. Is there anything else?",
    "You're welcome! Have a great day. 😊",
];

const Ico = {
    mail: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-10 5L2 7"></path></svg>,
    inbox: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>,
    clock: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    check: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
    reply: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>,
};

const AdminTickets = () => {
    const [items, setItems] = useState([]);
    const [stats, setStats] = useState({});
    const [statusFilter, setStatusFilter] = useState("All");
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(true);
    const [activeId, setActiveId] = useState(null);
    const [active, setActive] = useState(null);
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const bodyRef = useRef(null);
    const activeIdRef = useRef(null);
    activeIdRef.current = activeId;

    const fetchList = useCallback(async () => {
        try {
            const { data } = await adminTicketList(statusFilter === "All" ? {} : { status: statusFilter });
            setItems(data.items || []);
            setStats(data.stats || {});
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [statusFilter]);

    useEffect(() => {
        fetchList();
        const t = setInterval(fetchList, 12000);
        return () => clearInterval(t);
    }, [fetchList]);

    // Poll the open ticket thread.
    useEffect(() => {
        if (!activeId) return;
        const poll = async () => {
            try {
                const { data } = await adminTicketGet(activeId);
                if (data && data._id === activeIdRef.current) setActive(data);
            } catch { /* ignore */ }
        };
        poll();
        const t = setInterval(poll, 4000);
        return () => clearInterval(t);
    }, [activeId]);

    useEffect(() => {
        bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
    }, [active?.messages?.length]);

    const filtered = useMemo(() => {
        if (!q) return items;
        const s = q.toLowerCase();
        return items.filter((it) =>
            (it.name || "").toLowerCase().includes(s) ||
            (it.email || "").toLowerCase().includes(s) ||
            (it.topic || "").toLowerCase().includes(s) ||
            (it.description || "").toLowerCase().includes(s));
    }, [items, q]);

    const openThread = (t) => { setActiveId(t._id); setActive(t); };
    const closeThread = () => { setActiveId(null); setActive(null); fetchList(); };

    const send = async (msg) => {
        const t = (msg ?? text).trim();
        if (!t || !activeId) return;
        setBusy(true);
        try {
            const { data } = await adminTicketReply(activeId, t);
            setActive(data); setText(""); fetchList();
        } catch (e) {
            toast.error(e.response?.data?.message || "Couldn't send reply");
        } finally { setBusy(false); }
    };

    const setStatus = async (status) => {
        if (!activeId) return;
        setBusy(true);
        try {
            const { data } = await adminTicketUpdate(activeId, { status });
            setActive(data); fetchList();
            toast.success(`Marked ${STATUS_LABEL[status] || status}`);
        } catch (e) {
            toast.error(e.response?.data?.message || "Couldn't update ticket");
        } finally { setBusy(false); }
    };

    const clearChat = async () => {
        if (!activeId) return;
        if (!window.confirm("Clear this conversation? The messages will be removed but the ticket stays.")) return;
        setBusy(true);
        try {
            const { data } = await adminTicketClear(activeId);
            setActive(data); fetchList();
            toast.success("Conversation cleared");
        } catch (e) {
            toast.error(e.response?.data?.message || "Couldn't clear chat");
        } finally { setBusy(false); }
    };

    const deleteTicket = async () => {
        if (!activeId) return;
        if (!window.confirm("Delete this ticket permanently? This can't be undone.")) return;
        setBusy(true);
        try {
            await adminTicketDelete(activeId);
            toast.success("Ticket deleted");
            closeThread();
        } catch (e) {
            toast.error(e.response?.data?.message || "Couldn't delete ticket");
        } finally { setBusy(false); }
    };

    const mailtoHref = (t) => {
        if (!t) return "#";
        const subject = encodeURIComponent(`Re: ${t.topic}`);
        const body = encodeURIComponent(`Hi ${t.name || ""},\n\n\n\n— RidexShare Support`);
        return `mailto:${t.email}?subject=${subject}&body=${body}`;
    };

    return (
        <div>
            {/* Stat cards */}
            <div className="adm-stats">
                <StatCard icon={Ico.inbox} value={loading ? "—" : (stats.total ?? 0)} label="Total Tickets" sub="all time" />
                <StatCard icon={Ico.mail} value={loading ? "—" : (stats.open ?? 0)} label="Open" sub="awaiting response" />
                <StatCard icon={Ico.clock} value={loading ? "—" : (stats.inProgress ?? 0)} label="In Progress" sub="being handled" />
                <StatCard icon={Ico.check} value={loading ? "—" : (stats.closed ?? 0)} label="Closed" sub="resolved" />
            </div>

            {/* Toolbar */}
            <div className="adm-toolbar">
                <select className="adm-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="All">All Statuses</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="closed">Closed</option>
                </select>
                <div className="adm-toolbar-spacer" />
                <div className="adm-search" style={{ flex: "0 0 18rem" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input placeholder="Search by name, email or topic…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
            </div>

            {/* Table */}
            <div className="adm-table-card">
                {loading ? (
                    <div style={{ padding: "1rem" }}><div className="adm-skel" /><div className="adm-skel" /><div className="adm-skel" /></div>
                ) : filtered.length === 0 ? (
                    <div className="adm-empty"><span style={{ fontSize: "1.8rem" }}>📭</span><span>No support tickets{statusFilter !== "All" ? ` (${STATUS_LABEL[statusFilter] || statusFilter})` : ""} yet.</span></div>
                ) : (
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead>
                                <tr><th>From</th><th>Topic</th><th>Handled by</th><th>Status</th><th>Last update</th><th></th></tr>
                            </thead>
                            <tbody>
                                {filtered.map((t) => (
                                    <tr key={t._id}>
                                        <td>
                                            <div className="adm-user-cell">
                                                <span className="adm-cell-avatar">{initialsOf(t.name)}</span>
                                                <div className="adm-cell-id">
                                                    <span className="adm-cell-name">{t.name || "User"}{t.unreadForAgent > 0 && <span className="adm-sup-unread" style={{ marginLeft: 6 }}>{t.unreadForAgent}</span>}</span>
                                                    <span className="adm-cell-username">{t.email}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td><strong>{t.topic}</strong></td>
                                        <td>{t.agentName || <span className="adm-muted">—</span>}</td>
                                        <td><Badge value={t.status} tone={STATUS_TONE[t.status]} /></td>
                                        <td>{fmtDateTime(t.lastMessageAt || t.createdAt)}</td>
                                        <td><button className="adm-link-btn" onClick={() => openThread(t)}>Open</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Conversation modal */}
            {active && (
                <Modal title={null} size="xl" onClose={closeThread}>
                    <div className="adm-ticket-chat">
                        <div className="adm-ticket-chat-head">
                            <span className="adm-cell-avatar lg">{initialsOf(active.name)}</span>
                            <div className="adm-ticket-chat-id">
                                <strong>{active.name || "User"}</strong>
                                <span>{active.email}</span>
                                <span className="adm-ticket-chat-topic">{active.topic}</span>
                            </div>
                            <Badge value={active.status} tone={STATUS_TONE[active.status]} />
                            <button className="adm-ticket-x" onClick={closeThread} aria-label="Close">✕</button>
                        </div>

                        <div className="adm-ticket-thread" ref={bodyRef}>
                            {(active.messages || []).map((m, i) => (
                                m.from === "system" ? (
                                    <div key={i} className="adm-sup-sys">{m.text}</div>
                                ) : (
                                    <div key={i} className={`adm-sup-msg ${m.from === "agent" ? "out" : "in"}`}>
                                        <div className="adm-sup-bubble">{m.text}</div>
                                        <span className="adm-sup-msg-time">{m.senderName || (m.from === "agent" ? "Agent" : "User")} · {fmtTime(m.at)}</span>
                                    </div>
                                )
                            ))}
                        </div>

                        <div className="adm-ticket-compose">
                            <div className="adm-ticket-canned">
                                {CANNED.map((c, i) => (
                                    <button key={i} className="adm-sup-canned-chip" onClick={() => send(c)} title={c} disabled={busy}>{c.length > 32 ? c.slice(0, 32) + "…" : c}</button>
                                ))}
                            </div>
                            <div className="adm-ticket-input">
                                <input
                                    placeholder="Type a reply…"
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                                />
                                <button className="adm-btn primary" onClick={() => send()} disabled={busy}>Send</button>
                            </div>
                        </div>

                        <div className="adm-ticket-bar">
                            {active.status !== "in_progress" && <button className="adm-btn" disabled={busy} onClick={() => setStatus("in_progress")}>Mark In Progress</button>}
                            {active.status !== "closed" && <button className="adm-btn" disabled={busy} onClick={() => setStatus("closed")}>Mark Closed</button>}
                            {active.status === "closed" && <button className="adm-btn" disabled={busy} onClick={() => setStatus("open")}>Reopen</button>}
                            <a className="adm-btn" href={mailtoHref(active)}>{Ico.reply} Email instead</a>
                            <div className="adm-toolbar-spacer" />
                            <button className="adm-btn" disabled={busy} onClick={clearChat}>Clear chat</button>
                            <button className="adm-btn danger" disabled={busy} onClick={deleteTicket}>Delete</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Tips strip */}
            <div className="adm-tips" style={{ marginTop: "1.4rem" }}>
                <div className="adm-tips-grid">
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.mail}</span>
                        <div><strong>From "Email us"</strong><span>Tickets are submitted in-app from the Safety Center.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.reply}</span>
                        <div><strong>Reply in-app</strong><span>Your reply reaches the user instantly + by email.</span></div>
                    </div>
                    <div className="adm-tip">
                        <span className="adm-tip-icon">{Ico.check}</span>
                        <div><strong>Track to Resolution</strong><span>Move tickets through Open → In Progress → Closed.</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminTickets;
