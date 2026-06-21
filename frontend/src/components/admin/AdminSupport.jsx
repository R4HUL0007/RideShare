import React, { useEffect, useRef, useState, useCallback } from "react";
import { adminSupportList, adminSupportGet, adminSupportClaim, adminSupportMessage, adminSupportClose } from "../../services/supportService";
import { StatCard, Badge } from "./AdminUI";
import { toast } from "react-toastify";

const initialsOf = (name) =>
    (name || "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "U";

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

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

const STATUS_TONE = { waiting: "amber", active: "green", closed: "grey" };

const Ico = {
    chat: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>,
    clock: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    live: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82M4.6 9a1.65 1.65 0 0 0-.33-1.82"></path><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg>,
    check: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
};

const AdminSupport = () => {
    const [list, setList] = useState([]);
    const [stats, setStats] = useState({});
    const [statusFilter, setStatusFilter] = useState("All");
    const [activeId, setActiveId] = useState(null);
    const [session, setSession] = useState(null);
    const [text, setText] = useState("");
    const [loading, setLoading] = useState(true);
    const bodyRef = useRef(null);
    const activeIdRef = useRef(null);

    const fetchList = useCallback(async () => {
        try {
            const { data } = await adminSupportList(statusFilter === "All" ? {} : { status: statusFilter });
            setList(data.items || []);
            setStats(data.stats || {});
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [statusFilter]);

    const fetchSession = useCallback(async (id) => {
        if (!id) return;
        try {
            const { data } = await adminSupportGet(id);
            // Ignore a stale response that resolved after the agent switched
            // conversations — otherwise it briefly shows the wrong thread.
            if (data && data._id === activeIdRef.current) setSession(data);
        } catch { /* ignore */ }
    }, []);

    // Poll the list every 4s.
    useEffect(() => {
        fetchList();
        const t = setInterval(fetchList, 4000);
        return () => clearInterval(t);
    }, [fetchList]);

    // Poll the open thread every 2.5s.
    useEffect(() => {
        activeIdRef.current = activeId;
        if (!activeId) return;
        fetchSession(activeId);
        const t = setInterval(() => fetchSession(activeId), 2500);
        return () => clearInterval(t);
    }, [activeId, fetchSession]);

    useEffect(() => {
        bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
    }, [session?.messages?.length]);

    const open = (s) => { setActiveId(s._id); setSession(s); };

    const claim = async () => {
        try { const { data } = await adminSupportClaim(activeId); setSession(data); fetchList(); }
        catch (e) { toast.error(e.response?.data?.message || "Failed to join"); }
    };

    const send = async (msg) => {
        const t = (msg ?? text).trim();
        if (!t || !activeId) return;
        try {
            const { data } = await adminSupportMessage(activeId, t);
            setSession(data); setText(""); fetchList();
        } catch (e) { toast.error(e.response?.data?.message || "Failed to send"); }
    };

    const close = async () => {
        try { const { data } = await adminSupportClose(activeId); setSession(data); fetchList(); toast.success("Chat closed"); }
        catch (e) { toast.error(e.response?.data?.message || "Failed to close"); }
    };

    const filtered = statusFilter === "All" ? list : list.filter((s) => s.status === statusFilter);

    return (
        <div>
            {/* Stat cards */}
            <div className="adm-stats">
                <StatCard icon={Ico.chat} value={loading ? "—" : (stats.total ?? 0)} label="Total Conversations" sub="all time" />
                <StatCard icon={Ico.clock} value={loading ? "—" : (stats.waiting ?? 0)} label="Waiting" sub="needs an agent" />
                <StatCard icon={Ico.live} value={loading ? "—" : (stats.active ?? 0)} label="Active" sub="in progress" />
                <StatCard icon={Ico.check} value={loading ? "—" : (stats.closed ?? 0)} label="Closed" sub="resolved" />
            </div>

            <div className="adm-sup-layout">
                {/* Left: session list */}
                <div className="adm-sup-list">
                    <div className="adm-sup-list-head">
                        <span>Conversations</span>
                        <select className="adm-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            <option value="All">All</option>
                            <option value="waiting">Waiting</option>
                            <option value="active">Active</option>
                            <option value="closed">Closed</option>
                        </select>
                    </div>
                    <div className="adm-sup-list-body">
                        {filtered.length === 0 ? (
                            <div className="adm-empty" style={{ padding: "2rem 1rem" }}><span style={{ fontSize: "1.6rem" }}>💬</span><span>No conversations.</span></div>
                        ) : filtered.map((s) => (
                            <button key={s._id} className={`adm-sup-item ${activeId === s._id ? "active" : ""}`} onClick={() => open(s)}>
                                <span className="adm-cell-avatar">{initialsOf(s.userName)}</span>
                                <span className="adm-sup-item-info">
                                    <span className="adm-sup-item-top"><strong>{s.userName || "User"}</strong>{s.unreadForAgent > 0 && <span className="adm-sup-unread">{s.unreadForAgent}</span>}</span>
                                    <span className="adm-sup-item-sub">{s.topic}</span>
                                </span>
                                <Badge value={s.status} tone={STATUS_TONE[s.status]} />
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right: chat thread */}
                <div className="adm-sup-chat">
                    {!session ? (
                        <div className="adm-sup-empty">
                            <span style={{ fontSize: "2rem" }}>🛟</span>
                            <div className="adm-live-title" style={{ fontSize: "1rem", marginTop: "0.6rem" }}>Select a conversation</div>
                            <div className="adm-live-text">Pick a request from the left to view and respond.</div>
                        </div>
                    ) : (
                        <>
                            <div className="adm-sup-chat-head">
                                <span className="adm-cell-avatar">{initialsOf(session.userName)}</span>
                                <div className="adm-sup-chat-id">
                                    <strong>{session.userName || "User"}</strong>
                                    <span>{session.userEmail} · {session.topic}</span>
                                </div>
                                <Badge value={session.status} tone={STATUS_TONE[session.status]} />
                                {session.status === "waiting" && <button className="adm-btn primary" onClick={claim}>Join chat</button>}
                                {session.status === "active" && <button className="adm-btn danger" onClick={close}>End chat</button>}
                            </div>

                            <div className="adm-sup-thread" ref={bodyRef}>
                                {(session.messages || []).map((m, i) => (
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

                            {session.status !== "closed" ? (
                                <div className="adm-sup-compose">
                                    <div className="adm-sup-canned">
                                        {CANNED.map((c, i) => (
                                            <button key={i} className="adm-sup-canned-chip" onClick={() => send(c)} title={c}>{c.length > 28 ? c.slice(0, 28) + "…" : c}</button>
                                        ))}
                                    </div>
                                    <div className="adm-sup-input">
                                        <input
                                            placeholder="Type a reply…"
                                            value={text}
                                            onChange={(e) => setText(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                                        />
                                        <button className="adm-btn primary" onClick={() => send()}>Send</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="adm-sup-closed">This conversation is closed.</div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminSupport;
