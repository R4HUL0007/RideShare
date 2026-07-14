import React, { useEffect, useRef, useState } from "react";
import { useAssistant } from "../../assistant/AssistantContext";
import "../../styles/assistant.css";

/* ---------------- inline icons ---------------- */
const Icon = {
    bot: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="3" /><path d="M12 8V4M8 4h8" /><circle cx="9" cy="14" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="14" r="1.3" fill="currentColor" stroke="none" /></svg>,
    close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>,
    trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>,
    send: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>,
    pin: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>,
};

// Welcome-screen capability tiles. Each is now CLICKABLE: `action` runs a tool
// directive (navigate/track), `ask` sends a text question to the assistant.
const CAPABILITIES = [
    { label: "🚗 Create Rides", action: { tool: "navigate", args: { tab: "createRide" } } },
    { label: "🔍 Find Rides", action: { tool: "navigate", args: { tab: "findRides" } } },
    { label: "📖 Manage Bookings", action: { tool: "navigate", args: { tab: "myBookings" } } },
    { label: "🚘 Manage Vehicles", action: { tool: "navigate", args: { tab: "myVehicle" } } },
    { label: "💳 Payments", action: { tool: "navigate", args: { tab: "payments" } } },
    { label: "📍 Live Tracking", action: { tool: "openTracking", args: {} } },
    { label: "💬 Chat Support", ask: "How do I contact support?" },
    { label: "❓ What is RidexShare?", ask: "What is RidexShare and what problem does it solve?" },
];

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

function RideCard({ card }) {
    return (
        <div className="ai-ridecard">
            <div className="ai-ridecard-route">{card.source} → {card.destination}</div>
            <div className="ai-ridecard-meta">
                <span>👤 {card.driver}</span>
                {card.vehicle && card.vehicle !== "—" && <span>🚘 {card.vehicle}</span>}
                <span>🪑 {card.seats} left</span>
                <span>🕒 {fmtTime(card.timing)}</span>
                <span className="ai-ridecard-price">{card.price ? `₹${card.price}/seat` : "Free"}</span>
            </div>
        </div>
    );
}

const AssistantWidget = () => {
    const a = useAssistant();
    const [input, setInput] = useState("");
    const bodyRef = useRef(null);

    // Auto-scroll to newest message.
    useEffect(() => {
        if (a?.open && bodyRef.current) {
            bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        }
    }, [a?.messages, a?.busy, a?.open]);

    if (!a) return null;
    const { open, toggle, setOpen, messages, busy, send, runAction, clear, pageContext } = a;

    const submit = (e) => {
        e?.preventDefault();
        if (!input.trim()) return;
        send(input);
        setInput("");
    };

    return (
        <>
            {/* Launcher */}
            {!open && (
                <button className="ai-fab" onClick={toggle} aria-label="Open RidexShare Assistant" title="RidexShare Assistant">
                    {Icon.bot}
                </button>
            )}

            {open && (
                <div className="ai-window" role="dialog" aria-label="RidexShare AI Assistant">
                    {/* Header */}
                    <div className="ai-head">
                        <span className="ai-head-avatar">{Icon.bot}</span>
                        <div className="ai-head-info">
                            <div className="ai-head-title">RidexShare Assistant</div>
                            <div className="ai-head-sub"><span className="ai-dot-online" /> Online · {pageContext.label}</div>
                        </div>
                        {messages.length > 0 && (
                            <button className="ai-head-btn" onClick={clear} title="Clear conversation" aria-label="Clear conversation">{Icon.trash}</button>
                        )}
                        <button className="ai-head-btn" onClick={() => setOpen(false)} title="Close" aria-label="Close">{Icon.close}</button>
                    </div>

                    {/* Body */}
                    <div className="ai-body" ref={bodyRef}>
                        {messages.length === 0 && (
                            <div className="ai-welcome">
                                <span className="ai-welcome-emoji">👋</span>
                                <div className="ai-welcome-title">Welcome to RidexShare Assistant</div>
                                <div className="ai-welcome-sub">{pageContext.hint} I can help you:</div>
                                <div className="ai-cap-grid">
                                    {CAPABILITIES.map((c) => (
                                        <button
                                            type="button"
                                            className="ai-cap ai-cap-btn"
                                            key={c.label}
                                            onClick={() => (c.action ? runAction(c.action) : send(c.ask))}
                                        >
                                            {c.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="ai-suggestions">
                                    {pageContext.suggestions.map((s) => (
                                        <button key={s} className="ai-chip" onClick={() => send(s)}>{s}</button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((m) => (
                            <div key={m.id}>
                                <div className={`ai-row ${m.role}`}>
                                    <div className={`ai-bubble ${m.role}`}>{m.text}</div>
                                </div>
                                {m.cards && m.cards.map((c) => <RideCard key={c.id} card={c} />)}
                                {m.actions && m.actions.length > 0 && (
                                    <div className="ai-actions">
                                        {m.actions.map((act, i) => (
                                            <button key={i} className={`ai-action${act.primary ? " primary" : ""}`} onClick={() => runAction(act)}>
                                                {act.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {m.suggestions && m.suggestions.length > 0 && (
                                    <div className="ai-suggestions">
                                        {m.suggestions.map((s) => (
                                            <button key={s} className="ai-chip" onClick={() => send(s)}>{s}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        {busy && (
                            <div className="ai-row bot">
                                <div className="ai-bubble bot" style={{ padding: 0 }}>
                                    <div className="ai-typing"><span /><span /><span /></div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Clear chat (bottom) — quick, obvious reset, keeps the header trash too */}
                    {messages.length > 0 && (
                        <div className="ai-footerbar">
                            <button type="button" className="ai-clear-btn" onClick={clear} title="Clear the whole conversation">
                                {Icon.trash} Clear chat
                            </button>
                        </div>
                    )}

                    {/* Composer */}
                    <form className="ai-composer" onSubmit={submit}>
                        <input
                            className="ai-input"
                            placeholder="Ask me anything, or type a request…"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={busy}
                            aria-label="Message the assistant"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="sentences"
                            spellCheck={false}
                        />
                        <button className="ai-send" type="submit" disabled={busy || !input.trim()} aria-label="Send">{Icon.send}</button>
                    </form>
                </div>
            )}
        </>
    );
};

export default AssistantWidget;
