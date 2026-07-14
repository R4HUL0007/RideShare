import React, { useEffect, useState, useRef, useCallback } from "react";
import { toast } from "react-toastify";
import {
    getUserVehicles,
    createVehicle,
    updateVehicle,
    deleteVehicle,
} from "../services/vehicleService";
import { uploadToCloudinary, isCloudinaryConfigured } from "../services/profileService";
import { MAX_AVATAR_BYTES, API_BASE_URL } from "../utils/constants";
import axiosInstance from "../utils/axiosConfig";
import ThemedSelect from "./ThemedSelect";
import "../styles/vehicle.css";
import carImg from "../assets/images/Car.png";

const DEFAULT_VEHICLE_KEY = "rs_default_vehicle";

const VEHICLE_TYPES = ["Car", "Motorcycle", "Scooter", "Auto-rickshaw"];
const AMENITIES = ["AC Available", "Music System", "Charging Port", "Spacious", "Clean & Well Maintained"];

// Seating capacity options depend on the vehicle type. Two-wheelers carry a
// single passenger; autos a few; cars several. The seats dropdown adapts to the
// selected type automatically.
const SEATS_BY_TYPE = {
    Motorcycle: [1],
    Scooter: [1],
    "Auto-rickshaw": [2, 3],
    Car: [3, 4, 5, 6, 7],
};
const seatChoicesFor = (type) => SEATS_BY_TYPE[type] || [2, 3, 4, 5, 6, 7];

// Amenities relevant to each vehicle type — a motorcycle has no AC or extra
// space, an auto has no AC, etc. The amenity picker adapts to the selected type
// automatically (mirrors the seating-capacity behaviour).
const AMENITIES_BY_TYPE = {
    Motorcycle: ["Charging Port", "Clean & Well Maintained"],
    Scooter: ["Charging Port", "Clean & Well Maintained"],
    "Auto-rickshaw": ["Music System", "Charging Port", "Clean & Well Maintained"],
    Car: ["AC Available", "Music System", "Charging Port", "Spacious", "Clean & Well Maintained"],
};
const amenitiesFor = (type) => AMENITIES_BY_TYPE[type] || AMENITIES;

