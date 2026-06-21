import React, { useEffect, useState, useRef } from "react";
import { toast } from "react-toastify";
import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL, MAX_AVATAR_BYTES } from "../utils/constants";
import {
    getProfile,
    updateProfile,
    changePassword,
    updateNotificationPrefs,
    uploadToCloudinary,
    isCloudinaryConfigured,
} from "../services/profileService";
import { getUserVehicles } from "../services/vehicleService";
import { getUserReviews } from "../services/reviewService";
import { getMyImpact } from "../services/sustainabilityService";
import PwaStatus from "./pwa/PwaStatus";
import { getPasswordStrength } from "../utils/registerValidation";
import ThemedSelect from "./ThemedSelect";
import "../styles/profile.css";
import "../styles/reviews.css";

/* ---------------- lightweight inline icons ---------------- */
const I = {
    user: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></>,
    at: <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
    mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>,
    phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
    role: <><path d="M20 7h-9M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></>,
    gender: <><circle cx="12" cy="10" r="5" /><path d="M12 15v7M9 19h6" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    camera: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>,
    car: <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />,
    ticket: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
    check: <polyline points="20 6 9 17 4 12" />,
    checkC: <><circle cx="12" cy="12" r="10" /><polyline points="9 12 11.5 14.5 16 9.5" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 2 11s3.5 7 10 7a9.12 9.12 0 0 0 5.39-1.61" /><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88M1 1l22 22" /></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />,
    rupee: <><path d="M6 4h12M6 9h12M9 4c3.3 0 5 2 5 5s-1.7 5-5 5H6l9 6" /></>,
    globe: <><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" /></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></>,
    leaf: <><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></>,
    chevron: <polyline points="9 18 15 12 9 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
};

const Svg = ({ children, size = 18 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
);

const FieldIcon = ({ children }) => <span className="pf-input-icon"><Svg size={16}>{children}</Svg></span>;

const StatBox = ({ icon, label, value, sub, accent }) => (
    <div className={`pf-stat accent-${accent}`}>
        <div className="pf-stat-head">
            <span className="pf-stat-icon"><Svg size={18}>{icon}</Svg></span>
            <svg className="pf-stat-spark" viewBox="0 0 60 24" fill="none" preserveAspectRatio="none" aria-hidden="true">
                <path d="M1 18 L9 12 L17 15 L26 7 L35 12 L44 5 L52 9 L59 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </div>
        <div className="pf-stat-value">{value}</div>
        <div className="pf-stat-label">{label}</div>
        {sub != null && <div className="pf-stat-sub">{sub}</div>}
    </div>
);

const Toggle = ({ checked, onChange, label, desc, disabled }) => (
    <div className="pf-toggle-row">
        <div className="pf-toggle-text">
            <span className="pf-toggle-label">{label}</span>
            {desc && <span className="pf-toggle-desc">{desc}</span>}
        </div>
        <button
            type="button" role="switch" aria-checked={checked} aria-label={label}
            className={`pf-switch${checked ? " on" : ""}`}
            onClick={() => !disabled && onChange(!checked)} disabled={disabled}
        >
            <span className="pf-switch-knob" />
        </button>
    </div>
);

const TrustGauge = ({ score }) => {
    const r = 26, c = 2 * Math.PI * r, off = c - (Math.max(0, Math.min(100, score)) / 100) * c;
    return (
        <svg className="pf-gauge" width="66" height="66" viewBox="0 0 66 66" aria-hidden="true">
            <circle cx="33" cy="33" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
            <circle cx="33" cy="33" r={r} fill="none" stroke="url(#pfg)" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 33 33)" />
            <defs><linearGradient id="pfg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#34d399" /><stop offset="1" stopColor="#7c3aed" /></linearGradient></defs>
        </svg>
    );
};

const memberSince = (iso) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" }); }
    catch { return "—"; }
};

/* ---------------- ratings & reviews ui ---------------- */
const initialsOf = (name = "") =>
    name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "U";

const relTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
    if (diff < 172800) return "Yesterday";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const StaticStars = ({ value = 0, size = 14 }) => (
    <span className="rv-rev-stars" aria-label={`${value} out of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
            <svg key={n} width={size} height={size} viewBox="0 0 24 24"
                fill="currentColor" stroke="none" className={n <= Math.round(value) ? "" : "off"}>
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
            </svg>
        ))}
    </span>
);

const CATEGORY_LABELS = {
    driving: "Driving Quality", punctuality: "Punctuality", communication: "Communication",
    vehicle: "Vehicle Condition", behavior: "Behavior",
};

const RatingSummary = ({ side }) => {
    const count = side?.count || 0;
    const average = side?.average || 0;
    const cats = side?.categories || {};
    const catKeys = Object.keys(cats);
    return (
        <div className="rv-summary">
            <div className="rv-summary-score">
                <span className="rv-score-num">{count ? average.toFixed(1) : "—"}</span>
                <StaticStars value={average} size={16} />
                <span className="rv-score-count">{count} review{count === 1 ? "" : "s"}</span>
            </div>
            {count > 0 && catKeys.length > 0 && (
                <div className="rv-summary-cats">
                    {catKeys.map((k) => (
                        <div className="rv-bar-row" key={k}>
                            <span className="rv-bar-label">{CATEGORY_LABELS[k] || k}</span>
                            <span className="rv-bar-track"><span className="rv-bar-fill" style={{ width: `${((cats[k] || 0) / 5) * 100}%` }} /></span>
                            <span className="rv-bar-val">{(cats[k] || 0).toFixed(1)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const ProfilePage = ({ onOpenSidebar, onUserUpdated, onNavigate }) => {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({ name: "", phoneNumber: "", gender: "" });
    const [savingProfile, setSavingProfile] = useState(false);

    const [avatarUploading, setAvatarUploading] = useState(false);
    const fileRef = useRef(null);

    const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
    const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
    const [savingPw, setSavingPw] = useState(false);
    const [pwOpen, setPwOpen] = useState(false);

    const [stats, setStats] = useState({ created: 0, bookings: 0, completed: 0, vehicles: 0 });
    const [upcomingCount, setUpcomingCount] = useState(0);
    const [recent, setRecent] = useState([]);
    const [impact, setImpact] = useState(null);

    const [prefs, setPrefs] = useState({ email: true, rideUpdates: true, promotions: false });
    const [savingPrefs, setSavingPrefs] = useState(false);

    const [roleSide, setRoleSide] = useState("driver");
    const [reviews, setReviews] = useState([]);
    const [reviewsLoading, setReviewsLoading] = useState(false);

    const strength = getPasswordStrength(pw.next);

    useEffect(() => {
        let active = true;
        (async () => {
            setLoading(true);
            try {
                const { data } = await getProfile();
                if (!active) return;
                setProfile(data);
                setForm({ name: data.name || "", phoneNumber: data.phoneNumber || "", gender: data.gender || "" });
                if (data.notificationPrefs) setPrefs(data.notificationPrefs);
            } catch {
                if (active) toast.error("Failed to load your profile.");
            } finally {
                if (active) setLoading(false);
            }

            const pick = (r) => (r.status === "fulfilled" && Array.isArray(r.value?.data) ? r.value.data : []);
            const [createdR, bookingsR, historyR, vehiclesR, impactR] = await Promise.allSettled([
                axiosInstance.get(`${API_BASE_URL}/rides/user-rides`),
                axiosInstance.get(`${API_BASE_URL}/rides/my-bookings`),
                axiosInstance.get(`${API_BASE_URL}/rides/history`),
                getUserVehicles(),
                getMyImpact(),
            ]);
            if (!active) return;
            const created = pick(createdR);
            const bookings = pick(bookingsR);
            const history = pick(historyR);
            const vehicles = pick(vehiclesR);
            const completed = history.filter((r) => r.status === "Completed").length;
            setStats({ created: created.length, bookings: bookings.length, completed, vehicles: vehicles.length });
            if (impactR.status === "fulfilled") setImpact(impactR.value?.data || null);

            // Upcoming trips (future, active) across created + booked.
            const now = Date.now();
            const isUpcoming = (r) => {
                const tt = r?.timing ? new Date(r.timing).getTime() : 0;
                return tt > now && r.status !== "Completed" && r.status !== "Cancelled";
            };
            setUpcomingCount([...created, ...bookings].filter(isUpcoming).length);

            // Recent activity timeline (newest first).
            const items = [
                ...created.map((r) => ({ type: "created", at: r.createdAt, title: "Created a new ride", sub: `${r.source} → ${r.destination}` })),
                ...history.map((r) => ({ type: "completed", at: r.tracking?.endedAt || r.updatedAt || r.timing, title: "Completed a ride", sub: `${r.source} → ${r.destination}` })),
                ...vehicles.map((v) => ({ type: "vehicle", at: v.updatedAt || v.createdAt, title: "Updated vehicle details", sub: `${v.make} ${v.model}` })),
            ].filter((x) => x.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5);
            setRecent(items);
        })();
        return () => { active = false; };
    }, []);

    useEffect(() => {
        const userId = profile?._id;
        if (!userId) return;
        let active = true;
        setReviewsLoading(true);
        getUserReviews(userId, { direction: roleSide, limit: 50 })
            .then(({ data }) => { if (active) setReviews(Array.isArray(data?.reviews) ? data.reviews : []); })
            .catch(() => { if (active) setReviews([]); })
            .finally(() => { if (active) setReviewsLoading(false); });
        return () => { active = false; };
    }, [profile?._id, roleSide]);

    const isGoogleAccount = profile?.authProvider === "google";

    const handleAvatarPick = () => {
        if (!isCloudinaryConfigured()) {
            toast.info("Image upload isn't configured yet. Add your Cloudinary keys to enable it.");
            return;
        }
        fileRef.current?.click();
    };

    const handleAvatarFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (!file.type.startsWith("image/")) { toast.error("Please choose an image file."); return; }
        if (file.size > MAX_AVATAR_BYTES) { toast.error("Image is too large (max 1 MB)."); return; }
        setAvatarUploading(true);
        try {
            const url = await uploadToCloudinary(file);
            const { data } = await updateProfile({ profilePicture: url });
            setProfile(data.user);
            if (onUserUpdated) onUserUpdated(data.user);
            toast.success("Profile photo updated!");
        } catch {
            toast.error("Photo upload failed. Please try again.");
        } finally {
            setAvatarUploading(false);
        }
    };

    const startEdit = () => {
        setForm({ name: profile.name || "", phoneNumber: profile.phoneNumber || "", gender: profile.gender || "" });
        setEditing(true);
    };
    const cancelEdit = () => {
        setForm({ name: profile.name || "", phoneNumber: profile.phoneNumber || "", gender: profile.gender || "" });
        setEditing(false);
    };

    const saveProfile = async () => {
        if (!form.name.trim()) return toast.error("Name cannot be empty");
        if (!/^\d{10}$/.test(form.phoneNumber)) return toast.error("Phone number must be 10 digits");
        if (!["Male", "Female"].includes(form.gender)) return toast.error("Please select a gender");
        setSavingProfile(true);
        try {
            const { data } = await updateProfile({ name: form.name.trim(), phoneNumber: form.phoneNumber, gender: form.gender });
            setProfile(data.user);
            setEditing(false);
            if (onUserUpdated) onUserUpdated(data.user);
            toast.success("Profile updated successfully!");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to update profile");
        } finally {
            setSavingProfile(false);
        }
    };

    const submitPassword = async (e) => {
        e.preventDefault();
        if (savingPw) return;
        if (!pw.current || !pw.next) return toast.error("Please fill in all password fields");
        if (pw.next.length < 6) return toast.error("New password must be at least 6 characters");
        if (pw.next !== pw.confirm) return toast.error("New passwords do not match");
        setSavingPw(true);
        try {
            await changePassword(pw.current, pw.next);
            toast.success("Password changed successfully!");
            setPw({ current: "", next: "", confirm: "" });
            setPwOpen(false);
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to change password");
        } finally {
            setSavingPw(false);
        }
    };

    const togglePref = async (key, value) => {
        const prev = prefs;
        const next = { ...prefs, [key]: value };
        setPrefs(next);
        setSavingPrefs(true);
        try {
            await updateNotificationPrefs({ [key]: value });
        } catch {
            setPrefs(prev);
            toast.error("Failed to update preferences");
        } finally {
            setSavingPrefs(false);
        }
    };

    if (loading) {
        return (
            <div className="pf-root">
                <div className="pf-card pf-skeleton" style={{ height: 140 }} />
                <div className="pf-grid3">
                    <div className="pf-card pf-skeleton" style={{ height: 320 }} />
                    <div className="pf-card pf-skeleton" style={{ height: 320 }} />
                    <div className="pf-card pf-skeleton" style={{ height: 320 }} />
                </div>
            </div>
        );
    }

    if (!profile) {
        return <div className="pf-root"><div className="pf-card pf-empty">Couldn't load your profile. Please refresh.</div></div>;
    }

    const initials = (profile.name || "U").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

    // Verification + trust score (derived from existing profile data).
    const emailVerified = !!profile.isVerified;
    const phoneVerified = !!profile.phoneNumber;
    const universityVerified = /@paruluniversity\.ac\.in$/i.test(profile.email || "");
    const idVerified = !!profile.isDriverVerified;
    const verifs = [
        ["Email Verified", emailVerified],
        ["Phone Verified", phoneVerified],
        ["University Verified", universityVerified],
        ["ID Verified", idVerified],
    ];
    const verifiedCount = verifs.filter(([, v]) => v).length;

    const dr = profile.ratings?.driver || {};
    const pr = profile.ratings?.passenger || {};
    const ratingCount = (dr.count || 0) + (pr.count || 0);
    const ratingAvg = ratingCount ? ((dr.average || 0) * (dr.count || 0) + (pr.average || 0) * (pr.count || 0)) / ratingCount : 0;

    let trust = 50 + verifiedCount * 10;
    if (ratingCount > 0) trust += Math.min(Math.round((ratingAvg / 5) * 10), 10);
    trust = Math.min(100, trust);
    const trustLabel = trust >= 90 ? "Excellent" : trust >= 75 ? "Great" : trust >= 60 ? "Good" : "Building";

    const moneySaved = impact?.passenger?.moneySavedInr ?? 0;
    const co2Saved = impact?.total?.co2SavedKg ?? 0;
    const studentsHelped = impact?.driver?.passengersTransported ?? 0;
    const sharedTrips = impact?.total?.sharedTrips ?? 0;

    const ratings = profile.ratings || {};
    const side = ratings[roleSide] || {};
    const hasAnyReviews = (ratings.driver?.count || 0) + (ratings.passenger?.count || 0) > 0;

    const activityIcon = (type) => type === "completed" ? I.checkC : type === "vehicle" ? I.car : I.ticket;

    return (
        <div className="pf-root">
            {/* Top bar */}
            <div className="pf-topbar">
                <button className="pf-hamburger" onClick={onOpenSidebar} aria-label="Open menu">
                    <Svg size={22}><><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></></Svg>
                </button>
                <div className="pf-heading">
                    <h1 className="pf-topbar-title">My Profile</h1>
                    <p className="pf-topbar-sub">Manage your account, preferences and ride experience</p>
                </div>
            </div>

            {/* ---------- Hero / identity + trust ---------- */}
            <section className="pf-card pf-hero pf-rise">
                <div className="pf-hero-id">
                    <div className="pf-avatar-wrap">
                        <div className="pf-avatar">
                            {profile.profilePicture ? <img src={profile.profilePicture} alt={profile.name} /> : <span className="pf-avatar-initials">{initials}</span>}
                            {avatarUploading && <span className="pf-avatar-spinner" aria-label="Uploading" />}
                        </div>
                        <button type="button" className="pf-avatar-btn" onClick={handleAvatarPick} disabled={avatarUploading} aria-label="Change profile photo">
                            <Svg size={15}>{I.camera}</Svg>
                        </button>
                        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarFile} />
                    </div>

                    <div className="pf-hero-info">
                        <div className="pf-name-row">
                            <h2 className="pf-name">{profile.name}</h2>
                            <span className="pf-role-badge">{profile.role}</span>
                        </div>
                        <p className="pf-username">@{profile.username}</p>
                        <div className="pf-verify-chips">
                            {emailVerified && <span className="pf-vchip green"><Svg size={12}>{I.checkC}</Svg> Email Verified</span>}
                            {phoneVerified && <span className="pf-vchip blue"><Svg size={12}>{I.checkC}</Svg> Phone Verified</span>}
                            {universityVerified && <span className="pf-vchip amber"><Svg size={12}>{I.checkC}</Svg> University Verified</span>}
                        </div>
                        <div className="pf-hero-meta">
                            <span><Svg size={13}>{I.calendar}</Svg> Member since {memberSince(profile.createdAt)}</span>
                            {isGoogleAccount && <span><Svg size={13}>{I.mail}</Svg> Google account</span>}
                        </div>
                    </div>
                </div>

                <div className="pf-trust">
                    <div className="pf-trust-top">
                        <span className="pf-trust-shield"><Svg size={18}>{I.shield}</Svg></span>
                        <div className="pf-trust-score">
                            <div className="pf-trust-label">Trust Score</div>
                            <div className="pf-trust-num">{trust}</div>
                            <div className="pf-trust-tag">{trustLabel}</div>
                        </div>
                        <TrustGauge score={trust} />
                        <ul className="pf-trust-list">
                            {verifs.map(([label, ok]) => (
                                <li key={label} className={ok ? "ok" : "off"}>
                                    <Svg size={13}>{ok ? I.checkC : I.shield}</Svg> {label}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <button className="pf-btn ghost pf-edit-btn" onClick={editing ? cancelEdit : startEdit}>
                        <Svg size={14}>{I.edit}</Svg> {editing ? "Cancel Edit" : "Edit Profile"}
                    </button>
                </div>
            </section>

            {/* ---------- Stats ---------- */}
            <section className="pf-stats pf-rise">
                <StatBox accent="violet" icon={I.car} label="Rides Created" value={stats.created} sub="This is amazing!" />
                <StatBox accent="blue" icon={I.ticket} label="Total Bookings" value={stats.bookings} sub={upcomingCount > 0 ? `${upcomingCount} upcoming` : "All caught up"} />
                <StatBox accent="green" icon={I.checkC} label="Completed Trips" value={stats.completed} sub="Great going!" />
                <StatBox accent="amber" icon={I.star} label="Average Rating" value={ratingCount ? ratingAvg.toFixed(1) : "—"} sub={`Based on ${ratingCount} review${ratingCount === 1 ? "" : "s"}`} />
                <StatBox accent="violet" icon={I.rupee} label="Saved with RidexShare" value={`₹${moneySaved.toLocaleString("en-IN")}`} sub="Keep sharing!" />
            </section>

            {/* ---------- 3-column grid ---------- */}
            <div className="pf-grid3">
                {/* === Column 1 === */}
                <div className="pf-col">
                    {/* Personal Information */}
                    <section className="pf-card pf-rise">
                        <div className="pf-card-head">
                            <h2 className="pf-card-title"><Svg size={16}>{I.user}</Svg> Personal Information</h2>
                            {editing && (
                                <div className="pf-head-actions">
                                    <button className="pf-btn ghost sm" onClick={cancelEdit} disabled={savingProfile}>Cancel</button>
                                    <button className="pf-btn sm" onClick={saveProfile} disabled={savingProfile}>{savingProfile ? <span className="pf-spinner" /> : "Save"}</button>
                                </div>
                            )}
                        </div>

                        <div className="pf-field">
                            <label className="pf-label" htmlFor="pf-name">Full Name</label>
                            <div className="pf-input-wrap">
                                <FieldIcon>{I.user}</FieldIcon>
                                <input id="pf-name" className="pf-input" value={editing ? form.name : profile.name}
                                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                    disabled={!editing || savingProfile} autoComplete="name" />
                            </div>
                        </div>

                        <div className="pf-field">
                            <label className="pf-label" htmlFor="pf-username">Username</label>
                            <div className="pf-input-wrap">
                                <FieldIcon>{I.at}</FieldIcon>
                                <input id="pf-username" className="pf-input" value={profile.username} disabled readOnly />
                            </div>
                        </div>

                        <div className="pf-field">
                            <label className="pf-label" htmlFor="pf-email">Email</label>
                            <div className="pf-input-wrap">
                                <FieldIcon>{I.mail}</FieldIcon>
                                <input id="pf-email" className="pf-input" value={profile.email} disabled readOnly />
                                {emailVerified && <span className="pf-readonly-tag verified">Verified</span>}
                            </div>
                        </div>

                        <div className="pf-field">
                            <label className="pf-label" htmlFor="pf-phone">Phone Number</label>
                            <div className="pf-input-wrap">
                                <FieldIcon>{I.phone}</FieldIcon>
                                <input id="pf-phone" className="pf-input" type="tel" inputMode="numeric" maxLength={10}
                                    value={editing ? form.phoneNumber : profile.phoneNumber}
                                    onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                                    disabled={!editing || savingProfile} autoComplete="tel" />
                                {!editing && phoneVerified && <span className="pf-readonly-tag verified">Verified</span>}
                            </div>
                        </div>

                        <div className="pf-row">
                            <div className="pf-field">
                                <label className="pf-label" htmlFor="pf-gender">Gender</label>
                                {editing ? (
                                    <ThemedSelect id="pf-gender" ariaLabel="Gender" theme="dark" value={form.gender}
                                        onChange={(v) => setForm((f) => ({ ...f, gender: v }))} placeholder="Select Gender"
                                        disabled={savingProfile} icon={<FieldIcon>{I.gender}</FieldIcon>}
                                        options={[{ value: "Male", label: "Male" }, { value: "Female", label: "Female" }]} />
                                ) : (
                                    <div className="pf-input-wrap"><FieldIcon>{I.gender}</FieldIcon><input className="pf-input" value={profile.gender} disabled readOnly /></div>
                                )}
                            </div>
                            <div className="pf-field">
                                <label className="pf-label" htmlFor="pf-role">Role</label>
                                <div className="pf-input-wrap">
                                    <FieldIcon>{I.role}</FieldIcon>
                                    <input id="pf-role" className="pf-input" value={profile.role} disabled readOnly />
                                    <span className="pf-readonly-tag">Fixed</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Ratings & Reviews */}
                    <section className="pf-card pf-rise">
                        <div className="pf-card-head">
                            <h2 className="pf-card-title"><Svg size={16}>{I.star}</Svg> Ratings &amp; Reviews</h2>
                            <div className="rv-roletabs" role="tablist" aria-label="Review type">
                                <button role="tab" aria-selected={roleSide === "driver"} className={`rv-roletab${roleSide === "driver" ? " active" : ""}`} onClick={() => setRoleSide("driver")}>As Driver</button>
                                <button role="tab" aria-selected={roleSide === "passenger"} className={`rv-roletab${roleSide === "passenger" ? " active" : ""}`} onClick={() => setRoleSide("passenger")}>As Passenger</button>
                            </div>
                        </div>
                        <RatingSummary side={side} />
                        {reviewsLoading ? (
                            <div className="rv-loading"><span className="rv-spin" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} /></div>
                        ) : reviews.length > 0 ? (
                            <div className="rv-list">
                                {reviews.map((r) => (
                                    <div className="rv-review" key={r._id}>
                                        <div className="rv-rev-avatar">
                                            {r.reviewer?.profilePicture ? <img src={r.reviewer.profilePicture} alt={r.reviewer?.name || "User"} /> : <span>{initialsOf(r.reviewer?.name)}</span>}
                                        </div>
                                        <div className="rv-rev-body">
                                            <div className="rv-rev-top"><span className="rv-rev-name">{r.reviewer?.name || "User"}</span><span className="rv-rev-date">{relTime(r.createdAt)}</span></div>
                                            <StaticStars value={r.rating} />
                                            {r.comment && <p className="rv-rev-comment">{r.comment}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="rv-empty">
                                <span className="rv-empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" /></svg></span>
                                <span className="rv-empty-title">No reviews yet</span>
                                <span className="rv-empty-sub">{hasAnyReviews ? `No reviews as a ${roleSide} yet. Reviews appear here after completed rides.` : "Reviews from your completed rides will show up here."}</span>
                            </div>
                        )}
                    </section>
                </div>

                {/* === Column 2 === */}
                <div className="pf-col">
                    {/* Security */}
                    <section className="pf-card pf-rise">
                        <div className="pf-card-head">
                            <h2 className="pf-card-title"><Svg size={16}>{I.shield}</Svg> Security</h2>
                        </div>
                        <p className="pf-card-sub">Your account is secure and protected</p>

                        {isGoogleAccount && (
                            <div className="pf-sec-row static">
                                <span className="pf-sec-icon">G</span>
                                <div className="pf-sec-text"><span className="pf-sec-label">Google Account</span><span className="pf-sec-meta">Sign-in managed by Google</span></div>
                                <span className="pf-sec-tag green">Connected</span>
                            </div>
                        )}

                        {isGoogleAccount ? (
                            <p className="pf-note">You signed in with Google — manage your password from your Google account.</p>
                        ) : (
                            <>
                                <button type="button" className="pf-sec-row" onClick={() => setPwOpen((o) => !o)} aria-expanded={pwOpen}>
                                    <span className="pf-sec-icon"><Svg size={16}>{I.lock}</Svg></span>
                                    <div className="pf-sec-text"><span className="pf-sec-label">Password</span><span className="pf-sec-meta">Change your account password</span></div>
                                    <span className={`pf-sec-chev${pwOpen ? " open" : ""}`}><Svg size={16}>{I.chevron}</Svg></span>
                                </button>

                                {pwOpen && (
                                    <form className="pf-pw-form" onSubmit={submitPassword}>
                                        {[
                                            { key: "current", label: "Current Password", ac: "current-password" },
                                            { key: "next", label: "New Password", ac: "new-password" },
                                            { key: "confirm", label: "Confirm New Password", ac: "new-password" },
                                        ].map(({ key, label, ac }) => (
                                            <div className="pf-field" key={key}>
                                                <label className="pf-label" htmlFor={`pf-pw-${key}`}>{label}</label>
                                                <div className="pf-input-wrap">
                                                    <FieldIcon>{I.lock}</FieldIcon>
                                                    <input id={`pf-pw-${key}`} className="pf-input pf-has-toggle" type={showPw[key] ? "text" : "password"}
                                                        value={pw[key]} onChange={(e) => setPw((p) => ({ ...p, [key]: e.target.value }))}
                                                        autoComplete={ac} disabled={savingPw}
                                                        placeholder={key === "current" ? "Enter current password" : "Min. 6 characters"} />
                                                    <button type="button" className="pf-pw-toggle" onClick={() => setShowPw((s) => ({ ...s, [key]: !s[key] }))}
                                                        aria-label={showPw[key] ? "Hide password" : "Show password"} aria-pressed={showPw[key]}>
                                                        <Svg size={16}>{showPw[key] ? I.eyeOff : I.eye}</Svg>
                                                    </button>
                                                </div>
                                                {key === "next" && pw.next && (
                                                    <div className="pf-strength" aria-live="polite">
                                                        <div className={`pf-strength-bar lvl-${strength.level}`}><span /><span /><span /></div>
                                                        <span className={`pf-strength-label lvl-${strength.level}`}>{strength.label}</span>
                                                    </div>
                                                )}
                                                {key === "confirm" && pw.confirm && pw.confirm === pw.next && (
                                                    <span className="pf-match-ok"><Svg size={12}>{I.check}</Svg> Passwords match</span>
                                                )}
                                            </div>
                                        ))}
                                        <button type="submit" className="pf-btn full" disabled={savingPw}>{savingPw ? <span className="pf-spinner" /> : "Change Password"}</button>
                                    </form>
                                )}
                            </>
                        )}
                    </section>

                    {/* Community Impact */}
                    <section className="pf-card pf-rise">
                        <div className="pf-card-head">
                            <h2 className="pf-card-title"><Svg size={16}>{I.leaf}</Svg> Community Impact</h2>
                        </div>
                        <p className="pf-card-sub">Your contribution towards a better environment</p>
                        <div className="pf-impact">
                            <div className="pf-impact-cell"><span className="pf-impact-icon green"><Svg size={18}>{I.leaf}</Svg></span><span className="pf-impact-value">{co2Saved.toLocaleString("en-IN", { maximumFractionDigits: 1 })} kg</span><span className="pf-impact-label">CO₂ Saved</span></div>
                            <div className="pf-impact-cell"><span className="pf-impact-icon blue"><Svg size={18}>{I.users}</Svg></span><span className="pf-impact-value">{studentsHelped}</span><span className="pf-impact-label">Students Helped</span></div>
                            <div className="pf-impact-cell"><span className="pf-impact-icon violet"><Svg size={18}>{I.globe}</Svg></span><span className="pf-impact-value">{sharedTrips}</span><span className="pf-impact-label">Shared Trips</span></div>
                        </div>
                        <button className="pf-row-link" onClick={() => onNavigate?.("sustainability")}>
                            Learn more about impact <Svg size={15}>{I.chevron}</Svg>
                        </button>
                    </section>
                </div>

                {/* === Column 3 === */}
                <div className="pf-col">
                    {/* Notification Settings */}
                    <section className="pf-card pf-rise">
                        <div className="pf-card-head">
                            <h2 className="pf-card-title"><Svg size={16}>{I.bell}</Svg> Notification Settings</h2>
                        </div>
                        <Toggle label="Email notifications" desc="Account and security emails" checked={prefs.email} disabled={savingPrefs} onChange={(v) => togglePref("email", v)} />
                        <Toggle label="Ride updates" desc="Bookings, cancellations, completions" checked={prefs.rideUpdates} disabled={savingPrefs} onChange={(v) => togglePref("rideUpdates", v)} />
                        <Toggle label="Promotions" desc="Offers and product news" checked={prefs.promotions} disabled={savingPrefs} onChange={(v) => togglePref("promotions", v)} />
                    </section>

                    {/* Recent Activity */}
                    <section className="pf-card pf-rise">
                        <div className="pf-card-head">
                            <h2 className="pf-card-title"><Svg size={16}>{I.clock}</Svg> Recent Activity</h2>
                            {recent.length > 0 && <button className="pf-link" onClick={() => onNavigate?.("rideHistory")}>View all</button>}
                        </div>
                        {recent.length === 0 ? (
                            <p className="pf-card-sub">Your recent rides and updates will appear here.</p>
                        ) : (
                            <ul className="pf-activity">
                                {recent.map((a, i) => (
                                    <li key={i} className="pf-activity-row">
                                        <span className={`pf-activity-icon type-${a.type}`}><Svg size={15}>{activityIcon(a.type)}</Svg></span>
                                        <div className="pf-activity-body">
                                            <span className="pf-activity-title">{a.title}</span>
                                            <span className="pf-activity-sub">{a.sub}</span>
                                        </div>
                                        <span className="pf-activity-time">{relTime(a.at)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* App / PWA status */}
                    <section className="pf-card pf-rise" style={{ padding: 0, background: "transparent", border: "none" }}>
                        <PwaStatus />
                    </section>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
