import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { getMyTickets, getMyTicket, replyToTicket, submitSupportTicket, deleteMyTicket } from "../services/supportService";
import { getProfile } from "../services/profileService";
import "../styles/support.css";

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const STATUS_LABEL = { open: "Open", in_progress: "In Progress", closed: "Closed" };
const STATUS_TONE = { open: "amber", in_progress: "blue", closed: "green" };

const Icon = {
    headset: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></svg>,
    plus: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
    send: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>,
    back: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>,
    trash: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
};

const Support = ({ onOpenSidebar }) => {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeId, setActiveId] = useState(null);
    const [active, setActive] = useState(null);
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [composing, setComposing] = useState(false);
    const bodyRef = useRef(null);
    const activeIdRef = useRef(null);
    activeIdRef.current = activeId;

    const loadList = useCallback(async () => {
        try {
            const { data } = await getMyTickets();
            setTickets(Array.isArray(data) ? data : []);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        loadList();
        const t = setInterval(loadList, 8000);
        return () => clearInterval(t);
    }, [loadList]);

    // Poll the open thread for new agent replies.
    useEffect(() => {
        if (!activeId) return;
        const poll = async () => {
            try {
                const { data } = await getMyTicket(activeId);
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

    const openThread = (t) => { setActiveId(t._id); setActive(t); };
    const backToList = () => { setActiveId(null); setActive(null); loadList(); };

    const send = async () => {
        const t = text.trim();
        if (!t || !activeId) return;
        setSending(true);
        try {
            const { data } = await replyToTicket(activeId, t);
            setActive(data); setText("");
        } catch (e) {
            toast.error(e.response?.data?.message || "Couldn't send your reply.");
        } finally { setSending(false); }
    };

    const removeTicket = async () => {
        if (!activeId) return;
        if (!window.confirm("Delete this request and its conversation? This can't be undone.")) return;
        try {
            await deleteMyTicket(activeId);
            toast.success("Request deleted");
            backToList();
        } catch (e) {
            toast.error(e.response?.data?.message || "Couldn't delete the request.");
        }
    };

    return (
        <div className="sup-root">
            <div className="sup-topbar">
                {onOpenSidebar && (
                    <button className="sup-hamburger" onClick={onOpenSidebar} aria-label="Open menu">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                    </button>
                )}
                <span className="sup-title-icon">{Icon.headset}</span>
                <div className="sup-heading">
                    <h1 className="sup-title">Support</h1>
                    <p className="sup-subtitle">Get help and track all your requests in one place</p>
                </div>
                <button className="sup-new-btn" onClick={() => setComposing(true)}>{Icon.plus} New request</button>
            </div>

            <div className="sup-layout">
                {/* List */}
                <div className={`sup-list ${activeId ? "hide-mobile" : ""}`}>
                    {loading ? (
                        <div className="sup-empty"><p>Loading…</p></div>
                    ) : tickets.length === 0 ? (
                        <div className="sup-empty">
                            <span className="sup-empty-icon">{Icon.headset}</span>
                            <strong>No requests yet</strong>
                            <p>Need a hand? Start a new request and our team will reply right here.</p>
                            <button className="sup-new-btn solid" onClick={() => setComposing(true)}>{Icon.plus} New request</button>
                        </div>
                    ) : tickets.map((t) => (
                        <button key={t._id} className={`sup-item ${activeId === t._id ? "active" : ""}`} onClick={() => openThread(t)}>
                            <div className="sup-item-top">
                                <strong>{t.topic}</strong>
                                <span className={`sup-badge ${STATUS_TONE[t.status]}`}>{STATUS_LABEL[t.status] || t.status}</span>
                            </div>
                            <span className="sup-item-sub">{t.agentName ? `Handled by ${t.agentName}` : "Awaiting an agent"} · {fmtTime(t.lastMessageAt || t.createdAt)}</span>
                            {t.unreadForUser > 0 && <span className="sup-unread-dot" />}
                        </button>
                    ))}
                </div>

                {/* Thread */}
                <div className={`sup-thread ${activeId ? "" : "hide-mobile"}`}>
                    {!active ? (
                        <div className="sup-thread-empty">
                            <span className="sup-empty-icon">{Icon.headset}</span>
                            <strong>Select a request</strong>
                            <p>Pick a request on the left to view the conversation, or start a new one.</p>
                        </div>
                    ) : (
                        <>
                            <div className="sup-thread-head">
                                <button className="sup-back" onClick={backToList} aria-label="Back">{Icon.back}</button>
                                <div className="sup-thread-id">
                                    <strong>{active.topic}</strong>
                                    <span>{active.agentName ? `${active.agentName} from Support is helping you` : "Waiting for an agent to respond"}</span>
                                </div>
                                <span className={`sup-badge ${STATUS_TONE[active.status]}`}>{STATUS_LABEL[active.status] || active.status}</span>
                                <button className="sup-del" onClick={removeTicket} title="Delete request">{Icon.trash}</button>
                            </div>

                            <div className="sup-msgs" ref={bodyRef}>
                                {(active.messages || []).map((m, i) => (
                                    m.from === "system" ? (
                                        <div key={i} className="sup-sys">{m.text}</div>
                                    ) : (
                                        <div key={i} className={`sup-msg ${m.from === "user" ? "out" : "in"}`}>
                                            <div className="sup-bubble">{m.text}</div>
                                            <span className="sup-msg-meta">{m.from === "user" ? "You" : (m.senderName || "Support")} · {fmtTime(m.at)}</span>
                                        </div>
                                    )
                                ))}
                            </div>

                            <div className="sup-compose">
                                <textarea
                                    placeholder="Type your message…"
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                                    rows={1}
                                />
                                <button className="sup-send" onClick={send} disabled={sending || !text.trim()}>{Icon.send}</button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {composing && (
                <NewRequestModal
                    onClose={() => setComposing(false)}
                    onCreated={(ticket) => { setComposing(false); loadList(); openThread(ticket); }}
                />
            )}
        </div>
    );
};

/* ---------------- New request modal ---------------- */
function NewRequestModal({ onClose, onCreated }) {
    const [me, setMe] = useState(null);
    const [topic, setTopic] = useState("");
    const [description, setDescription] = useState("");
    const [sending, setSending] = useState(false);

    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        document.addEventListener("keydown", onKey);
        let active = true;
        getProfile().then((res) => { if (active) setMe(res.data); }).catch(() => { /* ignore */ });
        return () => { document.removeEventListener("keydown", onKey); active = false; };
    }, [onClose]);

    const submit = async (e) => {
        e.preventDefault();
        if (!topic.trim()) { toast.error("Please add a topic."); return; }
        if (!description.trim()) { toast.error("Please describe your issue."); return; }
        setSending(true);
        try {
            const { data } = await submitSupportTicket(topic.trim(), description.trim());
            toast.success("Request sent! Our team will reply here.");
            onCreated?.(data);
        } catch (err) {
            toast.error(err.response?.data?.message || "Couldn't send your request.");
        } finally { setSending(false); }
    };

    return (
        <div className="sup-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <form className="sup-modal" onSubmit={submit}>
                <h3 className="sup-modal-title">New support request</h3>
                <p className="sup-modal-sub">We'll reply right here and notify you. No need to type your details.</p>

                <div className="sup-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <label className="sup-label">Name</label>
                        <input className="sup-input" value={me?.name || ""} readOnly disabled />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <label className="sup-label">Email</label>
                        <input className="sup-input" value={me?.email || ""} readOnly disabled />
                    </div>
                </div>

                <label className="sup-label">Topic *</label>
                <input className="sup-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's this about?" maxLength={150} required />

                <label className="sup-label">Description *</label>
                <textarea className="sup-input sup-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your issue or question…" maxLength={4000} required />

                <div className="sup-modal-actions">
                    <button type="button" className="sup-btn ghost" onClick={onClose} disabled={sending}>Cancel</button>
                    <button type="submit" className="sup-btn" disabled={sending}>{sending ? "Sending…" : "Send Request"}</button>
                </div>
            </form>
        </div>
    );
}

export default Support;