/* ---------------- icons ---------------- */
const I = {
    car: <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />,
    seats: <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z" />,
    star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></>,
    trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    check: <polyline points="20 6 9 17 4 12" />,
    x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>,
    camera: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    bike: <><circle cx="5.5" cy="17.5" r="3.5" /><circle cx="18.5" cy="17.5" r="3.5" /><path d="M5.5 17.5h6l4-7H18M14 5h3l1.5 5.5" /></>,
    suv: <><path d="M3 13l1.5-5h13L20 13M3 13h18v4h-2M3 13v4h2m0 0a2 2 0 0 0 4 0m6 0a2 2 0 0 0 4 0M5 17h6" /></>,
    wallet: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M16 12h.01M2 10h20" /></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></>,
    leaf: <><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></>,
    bulb: <><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-0.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" /></>,
    arrow: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
};
const Svg = ({ children, size = 18 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
);

const photoOf = (v) => (Array.isArray(v?.photos) && v.photos[0]) || "";

const StatCard = ({ icon, label, value, sub }) => (
    <div className="dv-stat">
        <span className="dv-stat-icon">{icon}</span>
        <div>
            <div className="dv-stat-value">{value}</div>
            <div className="dv-stat-label">{label}</div>
            {sub ? <div className="dv-stat-sub">{sub}</div> : null}
        </div>
    </div>
);

const VehicleManager = ({ onOpenSidebar }) => {
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [emailVerified, setEmailVerified] = useState(true); // optimistic; checked on mount
    const [defaultId, setDefaultId] = useState(() => {
        try { return localStorage.getItem(DEFAULT_VEHICLE_KEY) || ""; } catch { return ""; }
    });

    // modals: { mode: 'form'|'details'|'delete', vehicle }
    const [modal, setModal] = useState(null);

    // Check email verification — adding a vehicle (which captures DL details)
    // requires a verified email account.
    useEffect(() => {
        let active = true;
        axiosInstance.get(`${API_BASE_URL}/auth/me`)
            .then((res) => { if (active) setEmailVerified(res.data?.isVerified !== false); })
            .catch(() => { /* ignore */ });
        return () => { active = false; };
    }, []);

    // Guarded "open add vehicle" — blocks when the email isn't verified.
    const openAddVehicle = () => {
        if (!emailVerified) {
            toast.info("Please verify your email before adding a vehicle.");
            return;
        }
        setModal({ mode: "form", vehicle: null });
    };

    const loadVehicles = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getUserVehicles();
            setVehicles(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            if (error.response?.status !== 404) toast.error("Failed to load vehicles");
            setVehicles([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadVehicles(); }, [loadVehicles]);

    const setDefault = (id) => {
        const next = defaultId === id ? "" : id;
        setDefaultId(next);
        try {
            if (next) localStorage.setItem(DEFAULT_VEHICLE_KEY, next);
            else localStorage.removeItem(DEFAULT_VEHICLE_KEY);
        } catch { /* ignore */ }
        toast.success(next ? "Default vehicle set" : "Default cleared");
    };

    const handleDelete = async (vehicle) => {
        try {
            await deleteVehicle(vehicle._id);
            toast.success("Vehicle removed successfully");
            if (defaultId === vehicle._id) setDefault(vehicle._id); // clears it
            setModal(null);
            loadVehicles();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to remove vehicle");
        }
    };

    const defaultVehicle = vehicles.find((v) => v._id === defaultId) || null;
    const anyVerified = vehicles.some((v) => v.isVerified);
    const verifValue = loading ? "—" : (vehicles.length === 0 ? "Pending" : anyVerified ? "Verified" : "Pending");
    const verifSub = vehicles.length === 0 ? "Add a vehicle to verify" : anyVerified ? "Vehicle verified" : "Awaiting review";

    return (
        <div className="dv-root">
            <div className="dv-topbar">
                <button className="dv-hamburger" onClick={onOpenSidebar} aria-label="Open menu">
                    <Svg size={22}><><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></></Svg>
                </button>
                <span className="dv-title-icon" aria-hidden="true"><Svg size={22}>{I.car}</Svg></span>
                <div className="dv-heading">
                    <h1 className="dv-page-title">My Vehicles</h1>
                    <p className="dv-subtitle">Manage your vehicles and start offering rides across the university community.</p>
                </div>
                {vehicles.length > 0 && (
                    <button className="dv-btn" onClick={openAddVehicle}>
                        <Svg size={16}>{I.plus}</Svg> Add Vehicle
                    </button>
                )}
            </div>

            {/* Email verification gate banner */}
            {!emailVerified && (
                <div className="dv-verify-banner">
                    <span>✉️</span>
                    <div>
                        <strong>Verify your email to add a vehicle</strong>
                        <p>Adding a vehicle (including your driving license details) requires a verified email account.</p>
                    </div>
                </div>
            )}

            {/* Stats */}
            <section className="dv-stats dv-rise">
                <StatCard icon={<Svg>{I.car}</Svg>} label="Total Vehicles" sub="All vehicles added" value={loading ? "—" : vehicles.length} />
                <StatCard icon={<Svg>{I.check}</Svg>} label="Active Vehicles" sub="Currently active" value={loading ? "—" : vehicles.length} />
                <StatCard icon={<Svg>{I.star}</Svg>} label="Default Vehicle" sub="Set a default vehicle"
                    value={loading ? "—" : (defaultVehicle ? `${defaultVehicle.make} ${defaultVehicle.model}` : "Not Set")} />
                <StatCard icon={<Svg>{I.shield}</Svg>} label="Verification Status" sub={verifSub} value={verifValue} />
            </section>

            {/* List / onboarding / loading */}
            {loading ? (
                <div className="dv-grid">
                    <div className="dv-skeleton" /><div className="dv-skeleton" /><div className="dv-skeleton" />
                </div>
            ) : vehicles.length === 0 ? (
                <>
                    {/* Hero empty banner */}
                    <section className="dv-hero dv-rise">
                        <div className="dv-hero-art" aria-hidden="true">
                            <img src={carImg} alt="" />
                        </div>
                        <div className="dv-hero-content">
                            <h2 className="dv-hero-title">No vehicles yet</h2>
                            <p className="dv-hero-sub">Add your first vehicle to start offering rides and connect with students traveling your way.</p>
                            <div className="dv-hero-cta">
                                <button className="dv-btn light" onClick={openAddVehicle}>
                                    <Svg size={16}>{I.plus}</Svg> Add Vehicle
                                </button>
                                <button className="dv-link" onClick={() => document.getElementById("dv-why")?.scrollIntoView({ behavior: "smooth" })}>
                                    Learn how it works <Svg size={14}>{I.arrow}</Svg>
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* Info sections */}
                    <div className="dv-info">
                        <section className="dv-info-card">
                            <h3 className="dv-info-title">Vehicle Types We Support</h3>
                            <p className="dv-info-sub">Add any of these vehicle types and start earning.</p>
                            <div className="dv-types">
                                <div className="dv-type"><span className="dv-type-icon"><Svg size={30}>{I.car}</Svg></span><span className="dv-type-name">Car</span><span className="dv-type-seats">4 Seats</span></div>
                                <div className="dv-type"><span className="dv-type-icon"><Svg size={30}>{I.bike}</Svg></span><span className="dv-type-name">Bike</span><span className="dv-type-seats">2 Seats</span></div>
                                <div className="dv-type"><span className="dv-type-icon"><Svg size={30}>{I.suv}</Svg></span><span className="dv-type-name">SUV</span><span className="dv-type-seats">6+ Seats</span></div>
                            </div>
                        </section>

                        <section className="dv-info-card" id="dv-why">
                            <h3 className="dv-info-title">Why Add Your Vehicle?</h3>
                            <p className="dv-info-sub">More vehicles, more rides, more impact.</p>
                            <div className="dv-why">
                                <div className="dv-why-item"><span className="dv-why-icon"><Svg size={20}>{I.wallet}</Svg></span><span className="dv-why-name">Earn More</span><span className="dv-why-desc">Offer rides and earn on every trip.</span></div>
                                <div className="dv-why-item"><span className="dv-why-icon"><Svg size={20}>{I.shield}</Svg></span><span className="dv-why-name">Build Trust</span><span className="dv-why-desc">Verified vehicles build rider trust.</span></div>
                                <div className="dv-why-item"><span className="dv-why-icon"><Svg size={20}>{I.users}</Svg></span><span className="dv-why-name">Help Community</span><span className="dv-why-desc">Help students travel safely and affordably.</span></div>
                                <div className="dv-why-item"><span className="dv-why-icon"><Svg size={20}>{I.leaf}</Svg></span><span className="dv-why-name">Go Green</span><span className="dv-why-desc">Reduce emissions by sharing more rides.</span></div>
                            </div>
                        </section>
                    </div>
                </>
            ) : (
                <div className="dv-grid">
                    {vehicles.map((v) => (
                        <VehicleCard
                            key={v._id}
                            vehicle={v}
                            isDefault={v._id === defaultId}
                            onView={() => setModal({ mode: "details", vehicle: v })}
                            onEdit={() => setModal({ mode: "form", vehicle: v })}
                            onDelete={() => setModal({ mode: "delete", vehicle: v })}
                            onSetDefault={() => setDefault(v._id)}
                        />
                    ))}
                </div>
            )}

            {/* Tip strip */}
            {!loading && (
                <div className="dv-tip">
                    <span className="dv-tip-icon"><Svg size={18}>{I.bulb}</Svg></span>
                    <p className="dv-tip-text"><strong>Tip:</strong> Adding more details like vehicle photo and documents helps build trust and gets you more rides.</p>
                    <button className="dv-btn" onClick={openAddVehicle}>
                        Add Vehicle Now <Svg size={15}>{I.arrow}</Svg>
                    </button>
                </div>
            )}

            {/* Modals */}
            {modal?.mode === "form" && (
                <VehicleFormModal
                    vehicle={modal.vehicle}
                    onClose={() => setModal(null)}
                    onSaved={() => { setModal(null); loadVehicles(); }}
                />
            )}
            {modal?.mode === "details" && (
                <VehicleDetailsModal
                    vehicle={modal.vehicle}
                    isDefault={modal.vehicle._id === defaultId}
                    onClose={() => setModal(null)}
                    onEdit={() => setModal({ mode: "form", vehicle: modal.vehicle })}
                />
            )}
            {modal?.mode === "delete" && (
                <ConfirmDeleteModal
                    vehicle={modal.vehicle}
                    onCancel={() => setModal(null)}
                    onConfirm={() => handleDelete(modal.vehicle)}
                />
            )}
        </div>
    );
};

export default VehicleManager;

/* ---------------- Vehicle card ---------------- */
function VehicleCard({ vehicle, isDefault, onView, onEdit, onDelete, onSetDefault }) {
    const img = photoOf(vehicle);
    // Fall back to the clean placeholder if the photo URL is missing/broken
    // (e.g. an old or seeded vehicle with an unreachable image) instead of
    // showing the browser's broken-image glyph.
    const [imgBroken, setImgBroken] = useState(false);
    const showImg = img && !imgBroken;
    return (
        <article className={`dv-card dv-rise${isDefault ? " is-default" : ""}`}>
            <div className="dv-card-media" onClick={onView} role="button" tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onView()}
                aria-label={`View ${vehicle.make} ${vehicle.model} details`}>
                {showImg
                    ? <img src={img} alt={`${vehicle.make} ${vehicle.model}`} loading="lazy" onError={() => setImgBroken(true)} />
                    : <span className="dv-card-media-placeholder"><Svg size={42}>{I.car}</Svg></span>}
                {isDefault && <span className="dv-default-badge"><Svg size={11}>{I.star}</Svg> Default</span>}
                {vehicle.vehicleType && <span className="dv-type-badge">{vehicle.vehicleType}</span>}
            </div>

            <div className="dv-card-body">
                <h3 className="dv-card-name">{vehicle.make} {vehicle.model}</h3>
                {vehicle.licensePlate && <p className="dv-card-plate">{vehicle.licensePlate}</p>}

                <div className="dv-card-meta">
                    <span className="dv-meta-item"><Svg size={15}>{I.seats}</Svg> {vehicle.totalSeats} seats</span>
                    {vehicle.color && (
                        <span className="dv-meta-item">
                            <span className="dv-swatch" style={{ background: cssColor(vehicle.color) }} /> {vehicle.color}
                        </span>
                    )}
                    {vehicle.year && <span className="dv-meta-item">{vehicle.year}</span>}
                </div>

                {Array.isArray(vehicle.amenities) && vehicle.amenities.length > 0 && (
                    <div className="dv-amenities">
                        {vehicle.amenities.slice(0, 3).map((a) => <span key={a} className="dv-chip">{a}</span>)}
                        {vehicle.amenities.length > 3 && <span className="dv-chip">+{vehicle.amenities.length - 3}</span>}
                    </div>
                )}

                <div className="dv-card-actions">
                    <button className={`dv-act star${isDefault ? " on" : ""}`} onClick={onSetDefault}
                        title={isDefault ? "Remove as default" : "Set as default"}>
                        <Svg size={15}>{I.star}</Svg> {isDefault ? "Default" : "Set"}
                    </button>
                    <button className="dv-act" onClick={onEdit}><Svg size={15}>{I.edit}</Svg> Edit</button>
                    <button className="dv-act danger icon-only" onClick={onDelete} aria-label="Delete vehicle">
                        <Svg size={15}>{I.trash}</Svg>
                    </button>
                </div>
            </div>
        </article>
    );
}

