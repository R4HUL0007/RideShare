import React, { useEffect, useState, useRef } from "react";
import { toast } from "react-toastify";
import {
    getSafetyOverview, listContacts, addContact, updateContact, deleteContact, setPrimaryContact,
    submitReport, myIncidents,
} from "../services/safetyService";
import ThemedSelect from "./ThemedSelect";
import { requestSupport, getMySupportSession, sendSupportMessage, closeMySupport, submitSupportTicket } from "../services/supportService";
import { getProfile } from "../services/profileService";
import "../styles/safety.css";

const RELATIONSHIPS = ["Parent", "Guardian", "Spouse", "Sibling", "Friend", "Other"];
const REPORT_TYPES = [
    ["driver", "🚩 Driver"], ["passenger", "🚩 Passenger"], ["ride", "🚩 Ride"],
    ["unsafe_driving", "🚩 Unsafe Driving"], ["harassment", "🚩 Harassment"],
    ["vehicle_mismatch", "🚩 Vehicle Mismatch"], ["fake_profile", "🚩 Fake Profile"],
    ["payment_issue", "🚩 Payment Issue"],
];

const SafetyCenter = ({ onOpenSidebar, onNavigate }) => {
    const [tab, setTab] = useState("overview");
    const [overview, setOverview] = useState(null);
    const [contacts, setContacts] = useState([]);
    const [incidents, setIncidents] = useState({ reports: [], sosEvents: [] });
    const [loading, setLoading] = useState(true);
    const [supportOpen, setSupportOpen] = useState(false);
    const [emailOpen, setEmailOpen] = useState(false);

    useEffect(() => { loadAll(); }, []);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [ov, ct, inc] = await Promise.allSettled([getSafetyOverview(), listContacts(), myIncidents()]);
            if (ov.status === "fulfilled") setOverview(ov.value.data);
            if (ct.status === "fulfilled") setContacts(ct.value.data);
            if (inc.status === "fulfilled") setIncidents(inc.value.data);
        } finally {
            setLoading(false);
        }
    };

    const TABS = [
        ["overview", "🛡 Overview"], ["contacts", "🚨 Contacts"], ["report", "🚩 Report"],
        ["incidents", "📜 History"], ["guidelines", "📖 Guidelines"],
    ];

    return (
        <div className="sf-root">
            <div className="sf-topbar">
                {onOpenSidebar && (
                    <button className="sf-hamburger" onClick={onOpenSidebar} aria-label="Open menu">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                    </button>
                )}
                <span className="sf-title-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg>
                </span>
                <div className="sf-heading">
                    <h1 className="sf-title">Safety Center</h1>
                    <p className="sf-subtitle">Your safety and peace of mind, always</p>
                </div>
            </div>

            <div className="sf-tabs">
                {TABS.map(([k, label]) => (
                    <button key={k} className={`sf-tab${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>{label}</button>
                ))}
            </div>

            <div className="sf-content">
                {tab === "overview" && <Overview overview={overview} contacts={contacts} loading={loading} onGoContacts={() => setTab("contacts")} onVerify={() => onNavigate?.("verification")} onGuidelines={() => setTab("guidelines")} onSupport={() => setSupportOpen(true)} onEmail={() => setEmailOpen(true)} />}
                {tab === "contacts" && <Contacts contacts={contacts} onReload={loadAll} />}
                {tab === "report" && <ReportForm onSubmitted={loadAll} onDone={() => setTab("incidents")} />}
                {tab === "incidents" && <Incidents incidents={incidents} loading={loading} />}
                {tab === "guidelines" && <Guidelines />}
            </div>

            {supportOpen && (
                <SupportModal
                    onClose={() => setSupportOpen(false)}
                    onNavigate={onNavigate}
                    onReport={() => { setSupportOpen(false); setTab("report"); }}
                />
            )}

            {emailOpen && <EmailUsModal onClose={() => setEmailOpen(false)} onNavigate={onNavigate} />}
        </div>
    );
};

/* ---------------- Overview ---------------- */
const Overview = ({ overview, contacts, loading, onGoContacts, onVerify, onGuidelines, onSupport, onEmail }) => {
    const contactsCount = overview?.emergencyContacts ?? 0;
    const openReports = overview?.openReports ?? 0;
    const verified = overview?.isDriverVerified;
    const arrow = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>;
    return (
        <div>
            {/* Stat cards */}
            <div className="sf-ov-stats">
                <div className="sf-ov-stat">
                    <span className="sf-ov-icon pink"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg></span>
                    <div className="sf-ov-body">
                        <div className="sf-ov-value">{loading ? "—" : contactsCount}</div>
                        <div className="sf-ov-label">Emergency Contacts</div>
                        <div className="sf-ov-sub">{contactsCount > 0 ? "Contacts added" : "Add contacts to stay protected"}</div>
                    </div>
                </div>
                <div className="sf-ov-stat">
                    <span className="sf-ov-icon pink"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg></span>
                    <div className="sf-ov-body">
                        <div className="sf-ov-value">{loading ? "—" : openReports}</div>
                        <div className="sf-ov-label">Open Reports</div>
                        <div className="sf-ov-sub">{openReports > 0 ? "Reports under review" : "No open safety reports"}</div>
                    </div>
                </div>
                <div className="sf-ov-stat wide">
                    <span className="sf-ov-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />{verified && <polyline points="9 12 11 14 15 10" />}</svg></span>
                    <div className="sf-ov-body">
                        <div className="sf-ov-value">{loading ? "—" : (verified ? "Verified" : "Not verified")}</div>
                        <div className="sf-ov-label">Driver Verification</div>
                        <div className="sf-ov-sub">{verified ? "Your documents are verified" : "Complete verification to build trust"}</div>
                    </div>
                    {!loading && !verified && (
                        <button className="sf-btn ghost sf-ov-action" onClick={onVerify}>Verify Now</button>
                    )}
                </div>
            </div>

            {/* Add contacts banner */}
            {(!loading && contactsCount === 0) && (
                <div className="sf-callout sf-ov-callout">
                    <span className="sf-callout-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg></span>
                    <div className="sf-callout-text">
                        <strong>Add emergency contacts</strong>
                        <p>So they're alerted instantly if you ever trigger an SOS during a ride.</p>
                    </div>
                    <button className="sf-btn light sf-callout-btn" onClick={onGoContacts}>Add a Contact {arrow}</button>
                </div>
            )}

            {/* Safety Features */}
            <div className="sf-features-head">
                <h3 className="sf-section-title">Safety Features</h3>
                <p className="sf-features-sub">Tools designed to keep you safe on every ride.</p>
            </div>
            <div className="sf-features">
                <button className="sf-feature" onClick={onGuidelines}>
                    <span className="sf-feature-icon pink"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg></span>
                    <h4 className="sf-feature-title">Trip Sharing</h4>
                    <p className="sf-feature-desc">Share a secure live-tracking link with trusted contacts during any active ride — available from the live tracking screen.</p>
                    <span className="sf-feature-arrow">{arrow}</span>
                </button>
                <button className="sf-feature" onClick={onGuidelines}>
                    <span className="sf-feature-icon red"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg></span>
                    <h4 className="sf-feature-title">SOS Button</h4>
                    <p className="sf-feature-desc">A one-tap emergency alert appears during active rides. It shares your location, ride details and a tracking link with your contacts and our team.</p>
                    <span className="sf-feature-arrow">{arrow}</span>
                </button>
                <button className="sf-feature" onClick={onVerify}>
                    <span className="sf-feature-icon green"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg></span>
                    <h4 className="sf-feature-title">Verified Drivers</h4>
                    <p className="sf-feature-desc">Drivers upload their license, vehicle RC and photos for admin review. Look for the verified badge before you ride.</p>
                    <span className="sf-feature-arrow">{arrow}</span>
                </button>
            </div>

            {/* Need help */}
            <div className="sf-help">
                <span className="sf-help-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></svg></span>
                <div className="sf-help-text">
                    <strong>Need help?</strong>
                    <p>Get instant answers from our assistant any time, or email us and we'll get back to you.</p>
                </div>
                <div className="sf-help-actions">
                    <button className="sf-btn light sf-help-btn" onClick={onSupport}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        Chat with us
                    </button>
                    <button className="sf-btn ghost sf-help-btn" onClick={onEmail}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>
                        Email us
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ---------------- Emergency Contacts ---------------- */
const Contacts = ({ contacts, onReload }) => {
    const [editing, setEditing] = useState(null); // contact or {} for new
    const blank = { name: "", phoneNumber: "", email: "", relationship: "Other", priority: "other" };
    const [form, setForm] = useState(blank);
    const [saving, setSaving] = useState(false);

    const openNew = () => { setForm(blank); setEditing({}); };
    const openEdit = (c) => { setForm({ name: c.name, phoneNumber: c.phoneNumber, email: c.email || "", relationship: c.relationship, priority: c.priority }); setEditing(c); };

    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editing && editing._id) await updateContact(editing._id, form);
            else await addContact(form);
            toast.success("Contact saved");
            setEditing(null);
            onReload();
        } catch (err) {
            toast.error(err.response?.data?.message || "Couldn't save contact");
        } finally { setSaving(false); }
    };

    const remove = async (id) => {
        try { await deleteContact(id); toast.success("Contact removed"); onReload(); }
        catch { toast.error("Couldn't remove contact"); }
    };

    const makePrimary = async (id) => {
        try { await setPrimaryContact(id); toast.success("Primary contact set"); onReload(); }
        catch { toast.error("Couldn't set primary"); }
    };

    return (
        <div>
            <div className="sf-section-head">
                <h3 className="sf-section-title">Emergency Contacts</h3>
                <button className="sf-btn" onClick={openNew}>+ Add Contact</button>
            </div>

            {contacts.length === 0 ? (
                <div className="sf-empty"><span>🚨</span><p>No emergency contacts yet. Add people who should be alerted in an emergency.</p></div>
            ) : (
                <div className="sf-contacts">
                    {contacts.map((c) => (
                        <div key={c._id} className={`sf-contact-card${c.priority === "primary" ? " primary" : ""}`}>
                            <div className="sf-contact-main">
                                <div className="sf-contact-name">{c.name}{c.priority === "primary" && <span className="sf-primary-tag">Primary</span>}</div>
                                <div className="sf-contact-meta">{c.relationship} · {c.phoneNumber}</div>
                            </div>
                            <div className="sf-contact-actions">
                                {c.priority !== "primary" && <button className="sf-mini" onClick={() => makePrimary(c._id)} title="Set primary">★</button>}
                                <button className="sf-mini" onClick={() => openEdit(c)} title="Edit">✎</button>
                                <button className="sf-mini danger" onClick={() => remove(c._id)} title="Delete">✕</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {editing && (
                <div className="sf-overlay" onMouseDown={(e) => e.target === e.currentTarget && setEditing(null)}>
                    <form className="sf-modal" onSubmit={save}>
                        <h3 className="sf-modal-title">{editing._id ? "Edit Contact" : "Add Contact"}</h3>
                        <label className="sf-label">Name *</label>
                        <input className="sf-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                        <label className="sf-label">Phone Number *</label>
                        <input className="sf-input" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="10-digit number" required />
                        <label className="sf-label">Email (optional)</label>
                        <input className="sf-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                        <div className="sf-row">
                            <div style={{ flex: 1 }}>
                                <label className="sf-label">Relationship</label>
                                <ThemedSelect
                                    theme="dark" ariaLabel="Relationship"
                                    value={form.relationship}
                                    onChange={(v) => setForm({ ...form, relationship: v })}
                                    options={RELATIONSHIPS.map((r) => ({ value: r, label: r }))}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className="sf-label">Priority</label>
                                <ThemedSelect
                                    theme="dark" ariaLabel="Priority"
                                    value={form.priority}
                                    onChange={(v) => setForm({ ...form, priority: v })}
                                    options={[
                                        { value: "primary", label: "Primary" },
                                        { value: "secondary", label: "Secondary" },
                                        { value: "other", label: "Other" },
                                    ]}
                                />
                            </div>
                        </div>
                        <div className="sf-modal-actions">
                            <button type="button" className="sf-btn ghost" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
                            <button type="submit" className="sf-btn" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

/* ---------------- Report Form ---------------- */
const ReportForm = ({ onSubmitted, onDone }) => {
    const [reportType, setReportType] = useState("");
    const [reason, setReason] = useState("");
    const [description, setDescription] = useState("");
    const [saving, setSaving] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!reportType) { toast.error("Please select what you're reporting."); return; }
        setSaving(true);
        try {
            await submitReport({ reportType, reason, description });
            toast.success("Report submitted. Our safety team will review it.");
            setReportType(""); setReason(""); setDescription("");
            onSubmitted?.();
            onDone?.();
        } catch (err) {
            toast.error(err.response?.data?.message || "Couldn't submit report");
        } finally { setSaving(false); }
    };

    return (
        <form className="sf-report" onSubmit={submit}>
            <h3 className="sf-section-title">Report a Safety Concern</h3>
            <p className="sf-muted">Your report is confidential and reviewed by our safety team.</p>

            <label className="sf-label">What are you reporting? *</label>
            <div className="sf-report-types">
                {REPORT_TYPES.map(([val, label]) => (
                    <button type="button" key={val} className={`sf-rtype${reportType === val ? " active" : ""}`} onClick={() => setReportType(val)}>{label}</button>
                ))}
            </div>

            <label className="sf-label">Reason</label>
            <input className="sf-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Brief summary" maxLength={200} />

            <label className="sf-label">Description</label>
            <textarea className="sf-input sf-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what happened…" maxLength={2000} />

            <p className="sf-muted">Evidence upload (screenshots/files) coming soon.</p>

            <button type="submit" className="sf-btn full" disabled={saving}>{saving ? "Submitting…" : "Submit Report"}</button>
        </form>
    );
};

/* ---------------- Incident History ---------------- */
const Incidents = ({ incidents, loading }) => {
    if (loading) return <div className="sf-empty"><span>📜</span><p>Loading…</p></div>;
    const { reports = [], sosEvents = [] } = incidents;
    if (reports.length === 0 && sosEvents.length === 0) {
        return <div className="sf-empty"><span>📜</span><p>No safety incidents or reports. Stay safe!</p></div>;
    }
    const fmt = (d) => new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const statusCls = (s) => ({ open: "amber", under_review: "amber", active: "red", acknowledged: "amber", resolved: "green", dismissed: "grey", false_alarm: "grey" }[s] || "grey");

    return (
        <div className="sf-timeline">
            {sosEvents.map((s) => (
                <div key={s._id} className="sf-incident">
                    <div className="sf-incident-icon red">🚨</div>
                    <div className="sf-incident-body">
                        <div className="sf-incident-top"><span className="sf-incident-title">SOS Alert</span><span className={`sf-status ${statusCls(s.status)}`}>{s.status.replace(/_/g, " ")}</span></div>
                        <div className="sf-incident-meta">{s.rideSnapshot?.destination ? `Ride to ${s.rideSnapshot.destination} · ` : ""}{fmt(s.createdAt)}</div>
                        {s.adminNotes && <div className="sf-incident-note">Team: {s.adminNotes}</div>}
                    </div>
                </div>
            ))}
            {reports.map((r) => (
                <div key={r._id} className="sf-incident">
                    <div className="sf-incident-icon">🚩</div>
                    <div className="sf-incident-body">
                        <div className="sf-incident-top"><span className="sf-incident-title">{r.reportType.replace(/_/g, " ")}</span><span className={`sf-status ${statusCls(r.status)}`}>{r.status.replace(/_/g, " ")}</span></div>
                        <div className="sf-incident-meta">{r.reason || "No summary"} · {fmt(r.createdAt)}</div>
                        {r.resolution && <div className="sf-incident-note">Resolution: {r.resolution}</div>}
                    </div>
                </div>
            ))}
        </div>
    );
};

/* ---------------- Guidelines ---------------- */
const Guidelines = () => (
    <div className="sf-guidelines">
        {[
            ["Verify before you ride", "Check the driver's verified badge, name, vehicle and license plate match what's shown in the app."],
            ["Share your trip", "Use 'Share My Trip' during a ride so a trusted contact can follow your route and ETA live."],
            ["Add emergency contacts", "Keep at least one primary contact so they're alerted instantly if you trigger SOS."],
            ["Use SOS in an emergency", "The SOS button shares your location and ride details with your contacts and our safety team. For immediate danger, also call 112."],
            ["Report concerns", "Report unsafe driving, harassment, vehicle mismatch or fake profiles. Every report is reviewed."],
            ["Protect your privacy", "Never share OTPs or passwords. Keep conversations within in-app chat."],
        ].map(([t, d]) => (
            <div key={t} className="sf-guide-item"><h4>{t}</h4><p>{d}</p></div>
        ))}
        <div className="sf-emergency-line">In an emergency, call <a href="tel:112">112</a> (India) immediately.</div>
    </div>
);

/* ---------------- Support panel (Ola/Uber-style) ----------------
   Opens from the "Need help?" card. Offers quick prefix-command topics with
   canned guidance + deep links, and a "Talk to an agent" hand-off. There's no
   live-agent backend yet, so the hand-off shows a connecting state and then an
   honest "we'll reach out" message with email + 112 fallbacks. */
const SUPPORT_TOPICS = [
    { id: "payment", icon: "💳", label: "Payment & refunds", answer: "For payment or refund issues, open Payments to see your transactions and raise a dispute from the specific payment.", action: { label: "Open Payments", tab: "payments" } },
    { id: "safety", icon: "🛡️", label: "Safety concern", answer: "To report a safety concern, use the Report tab — our safety team reviews every report.", action: { label: "Report a concern", report: true } },
    { id: "ride", icon: "🚗", label: "Ride issue", answer: "For problems with a ride or booking, open My Bookings (as a rider) or My Rides (as a driver) to manage or cancel it.", action: { label: "Open My Bookings", tab: "myBookings" } },
    { id: "verification", icon: "✅", label: "Verification help", answer: "Upload your licence, vehicle RC and photos on the Verification page. Our team reviews submissions and notifies you once done.", action: { label: "Open Verification", tab: "verification" } },
    { id: "account", icon: "👤", label: "Account & profile", answer: "Update your name, phone, photo and notification preferences from your Profile page.", action: { label: "Open Profile", tab: "profile" } },
];

function SupportModal({ onClose, onNavigate, onReport }) {
    const greeting = { role: "bot", text: "Hi 👋 How can we help you today? Pick a topic below, or connect to a support agent.", chips: "menu" };
    const [messages, setMessages] = useState([greeting]);
    const [connecting, setConnecting] = useState(false);
    // Live agent session state.
    const [live, setLive] = useState(null);     // the SupportSession (or null)
    const [text, setText] = useState("");
    const bodyRef = useRef(null);
    const liveRef = useRef(null);

    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    useEffect(() => {
        bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, connecting, live?.messages?.length]);

    // Poll the live session for agent replies while one is open.
    useEffect(() => {
        if (!live) return;
        liveRef.current = live._id;
        const poll = async () => {
            try {
                const { data } = await getMySupportSession();
                if (data && data._id === liveRef.current) setLive(data);
            } catch { /* ignore */ }
        };
        const t = setInterval(poll, 3000);
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [live?._id]);

    const push = (m) => setMessages((p) => [...p, m]);

    const pickTopic = (t) => {
        push({ role: "user", text: t.label });
        push({ role: "bot", text: t.answer, action: t.action, chips: "after" });
    };
    const backToMenu = () => push({ role: "bot", text: "Sure — what do you need help with?", chips: "menu" });

    const talkToAgent = async (topic = "General help") => {
        setConnecting(true);
        try {
            const { data } = await requestSupport(topic);
            setLive(data);
        } catch {
            push({ role: "bot", text: "Couldn't reach support right now. For urgent safety issues, please call 112 or email us.", agent: true });
        } finally {
            setConnecting(false);
        }
    };

    const sendLive = async () => {
        const t = text.trim();
        if (!t || !live) return;
        try {
            const { data } = await sendSupportMessage(live._id, t);
            setLive(data); setText("");
        } catch { /* ignore */ }
    };

    const endLive = async () => {
        if (!live) return;
        try { await closeMySupport(live._id); } catch { /* ignore */ }
        setLive(null);
        push({ role: "bot", text: "Chat ended. We're here whenever you need us!", chips: "menu" });
    };

    const runAction = (a) => {
        if (!a) return;
        if (a.tab) { onNavigate?.(a.tab); onClose(); }
        else if (a.report) { onReport?.(); }
    };

    const fmtT = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

    return (
        <div className="sf-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="sf-support" role="dialog" aria-modal="true" aria-label="Support">
                <div className="sf-support-head">
                    <div className="sf-support-head-l">
                        <span className="sf-support-avatar">🛟</span>
                        <div>
                            <div className="sf-support-title">Support</div>
                            <div className="sf-support-status">
                                {live ? (live.status === "active" ? `Connected · ${live.agentName || "Agent"}` : "Waiting for an agent…") : "Quick help · agent on request"}
                            </div>
                        </div>
                    </div>
                    <button className="sf-support-close" onClick={onClose} aria-label="Close">✕</button>
                </div>

                {live ? (
                    <>
                        <div className="sf-support-body" ref={bodyRef}>
                            {(live.messages || []).map((m, i) => (
                                m.from === "system" ? (
                                    <div key={i} className="sf-sup-sysline">{m.text}</div>
                                ) : (
                                    <div key={i} className={`sf-sup-row ${m.from === "agent" ? "bot" : "user"}`}>
                                        <div className="sf-sup-bubble">
                                            <p className="sf-sup-text">{m.text}</p>
                                            <span className="sf-sup-time">{m.senderName || (m.from === "agent" ? "Agent" : "You")} · {fmtT(m.at)}</span>
                                        </div>
                                    </div>
                                )
                            ))}
                            {live.status === "waiting" && (
                                <div className="sf-sup-row bot">
                                    <div className="sf-sup-bubble connecting"><span className="sf-sup-typing"><i /><i /><i /></span>Waiting for an agent to join…</div>
                                </div>
                            )}
                        </div>
                        <div className="sf-sup-compose">
                            <input
                                className="sf-sup-field"
                                placeholder="Type your message…"
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") sendLive(); }}
                            />
                            <button className="sf-sup-send" onClick={sendLive}>Send</button>
                            <button className="sf-sup-end" onClick={endLive} title="End chat">End</button>
                        </div>
                    </>
                ) : (
                    <div className="sf-support-body" ref={bodyRef}>
                        {messages.map((m, i) => (
                            <div key={i} className={`sf-sup-row ${m.role}`}>
                                <div className="sf-sup-bubble">
                                    <p className="sf-sup-text">{m.text}</p>
                                    {m.action && <button className="sf-sup-action" onClick={() => runAction(m.action)}>{m.action.label} →</button>}
                                    {m.chips === "menu" && (
                                        <div className="sf-sup-chips">
                                            {SUPPORT_TOPICS.map((t) => (
                                                <button key={t.id} className="sf-sup-chip" onClick={() => pickTopic(t)}>{t.icon} {t.label}</button>
                                            ))}
                                            <button className="sf-sup-chip agent" onClick={() => talkToAgent()}>🧑‍💼 Talk to an agent</button>
                                        </div>
                                    )}
                                    {m.chips === "after" && (
                                        <div className="sf-sup-chips">
                                            <button className="sf-sup-chip agent" onClick={() => talkToAgent()}>🧑‍💼 Talk to an agent</button>
                                            <button className="sf-sup-chip" onClick={backToMenu}>↩ Other topics</button>
                                        </div>
                                    )}
                                    {m.agent && (
                                        <div className="sf-sup-agent-actions">
                                            <a className="sf-sup-action" href="mailto:support@rideshare.app?subject=RidexShare%20Support%20Request">✉ Email us</a>
                                            <a className="sf-sup-action danger" href="tel:112">📞 Call 112</a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {connecting && (
                            <div className="sf-sup-row bot">
                                <div className="sf-sup-bubble connecting">
                                    <span className="sf-sup-typing"><i /><i /><i /></span>
                                    Connecting you to a support agent…
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default SafetyCenter;

/* ---------------- Email us — in-app support ticket ----------------
   Opens from the "Need help?" card. The user's name + email are fetched from
   their account (read-only). They enter a Topic + Description; on submit the
   backend stores a ticket and emails our support inbox from the platform's own
   address (nothing lands in the user's mailbox). */
function EmailUsModal({ onClose, onNavigate }) {
    const [me, setMe] = useState(null);
    const [topic, setTopic] = useState("");
    const [description, setDescription] = useState("");
    const [sending, setSending] = useState(false);
    const [done, setDone] = useState(false);

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
            await submitSupportTicket(topic.trim(), description.trim());
            setDone(true);
            toast.success("Request sent! We'll get back to you by email.");
        } catch (err) {
            toast.error(err.response?.data?.message || "Couldn't send your request. Please try again.");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="sf-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="sf-modal" role="dialog" aria-modal="true" aria-label="Email us">
                {done ? (
                    <div style={{ textAlign: "center", padding: "0.5rem 0" }}>
                        <div className="sf-feature-icon green" style={{ margin: "0 auto 0.8rem" }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        </div>
                        <h3 className="sf-modal-title" style={{ marginBottom: "0.4rem" }}>Request received</h3>
                        <p className="sf-muted" style={{ marginBottom: "1.1rem" }}>Thanks! Our team will reply in Support and notify you. We'll also email {me?.email || "your account email"}.</p>
                        <div className="sf-modal-actions" style={{ justifyContent: "center" }}>
                            <button className="sf-btn ghost" onClick={onClose}>Done</button>
                            {onNavigate && <button className="sf-btn" onClick={() => { onClose(); onNavigate("support"); }}>View in Support</button>}
                        </div>
                    </div>
                ) : (
                    <form onSubmit={submit}>
                        <h3 className="sf-modal-title">Email us</h3>
                        <p className="sf-muted" style={{ margin: "0 0 0.6rem" }}>We'll reply to your account email. No need to type your details.</p>

                        <div className="sf-row">
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <label className="sf-label">Name</label>
                                <input className="sf-input" value={me?.name || ""} readOnly disabled />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <label className="sf-label">Email</label>
                                <input className="sf-input" value={me?.email || ""} readOnly disabled />
                            </div>
                        </div>

                        <label className="sf-label">Topic *</label>
                        <input className="sf-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's this about?" maxLength={150} required />

                        <label className="sf-label">Description *</label>
                        <textarea className="sf-input sf-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your issue or question…" maxLength={4000} required />

                        <div className="sf-modal-actions">
                            <button type="button" className="sf-btn ghost" onClick={onClose} disabled={sending}>Cancel</button>
                            <button type="submit" className="sf-btn" disabled={sending}>{sending ? "Sending…" : "Send Request"}</button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
