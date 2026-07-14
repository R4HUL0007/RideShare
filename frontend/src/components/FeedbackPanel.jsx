import { useState } from "react";
import { toast } from "react-toastify";
import { submitFeedback } from "../services/feedbackService";
import "../styles/feedbackPanel.css";

// In-app feedback / suggestion panel (rendered as a dashboard tab). Reuses the
// same backend endpoint as the public /feedback page; the destination inbox is
// resolved server-side and never exposed to the client. Name/email are
// pre-filled from the logged-in user for convenience (still editable).
const FeedbackPanel = ({ user, onOpenSidebar }) => {
    const [form, setForm] = useState({
        name: user?.name || "",
        email: user?.email || "",
        message: "",
        company: "", // honeypot
    });
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const onSubmit = async (e) => {
        e.preventDefault();
        if (form.message.trim().length < 3) {
            toast.info("Please enter a bit more detail.");
            return;
        }
        setSending(true);
        try {
            await submitFeedback(form);
            setSent(true);
            setForm((f) => ({ ...f, message: "" }));
            toast.success("Thanks for your feedback!");
        } catch (err) {
            toast.error(err.response?.data?.message || "Couldn't send your feedback. Please try again.");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fbp-root">
            <div className="fbp-topbar">
                {onOpenSidebar && (
                    <button className="fbp-hamburger" onClick={onOpenSidebar} aria-label="Open menu">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                    </button>
                )}
                <span className="fbp-title-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                </span>
                <div className="fbp-heading">
                    <h1 className="fbp-title">Send Feedback</h1>
                    <p className="fbp-subtitle">Suggestions, bugs, or thoughts — it goes straight to the RidexShare team.</p>
                </div>
            </div>

            <div className="fbp-body">
                {sent ? (
                    <div className="fbp-card fbp-success">
                        <span className="fbp-success-icon" aria-hidden="true">✅</span>
                        <div>
                            <h3>Feedback sent</h3>
                            <p>Thanks for helping make RidexShare better. We read every message.</p>
                        </div>
                        <button className="fbp-link" onClick={() => setSent(false)}>Send another</button>
                    </div>
                ) : (
                    <form className="fbp-card fbp-form" onSubmit={onSubmit} noValidate>
                        <div className="fbp-row">
                            <label className="fbp-field">
                                <span className="fbp-label">Name <span className="fbp-optional">(optional)</span></span>
                                <input className="fbp-input" type="text" value={form.name} onChange={set("name")} placeholder="Your name" maxLength={80} />
                            </label>
                            <label className="fbp-field">
                                <span className="fbp-label">Email <span className="fbp-optional">(for a reply)</span></span>
                                <input className="fbp-input" type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" maxLength={120} />
                            </label>
                        </div>

                        <label className="fbp-field">
                            <span className="fbp-label">Your feedback</span>
                            <textarea className="fbp-input fbp-textarea" value={form.message} onChange={set("message")} placeholder="Tell us what's on your mind…" rows={7} maxLength={4000} required />
                        </label>

                        {/* Honeypot: hidden from real users; bots tend to fill it. */}
                        <input
                            type="text"
                            name="company"
                            value={form.company}
                            onChange={set("company")}
                            tabIndex={-1}
                            autoComplete="off"
                            aria-hidden="true"
                            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
                        />

                        <button className="fbp-submit" type="submit" disabled={sending}>
                            {sending ? "Sending…" : "Send feedback"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default FeedbackPanel;