// Best-effort CSS color for the swatch; falls back to neutral if not a valid name.
function cssColor(name) {
    if (!name) return "#6b7280";
    return /^[a-zA-Z\s]+$/.test(name) ? name.trim().toLowerCase().replace(/\s+/g, "") : "#6b7280";
}

/* ---------------- Details modal ---------------- */
function VehicleDetailsModal({ vehicle, isDefault, onClose, onEdit }) {
    const img = photoOf(vehicle);
    const rows = [
        ["Type", vehicle.vehicleType],
        ["Seating", `${vehicle.totalSeats} seats`],
        ["Color", vehicle.color || "—"],
        ["Year", vehicle.year || "—"],
        ["License Plate", vehicle.licensePlate || "—"],
        ["Experience", vehicle.experience != null ? `${vehicle.experience} yrs` : "—"],
    ];
    return (
        <ModalShell title={`${vehicle.make} ${vehicle.model}`} onClose={onClose}>
            {img
                ? <img className="dv-detail-img" src={img} alt={`${vehicle.make} ${vehicle.model}`} />
                : <div className="dv-detail-img" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)" }}><Svg size={44}>{I.car}</Svg></div>}

            {isDefault && <div style={{ marginTop: "0.7rem" }}><span className="dv-default-badge" style={{ position: "static" }}><Svg size={11}>{I.star}</Svg> Default vehicle</span></div>}

            <div className="dv-detail-grid">
                {rows.map(([k, v]) => (
                    <div className="dv-detail-item" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>
                ))}
            </div>

            {Array.isArray(vehicle.amenities) && vehicle.amenities.length > 0 && (
                <div style={{ marginTop: "1rem" }}>
                    <div className="dv-detail-item"><div className="k">Amenities</div></div>
                    <div className="dv-amenities">{vehicle.amenities.map((a) => <span key={a} className="dv-chip">{a}</span>)}</div>
                </div>
            )}

            <div className="dv-modal-foot" style={{ padding: "1rem 0 0", borderTop: "none" }}>
                <button className="dv-btn ghost" onClick={onClose}>Close</button>
                <button className="dv-btn" onClick={onEdit}><Svg size={15}>{I.edit}</Svg> Edit</button>
            </div>
        </ModalShell>
    );
}

