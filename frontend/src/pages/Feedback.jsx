import { useState } from "react";
import { toast } from "react-toastify";
import PublicLayout from "../components/public/PublicLayout";
import { submitFeedback } from "../services/feedbackService";

// Public feedback / suggestions page. Works logged-in or logged-out. The
// message is sent to our backend, which emails it to the platform inbox — the
// destination address is never exposed to the browser.
const Feedback = () => {
    const [form, setForm] = useState({ name: "", email: "", message: "", company: "" });
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
            setForm({ name: "", email: "", message: "", company: "" });
            toast.success("Thanks for your feedback!");
        } catch (err) {
            toast.error(err.response?.data?.message || "Couldn't send your feedback. Please try again.");
        } finally {
            setSending(false);
        }
    };

    return (
        <PublicLayout>
            <h1 className="pub-hero-title">Share your <em>feedback</em></h1>
            <p className="pub-lead">
                Got a suggestion, found a bug, or just want to tell us what you think?
                We read every message. It goes straight to the RidexShare team.
            </p>

            {sent ? (
                <div className="pub-section">
                    <div className="fb-success">
                        <span className="fb-success-icon">✅</span>
                        <div>
                            <h3>Feedback sent</h3>
                            <p>Thanks for helping make RidexShare better. We appreciate it.</p>
                        </div>
                    </div>
                    <button className="landing-cta-link" onClick={() => setSent(false)}>Send another</button>
                </div>
            ) : (
                <form className="fb-form" onSubmit={onSubmit} noValidate>
                    <label className="fb-label">
                        Name <span className="fb-optional">(optional)</span>
                        <input className="fb-input" type="text" value={form.name} onChange={set("name")} placeholder="Your name" maxLength={80} />
                    </label>

                    <label className="fb-label">
                        Email <span className="fb-optional">(optional — if you'd like a reply)</span>
                        <input className="fb-input" type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" maxLength={120} />
                    </label>

                    <label className="fb-label">
                        Your feedback
                        <textarea className="fb-input fb-textarea" value={form.message} onChange={set("message")} placeholder="Tell us what's on your mind…" rows={6} maxLength={4000} required />
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

                    <button className="fb-submit" type="submit" disabled={sending}>
                        {sending ? "Sending…" : "Send feedback"}
                    </button>
                </form>
            )}
        </PublicLayout>
    );
};

export default Feedback;
