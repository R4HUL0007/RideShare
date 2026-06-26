import React, { useEffect, useState, Suspense, lazy, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL } from "../utils/constants";
import { toast } from "react-toastify";
import brandLogo from "../assets/images/RidexShare.svg";
import "../styles/admin.css";

// Lazy-loaded admin sections
const AdminDashboard = lazy(() => import("../components/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("../components/admin/AdminUsers"));
const AdminRides = lazy(() => import("../components/admin/AdminRides"));
const AdminUnpaidRides = lazy(() => import("../components/admin/AdminUnpaidRides"));
const AdminBookings = lazy(() => import("../components/admin/AdminBookings"));
const AdminPayments = lazy(() => import("../components/admin/AdminPayments"));
const AdminEscrow = lazy(() => import("../components/admin/AdminEscrow"));
const AdminDisputes = lazy(() => import("../components/admin/AdminDisputes"));
const AdminWithdrawals = lazy(() => import("../components/admin/AdminWithdrawals"));
const AdminReviews = lazy(() => import("../components/admin/AdminReviews"));
const AdminLive = lazy(() => import("../components/admin/AdminLive"));
const AdminAuditLogs = lazy(() => import("../components/admin/AdminAuditLogs"));
const AdminNotifications = lazy(() => import("../components/admin/AdminNotifications"));
const AdminAIInsights = lazy(() => import("../components/admin/AdminAIInsights"));
const AdminVerification = lazy(() => import("../components/admin/AdminVerification"));
const AdminSafety = lazy(() => import("../components/admin/AdminSafety"));
const AdminVerificationLogs = lazy(() => import("../components/admin/AdminVerificationLogs"));
const AdminSupport = lazy(() => import("../components/admin/AdminSupport"));
const AdminTickets = lazy(() => import("../components/admin/AdminTickets"));
const AdminPersonalRides = lazy(() => import("../components/admin/AdminPersonalRides"));
const AdminDriverLedger = lazy(() => import("../components/admin/AdminDriverLedger"));
const AdminSettlements = lazy(() => import("../components/admin/AdminSettlements"));

const SECTIONS = [
    { key: "dashboard", label: "Dashboard", icon: "📊" },
    { key: "users", label: "Users", icon: "👥" },
    { key: "rides", label: "Rides", icon: "🚗" },
    { key: "unpaid", label: "Unpaid Rides", icon: "💸" },
    { key: "personalrides", label: "Ride Requests", icon: "🚕" },
    { key: "bookings", label: "Bookings", icon: "📖" },
    { key: "payments", label: "Payments", icon: "💰" },
    { key: "escrow", label: "Escrow", icon: "💳" },
    { key: "ledger", label: "Driver Ledger", icon: "📒" },
    { key: "settlements", label: "Settlements", icon: "🧾" },
    { key: "disputes", label: "Disputes", icon: "⚠️" },
    { key: "withdrawals", label: "Withdrawals", icon: "🏧" },
    { key: "reviews", label: "Reviews", icon: "⭐" },
    { key: "verification", label: "Verification", icon: "🛡️" },
    { key: "ridecheckin", label: "Ride Check-Ins", icon: "🎫" },
    { key: "safety", label: "Safety", icon: "🚨" },
    { key: "support", label: "Live Support", icon: "🛟" },
    { key: "tickets", label: "Tickets", icon: "🎟️" },
    { key: "live", label: "Live Monitor", icon: "📍" },
    { key: "audit", label: "Audit Logs", icon: "📋" },
    { key: "notifications", label: "Notifications", icon: "🔔" },
    { key: "ai", label: "AI Insights", icon: "🤖" },
];

// Per-section subtitle shown under the page title in the top bar.
const SUBTITLES = {
    users: "Manage all users registered on the platform.",
    rides: "Browse and manage every ride on the platform.",
    personalrides: "On-demand ride requests (Uber-style) and their lifecycle.",
    ledger: "Driver earnings ledger from personalized rides.",
    settlements: "Weekly driver payouts and settlement batches.",
    bookings: "Track all passenger bookings.",
    payments: "Review payments and transactions.",
    escrow: "Monitor funds held in escrow.",
    disputes: "Resolve open disputes between members.",
    withdrawals: "Review and process driver withdrawals.",
    reviews: "Moderate member reviews.",
    verification: "Review driver verification submissions.",
    ridecheckin: "Audit ride check-in activity.",
    safety: "Respond to safety reports and SOS events.",
    support: "Chat live with members who need help.",
    tickets: "Support requests submitted via \"Email us\".",
    live: "Live platform activity at a glance.",
    audit: "Trace every admin action.",
    notifications: "Platform alerts that need attention.",
    ai: "AI-powered platform insights.",
};

const AdminPanel = () => {
    const navigate = useNavigate();
    const { section } = useParams();
    const activeSection = SECTIONS.find(s => s.key === section)?.key || "dashboard";
    const [admin, setAdmin] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [notifCount, setNotifCount] = useState(0);
    const [badges, setBadges] = useState({});

    // Auth check — verify the user is logged in AND is admin
    useEffect(() => {
        let active = true;
        const checkAdmin = async () => {
            try {
                // First try hitting an admin endpoint — this triggers auto-promotion
                // for emails in ADMIN_EMAILS (the middleware sets isAdmin=true on first hit)
                const dashRes = await axiosInstance.get(`${API_BASE_URL}/admin/dashboard`).catch(() => null);
                
                if (dashRes && dashRes.status === 200) {
                    // Successfully accessed admin — get user details
                    const { data } = await axiosInstance.get(`${API_BASE_URL}/auth/me`);
                    if (!active) return;
                    setAdmin({ name: data.name, email: data.email, id: data._id, role: data.adminRole });
                    return;
                }

                // If admin endpoint failed, check if user is even logged in
                const { data } = await axiosInstance.get(`${API_BASE_URL}/auth/me`);
                if (!active) return;
                if (!data.isAdmin) {
                    toast.error("Admin access required. Your email is not configured as admin.");
                    navigate("/dashboard");
                    return;
                }
                setAdmin({ name: data.name, email: data.email, id: data._id, role: data.adminRole });
            } catch {
                if (!active) return;
                toast.error("Session expired. Please log in.");
                navigate("/");
            } finally {
                if (active) setLoading(false);
            }
        };
        checkAdmin();
        return () => { active = false; };
    }, [navigate]);

    // Fetch admin notification count for badge
    useEffect(() => {
        if (!admin) return;
        const fetchNotifCount = async () => {
            try {
                const { data } = await axiosInstance.get(`${API_BASE_URL}/admin/notifications`);
                setNotifCount(data?.count || 0);
            } catch { /* ignore */ }
        };
        const fetchBadges = async () => {
            try {
                const { data } = await axiosInstance.get(`${API_BASE_URL}/admin/badges`);
                setBadges(data || {});
            } catch { /* ignore */ }
        };
        fetchNotifCount();
        fetchBadges();
        const interval = setInterval(() => { fetchNotifCount(); fetchBadges(); }, 60000);
        return () => clearInterval(interval);
    }, [admin]);

    const goTo = useCallback((key) => {
        setSidebarOpen(false);
        if (key === "dashboard") {
            navigate("/admin");
        } else {
            navigate(`/admin/${key}`);
        }
    }, [navigate]);

    if (loading) {
        return (
            <div className="adm-root">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                    <div className="adm-spin" />
                </div>
            </div>
        );
    }

    if (!admin) return null;

    const pageTitle = SECTIONS.find(s => s.key === activeSection)?.label || "Dashboard";

    const adminInitials = (admin.name || "")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase() || "A";

    return (
        <div className="adm-root">
            {/* Mobile overlay */}
            <div className={`adm-overlay-bg ${sidebarOpen ? "show" : ""}`} onClick={() => setSidebarOpen(false)} />

            {/* Sidebar */}
            <aside className={`adm-sidebar ${sidebarOpen ? "open" : ""}`}>
                <div className="adm-brand">
                    <span className="adm-brand-tile" aria-hidden="true">
                        <img src={brandLogo} alt="RidexShare" className="brand-logo-img" />
                    </span>
                    <span className="adm-brand-text">
                        RidexShare
                        <span>Admin Panel</span>
                    </span>
                </div>
                <nav className="adm-nav">
                    {SECTIONS.map((s) => (
                        <button
                            key={s.key}
                            className={`adm-nav-item ${activeSection === s.key ? "active" : ""}`}
                            onClick={() => goTo(s.key)}
                        >
                            <span>{s.icon}</span>
                            {s.label}
                            {s.key === "notifications" && notifCount > 0 && (
                                <span className="adm-badge-count">{notifCount}</span>
                            )}
                            {s.key !== "notifications" && badges[s.key] > 0 && (
                                <span className="adm-badge-count">{badges[s.key] > 99 ? "99+" : badges[s.key]}</span>
                            )}
                        </button>
                    ))}
                </nav>
                <div className="adm-nav-foot">
                    <button className="adm-nav-item" onClick={() => navigate("/dashboard")}>
                        <span>🏠</span>
                        Back to App
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <div className="adm-main">
                <header className="adm-topbar">
                    <button className="adm-mobile-toggle" onClick={() => setSidebarOpen(true)} aria-label="Toggle sidebar">
                        ☰
                    </button>
                    <div className="adm-title-block">
                        <div className="adm-page-title">{pageTitle}</div>
                        <div className="adm-title-sub">
                            {activeSection === "dashboard"
                                ? `Welcome back, ${(admin.name || "Admin").split(" ")[0]}. Here's what's happening today.`
                                : (SUBTITLES[activeSection] || "")}
                        </div>
                    </div>
                    <div className="adm-spacer" />
                    <div className="adm-user-pill">
                        <span className="adm-user-avatar" aria-hidden="true">{adminInitials}</span>
                        <span className="adm-user-meta">
                            <strong>{admin.name}</strong>
                            <span>{admin.role || "Admin"}</span>
                        </span>
                    </div>
                    <button className="adm-back-btn" onClick={() => navigate("/dashboard")}>
                        ← Back to App
                    </button>
                </header>
                <div className="adm-content">
                    <Suspense fallback={<div><div className="adm-skel" /><div className="adm-skel" /><div className="adm-skel" /></div>}>
                        {activeSection === "dashboard" && <AdminDashboard />}
                        {activeSection === "users" && <AdminUsers />}
                        {activeSection === "rides" && <AdminRides />}
                        {activeSection === "unpaid" && <AdminUnpaidRides />}
                        {activeSection === "personalrides" && <AdminPersonalRides />}
                        {activeSection === "ledger" && <AdminDriverLedger />}
                        {activeSection === "settlements" && <AdminSettlements />}
                        {activeSection === "bookings" && <AdminBookings />}
                        {activeSection === "payments" && <AdminPayments />}
                        {activeSection === "escrow" && <AdminEscrow />}
                        {activeSection === "disputes" && <AdminDisputes />}
                        {activeSection === "withdrawals" && <AdminWithdrawals />}
                        {activeSection === "reviews" && <AdminReviews />}
                        {activeSection === "verification" && <AdminVerification />}
                        {activeSection === "ridecheckin" && <AdminVerificationLogs />}
                        {activeSection === "safety" && <AdminSafety />}
                        {activeSection === "support" && <AdminSupport />}
                        {activeSection === "tickets" && <AdminTickets />}
                        {activeSection === "live" && <AdminLive />}
                        {activeSection === "audit" && <AdminAuditLogs />}
                        {activeSection === "notifications" && <AdminNotifications />}
                        {activeSection === "ai" && <AdminAIInsights />}
                    </Suspense>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;