/* ---------------- Confirm delete ---------------- */
function ConfirmDeleteModal({ vehicle, onCancel, onConfirm }) {
    const [busy, setBusy] = useState(false);
    return (
        <ModalShell title="Remove vehicle" sm onClose={onCancel}>
            <p className="dv-confirm-text">Are you sure you want to remove this vehicle?</p>
            <p className="dv-confirm-sub">{vehicle.make} {vehicle.model}{vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}</p>
            <div className="dv-modal-foot" style={{ padding: "1.2rem 0 0", borderTop: "none" }}>
                <button className="dv-btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
                <button className="dv-btn" style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff" }}
                    onClick={async () => { setBusy(true); await onConfirm(); }} disabled={busy}>
                    {busy ? <><span className="dv-spinner" /> Removing...</> : "Delete"}
                </button>
            </div>
        </ModalShell>
    );
}

/* ---------------- Reusable modal shell ---------------- */
function ModalShell({ title, children, onClose, sm = false }) {
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (
        <div className="dv-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={title}>
            <div className={`dv-modal${sm ? " sm" : ""}`}>
                <div className="dv-modal-head">
                    <h2 className="dv-modal-title">{title}</h2>
                    <button className="dv-modal-close" onClick={onClose} aria-label="Close"><Svg size={20}>{I.x}</Svg></button>
                </div>
                <div className="dv-modal-body">{children}</div>
            </div>
        </div>
    );
}

/* ---------------- Add / Edit form modal ---------------- */
function VehicleFormModal({ vehicle, onClose, onSaved }) {
    const editing = Boolean(vehicle && vehicle._id);
    const [form, setForm] = useState({
        vehicleType: vehicle?.vehicleType || "",
        make: vehicle?.make || "",
        model: vehicle?.model || "",
        year: vehicle?.year || "",
        color: vehicle?.color || "",
        licensePlate: vehicle?.licensePlate || "",
        totalSeats: vehicle?.totalSeats || 4,
        drivingLicense: vehicle?.drivingLicense || "",
        experience: vehicle?.experience ?? "",
        preferredCommunication: vehicle?.preferredCommunication || "In-app",
        amenities: vehicle?.amenities || [],
    });
    const [photo, setPhoto] = useState(photoOf(vehicle));
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef(null);

    const set = (k, v) => {
        setForm((f) => ({ ...f, [k]: v }));
        if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
    };

    const toggleAmenity = (a) =>
        setForm((f) => ({
            ...f,
            amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a],
        }));

    const validate = () => {
        const e = {};
        if (!form.vehicleType) e.vehicleType = "Select a vehicle type";
        if (!form.make.trim()) e.make = "Vehicle name is required";
        if (!form.model.trim()) e.model = "Model is required";
        if (!form.drivingLicense.trim()) e.drivingLicense = "Driving license is required";
        if (!form.totalSeats || form.totalSeats < 1) e.totalSeats = "Seating capacity is required";
        // Vehicle number: optional, but if provided enforce a sane plate format.
        if (form.licensePlate && !/^[A-Za-z0-9\s-]{4,15}$/.test(form.licensePlate.trim())) {
            e.licensePlate = "Enter a valid vehicle number";
        }
        if (form.year && (Number(form.year) < 1900 || Number(form.year) > new Date().getFullYear() + 1)) {
            e.year = "Enter a valid year";
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const pickImage = () => {
        if (!isCloudinaryConfigured()) {
            toast.info("Image upload isn't configured. Add Cloudinary keys to enable it.");
            return;
        }
        fileRef.current?.click();
    };

    const onFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
        if (file.size > MAX_AVATAR_BYTES) { toast.error("Image must be under 1 MB"); return; }
        setUploading(true);
        try {
            const url = await uploadToCloudinary(file);
            setPhoto(url);
            toast.success("Image ready");
        } catch {
            toast.error("Upload failed. Please try again.");
        } finally {
            setUploading(false);
        }
    };

    const submit = async (e) => {
        e.preventDefault();
        if (saving) return;
        if (!validate()) { toast.error("Please fix the highlighted fields"); return; }

        // Build payload matching the existing Vehicle model (photos: [String]).
        const payload = {
            vehicleType: form.vehicleType,
            make: form.make.trim(),
            model: form.model.trim(),
            color: form.color.trim(),
            licensePlate: form.licensePlate.trim(),
            totalSeats: Number(form.totalSeats),
            drivingLicense: form.drivingLicense.trim(),
            preferredCommunication: form.preferredCommunication,
            amenities: form.amenities,
            photos: photo ? [photo] : [],
        };
        if (form.year) payload.year = Number(form.year);
        if (form.experience !== "") payload.experience = Number(form.experience);

        setSaving(true);
        try {
            if (editing) {
                await updateVehicle(vehicle._id, payload);
                toast.success("Vehicle updated successfully!");
            } else {
                await createVehicle(payload);
                toast.success("Vehicle added successfully!");
            }
            onSaved();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to save vehicle");
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell title={editing ? "Edit Vehicle" : "Add Vehicle"} onClose={onClose}>
            <form onSubmit={submit}>
                {/* Image upload */}
                <div className="dv-field">
                    <label className="dv-label">Vehicle Image</label>
                    <div className="dv-upload">
                        <div className="dv-upload-preview">
                            {photo ? <img src={photo} alt="Vehicle preview" /> : <Svg size={24}>{I.image}</Svg>}
                            {uploading && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}><span className="dv-spinner" style={{ borderColor: "rgba(255,255,255,0.4)", borderTopColor: "#fff" }} /></div>}
                        </div>
                        <div className="dv-upload-actions">
                            <button type="button" className="dv-btn ghost" onClick={pickImage} disabled={uploading}>
                                <Svg size={15}>{I.camera}</Svg> {photo ? "Replace" : "Upload"}
                            </button>
                            {photo && <button type="button" className="dv-btn ghost" onClick={() => setPhoto("")} disabled={uploading}>Remove</button>}
                            <span className="dv-upload-hint">PNG/JPG, under 1 MB</span>
                        </div>
                        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
                    </div>
                </div>

                {/* Type + Name */}
                <div className="dv-row">
                    <div className="dv-field">
                        <label className="dv-label">Vehicle Type <span className="dv-req">*</span></label>
                        <ThemedSelect
                            id="dv-type" ariaLabel="Vehicle Type" theme="dark"
                            value={form.vehicleType}
                            onChange={(v) => {
                                const choices = seatChoicesFor(v);
                                const allowed = amenitiesFor(v);
                                // Reset seats + prune amenities to valid options for the new type.
                                setForm((f) => ({
                                    ...f,
                                    vehicleType: v,
                                    totalSeats: choices.includes(Number(f.totalSeats)) ? f.totalSeats : choices[0],
                                    amenities: f.amenities.filter((a) => allowed.includes(a)),
                                }));
                                if (errors.vehicleType) setErrors((e) => ({ ...e, vehicleType: "" }));
                            }}
                            placeholder="Select type" invalid={Boolean(errors.vehicleType)} disabled={saving}
                            options={VEHICLE_TYPES.map((t) => ({ value: t, label: t }))}
                        />
                        {errors.vehicleType && <span className="dv-err">{errors.vehicleType}</span>}
                    </div>
                    <div className="dv-field">
                        <label className="dv-label" htmlFor="dv-make">Vehicle Name <span className="dv-req">*</span></label>
                        <input id="dv-make" className={`dv-input${errors.make ? " invalid" : ""}`} value={form.make}
                            onChange={(e) => set("make", e.target.value)} placeholder="e.g., Maruti" disabled={saving} />
                        {errors.make && <span className="dv-err">{errors.make}</span>}
                    </div>
                </div>

                {/* Model + Number */}
                <div className="dv-row">
                    <div className="dv-field">
                        <label className="dv-label" htmlFor="dv-model">Model <span className="dv-req">*</span></label>
                        <input id="dv-model" className={`dv-input${errors.model ? " invalid" : ""}`} value={form.model}
                            onChange={(e) => set("model", e.target.value)} placeholder="e.g., Swift" disabled={saving} />
                        {errors.model && <span className="dv-err">{errors.model}</span>}
                    </div>
                    <div className="dv-field">
                        <label className="dv-label" htmlFor="dv-plate">Vehicle Number</label>
                        <input id="dv-plate" className={`dv-input${errors.licensePlate ? " invalid" : ""}`} value={form.licensePlate}
                            onChange={(e) => set("licensePlate", e.target.value.toUpperCase())} placeholder="GJ-06-AB-1234" disabled={saving} />
                        {errors.licensePlate && <span className="dv-err">{errors.licensePlate}</span>}
                    </div>
                </div>

                {/* Color + Seats */}
                <div className="dv-row">
                    <div className="dv-field">
                        <label className="dv-label" htmlFor="dv-color">Color</label>
                        <input id="dv-color" className="dv-input" value={form.color}
                            onChange={(e) => set("color", e.target.value)} placeholder="e.g., White" disabled={saving} />
                    </div>
                    <div className="dv-field">
                        <label className="dv-label">Seating Capacity <span className="dv-req">*</span></label>
                        <ThemedSelect
                            id="dv-seats" ariaLabel="Seating Capacity" theme="dark"
                            value={String(form.totalSeats)} onChange={(v) => set("totalSeats", Number(v))}
                            placeholder="Seats" disabled={saving || !form.vehicleType}
                            options={seatChoicesFor(form.vehicleType).map((n) => ({ value: String(n), label: `${n} seat${n > 1 ? "s" : ""}` }))}
                        />
                        {!form.vehicleType && <span className="dv-hint">Select a vehicle type first</span>}
                    </div>
                </div>

                {/* Year + License */}
                <div className="dv-row">
                    <div className="dv-field">
                        <label className="dv-label" htmlFor="dv-year">Year</label>
                        <input id="dv-year" className={`dv-input${errors.year ? " invalid" : ""}`} type="number" value={form.year}
                            onChange={(e) => set("year", e.target.value)} placeholder="2020" disabled={saving} />
                        {errors.year && <span className="dv-err">{errors.year}</span>}
                    </div>
                    <div className="dv-field">
                        <label className="dv-label" htmlFor="dv-dl">Driving License <span className="dv-req">*</span></label>
                        <input id="dv-dl" className={`dv-input${errors.drivingLicense ? " invalid" : ""}`} value={form.drivingLicense}
                            onChange={(e) => set("drivingLicense", e.target.value)} placeholder="DL-1234567890" disabled={saving} />
                        {errors.drivingLicense && <span className="dv-err">{errors.drivingLicense}</span>}
                    </div>
                </div>

                {/* Amenities */}
                <div className="dv-field">
                    <label className="dv-label">Amenities</label>
                    <div className="dv-amenity-pick">
                        {(form.vehicleType ? amenitiesFor(form.vehicleType) : []).map((a) => (
                            <button type="button" key={a} className={`dv-amenity-btn${form.amenities.includes(a) ? " on" : ""}`}
                                onClick={() => toggleAmenity(a)} disabled={saving}>
                                {a}
                            </button>
                        ))}
                    </div>
                    {!form.vehicleType && <span className="dv-hint">Select a vehicle type to see relevant amenities</span>}
                </div>

                <div className="dv-modal-foot" style={{ padding: "1rem 0 0", borderTop: "none" }}>
                    <button type="button" className="dv-btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
                    <button type="submit" className="dv-btn" disabled={saving || uploading}>
                        {saving ? <><span className="dv-spinner" /> Saving...</> : (editing ? "Save Changes" : "Add Vehicle")}
                    </button>
                </div>
            </form>
        </ModalShell>
    );
}
