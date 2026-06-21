import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { getMyVerification, submitVerification } from "../services/verificationService";
import axiosInstance from "../utils/axiosConfig";
import { API_BASE_URL, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "../utils/constants";
import "../styles/verification.css";

// Status → banner content. Drives the headline strip + pill.
const BANNER = {
    not_submitted: { title: "Verification Not Submitted", sub: "Submit your documents for review to get verified.", pill: "Pending Submission", pillCls: "vs-pending" },
    pending: { title: "Verification Under Review", sub: "Your documents are being reviewed by our team.", pill: "Pending Review", pillCls: "vs-pending" },
    approved: { title: "You're Verified", sub: "Passengers now see a verified badge on your profile.", pill: "Verified", pillCls: "vs-approved" },
    rejected: { title: "Verification Rejected", sub: "Please review the remarks below and resubmit.", pill: "Rejected", pillCls: "vs-rejected" },
};

const PROCESS = [
    ["Submit Documents", "Upload your driving license"],
    ["Under Review", "Our team will verify your documents"],
    ["Get Verified", "You'll be notified once verified"],
    ["Start Offering Rides", "Start offering and earning"],
];

const DriverVerification = ({ onOpenSidebar, onNavigate }) => {
    const [verification, setVerification] = useState(null);
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [dlDrag, setDlDrag] = useState(false);

    // Form state
    const [dl, setDl] = useState({ url: "", fileName: "" });
    const [vehicleDocs, setVehicleDocs] = useState([]); // [{vehicle_id, rc:{url,fileName}, photos:{front,side,rear}}]

    useEffect(() => { load(); }, []);

    const load = async () => {
        setLoading(true);
        try {
            const [vRes, vehiclesRes] = await Promise.all([
                getMyVerification(),
                axiosInstance.get(`${API_BASE_URL}/vehicles`),
            ]);
            const v = vRes.data;
            setVerification(v);
            const vList = Array.isArray(vehiclesRes.data) ? vehiclesRes.data : [];
            setVehicles(vList);

            // Pre-fill form from existing submission.
            if (v?.drivingLicense?.url) setDl({ url: v.drivingLicense.url, fileName: v.drivingLicense.fileName || "" });
            if (v?.vehicles?.length) {
                setVehicleDocs(v.vehicles.map((ve) => ({
                    vehicle_id: ve.vehicle_id?._id || ve.vehicle_id,
                    rc: { url: ve.rc?.url || "", fileName: ve.rc?.fileName || "" },
                    photos: { front: ve.photos?.front?.url || "", side: ve.photos?.side?.url || "", rear: ve.photos?.rear?.url || "" },
                })));
            } else if (vList.length > 0) {
                setVehicleDocs(vList.map((ve) => ({ vehicle_id: ve._id, rc: { url: "", fileName: "" }, photos: { front: "", side: "", rear: "" } })));
            }
        } catch {
            // Non-fatal.
        } finally {
            setLoading(false);
        }
    };

    // Upload to Cloudinary (same pattern as profile picture upload).
    const uploadFile = async (file) => {
        if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
            toast.error("Upload configuration missing.");
            return null;
        }
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: "POST", body: formData });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        return { url: data.secure_url, fileName: file.name };
    };

    const processDlFile = async (file) => {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { toast.error("Max file size is 5 MB"); return; }
        try {
            const result = await uploadFile(file);
            if (result) setDl(result);
        } catch { toast.error("Upload failed, please try again."); }
    };

    const handleDlUpload = (e) => processDlFile(e.target.files?.[0]);

    const handleVehicleDoc = async (vIdx, field, e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { toast.error("Max file size is 5 MB"); return; }
        try {
            const result = await uploadFile(file);
            if (!result) return;
            setVehicleDocs((prev) => {
                const next = [...prev];
                if (field === "rc") {
                    next[vIdx] = { ...next[vIdx], rc: result };
                } else {
                    next[vIdx] = { ...next[vIdx], photos: { ...next[vIdx].photos, [field]: result.url } };
                }
                return next;
            });
        } catch { toast.error("Upload failed."); }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!dl.url) { toast.error("Please upload your Driving License."); return; }
        const filledVehicles = vehicleDocs.filter((v) => v.rc?.url);
        if (filledVehicles.length === 0) { toast.error("Please upload at least one vehicle RC."); return; }
        setSubmitting(true);
        try {
            await submitVerification({ drivingLicense: dl, vehicles: filledVehicles });
            toast.success("Verification submitted for review!");
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Submission failed.");
        } finally {
            setSubmitting(false);
        }
    };

    const status = verification?.status || "not_submitted";
    const banner = BANNER[status] || BANNER.not_submitted;
    const canEdit = status === "not_submitted" || status === "rejected";
    const activeStep = status === "approved" ? 3 : status === "pending" ? 1 : 0;
    const noVehicles = vehicles.length === 0;

    if (loading) return <div className="vf-root"><div className="vf-loading"><div className="vf-spin" /></div></div>;

    /* ---- Verification process + benefits (always shown) ---- */
    const infoSections = (
        <div className="vf-info">
            <section className="vf-info-card">
                <h3 className="vf-info-title">Verification Process</h3>
                <div className="vf-process">
                    {PROCESS.map(([title, desc], i) => (
                        <div key={i} className={`vf-step${i <= activeStep ? " done" : ""}`}>
                            <span className="vf-step-icon">
                                {i === 0 ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M12 18v-6M9 15l3-3 3 3" /></svg>
                                    : i === 1 ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                        : i === 2 ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg>
                                            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                            </span>
                            <span className="vf-step-no">Step {i + 1}</span>
                            <span className="vf-step-title">{title}</span>
                            <span className="vf-step-desc">{desc}</span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="vf-info-card">
                <h3 className="vf-info-title">Benefits of Verification</h3>
                <ul className="vf-benefits">
                    <li className="vf-benefit"><span className="vf-benefit-icon green"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg></span><div><span className="vf-benefit-title">Build Trust</span><span className="vf-benefit-sub">Verified drivers get more ride requests</span></div></li>
                    <li className="vf-benefit"><span className="vf-benefit-icon blue"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg></span><div><span className="vf-benefit-title">Higher Earnings</span><span className="vf-benefit-sub">Verified drivers earn more</span></div></li>
                    <li className="vf-benefit"><span className="vf-benefit-icon violet"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg></span><div><span className="vf-benefit-title">Community Safety</span><span className="vf-benefit-sub">Helps us maintain a safe community</span></div></li>
                    <li className="vf-benefit"><span className="vf-benefit-icon amber"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6" /><path d="M8.21 13.89L7 22l5-3 5 3-1.21-8.11" /></svg></span><div><span className="vf-benefit-title">Priority Support</span><span className="vf-benefit-sub">Get faster support when you need it</span></div></li>
                </ul>
            </section>
        </div>
    );

    return (
        <div className="vf-root">
            {/* Top bar */}
            <div className="vf-topbar">
                {onOpenSidebar && (
                    <button type="button" className="vf-hamburger" onClick={onOpenSidebar} aria-label="Open menu">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                    </button>
                )}
                <span className="vf-title-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg>
                </span>
                <div className="vf-heading">
                    <h1 className="vf-title">Driver Verification</h1>
                    <p className="vf-subtitle">Complete verification to start offering rides and build trust with riders.</p>
                </div>
            </div>

            <div className="vf-content">
                {/* Status banner */}
                <div className="vf-banner">
                    <span className="vf-banner-icon">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    </span>
                    <div className="vf-banner-text">
                        <strong>{banner.title}</strong>
                        <p>{status === "rejected" && verification?.adminRemarks ? verification.adminRemarks : banner.sub}</p>
                    </div>
                    <span className={`vf-pill ${banner.pillCls}`}>{banner.pill}</span>
                </div>

                {canEdit ? (
                    <form className="vf-form" onSubmit={handleSubmit}>
                        {/* Driving License */}
                        <div className="vf-dl-card">
                            <div className="vf-dl-info">
                                <div className="vf-dl-head">
                                    <span className="vf-dl-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" /></svg></span>
                                    <div>
                                        <h3 className="vf-dl-title">Driving License</h3>
                                        <p className="vf-dl-desc">Upload a clear image of your valid driving license</p>
                                    </div>
                                </div>
                                <p className="vf-req-head">Requirements</p>
                                <ul className="vf-req">
                                    {["Valid and non-expired license", "All corners must be visible", "Information must be clearly readable", "Accepted formats: JPG, PNG, PDF", "Maximum file size: 5MB"].map((r) => (
                                        <li key={r}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" /></svg>{r}</li>
                                    ))}
                                </ul>
                            </div>

                            <div className="vf-dl-upload">
                                {dl.url ? (
                                    <div className="vf-preview">
                                        {/\.(jpg|jpeg|png|webp)$/i.test(dl.url) ? (
                                            <img src={dl.url} alt="DL" className="vf-preview-img" />
                                        ) : (
                                            <a href={dl.url} target="_blank" rel="noopener noreferrer" className="vf-file-link">📄 {dl.fileName || "View document"}</a>
                                        )}
                                        <button type="button" className="vf-remove-btn" onClick={() => setDl({ url: "", fileName: "" })}>Remove</button>
                                    </div>
                                ) : (
                                    <>
                                        <label
                                            className={`vf-dropzone${dlDrag ? " drag" : ""}`}
                                            onDragOver={(e) => { e.preventDefault(); setDlDrag(true); }}
                                            onDragLeave={() => setDlDrag(false)}
                                            onDrop={(e) => { e.preventDefault(); setDlDrag(false); processDlFile(e.dataTransfer.files?.[0]); }}
                                        >
                                            <span className="vf-dropzone-icon"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg></span>
                                            <span className="vf-dropzone-title">Click to upload or drag and drop</span>
                                            <span className="vf-dropzone-sub">JPG, PNG, PDF • Max 5MB</span>
                                            <input type="file" accept="image/*,.pdf" onChange={handleDlUpload} className="vf-file-input" />
                                        </label>
                                        <label className="vf-choose-btn">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                                            Choose File
                                            <input type="file" accept="image/*,.pdf" onChange={handleDlUpload} className="vf-file-input" />
                                        </label>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Vehicle documents OR add-vehicle notice */}
                        {noVehicles ? (
                            <div className="vf-notice">
                                <span className="vf-notice-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg></span>
                                <span className="vf-notice-text">You need to add a vehicle first before submitting verification.</span>
                                <button type="button" className="vf-notice-btn" onClick={() => onNavigate?.("myVehicle")}>
                                    Go to My Vehicles <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                                </button>
                            </div>
                        ) : (
                            vehicleDocs.map((vd, i) => {
                                const vehicleInfo = vehicles.find((v) => String(v._id) === String(vd.vehicle_id));
                                return (
                                    <div key={vd.vehicle_id} className="vf-section">
                                        <h3 className="vf-section-title">🚘 {vehicleInfo ? `${vehicleInfo.make} ${vehicleInfo.model}` : `Vehicle ${i + 1}`}</h3>

                                        <p className="vf-label">Registration Certificate (RC)</p>
                                        <div className="vf-upload-box">
                                            {vd.rc?.url ? (
                                                <div className="vf-preview">
                                                    {/\.(jpg|jpeg|png|webp)$/i.test(vd.rc.url) ? (
                                                        <img src={vd.rc.url} alt="RC" className="vf-preview-img" />
                                                    ) : (
                                                        <a href={vd.rc.url} target="_blank" rel="noopener noreferrer" className="vf-file-link">📄 {vd.rc.fileName || "View document"}</a>
                                                    )}
                                                    <button type="button" className="vf-remove-btn" onClick={() => {
                                                        const next = [...vehicleDocs]; next[i] = { ...next[i], rc: { url: "", fileName: "" } }; setVehicleDocs(next);
                                                    }}>Remove</button>
                                                </div>
                                            ) : (
                                                <label className="vf-upload-label">
                                                    <span>Upload RC (JPG, PNG, PDF — max 5MB)</span>
                                                    <input type="file" accept="image/*,.pdf" onChange={(e) => handleVehicleDoc(i, "rc", e)} className="vf-file-input" />
                                                </label>
                                            )}
                                        </div>

                                        <p className="vf-label" style={{ marginTop: "0.8rem" }}>Vehicle Photos</p>
                                        <div className="vf-photos-grid">
                                            {["front", "side", "rear"].map((angle) => (
                                                <div key={angle} className="vf-photo-slot">
                                                    <span className="vf-photo-label">{angle.charAt(0).toUpperCase() + angle.slice(1)}{angle === "rear" ? " (optional)" : ""}</span>
                                                    {vd.photos?.[angle] ? (
                                                        <div className="vf-preview">
                                                            <img src={vd.photos[angle]} alt={angle} className="vf-preview-img small" />
                                                            <button type="button" className="vf-remove-btn" onClick={() => {
                                                                const next = [...vehicleDocs]; next[i] = { ...next[i], photos: { ...next[i].photos, [angle]: "" } }; setVehicleDocs(next);
                                                            }}>✕</button>
                                                        </div>
                                                    ) : (
                                                        <label className="vf-upload-label small">
                                                            <span>Upload</span>
                                                            <input type="file" accept="image/*" onChange={(e) => handleVehicleDoc(i, angle, e)} className="vf-file-input" />
                                                        </label>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })
                        )}

                        {infoSections}

                        {/* Submit bar */}
                        <button type="submit" className="vf-submit-bar" disabled={submitting || noVehicles}>
                            <span className="vf-submit-text">
                                <strong>{submitting ? "Submitting…" : status === "rejected" ? "Resubmit for Review" : "Submit for Review"}</strong>
                                <span>Once submitted, our team will review your documents</span>
                            </span>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                        </button>
                    </form>
                ) : (
                    <div className="vf-form">
                        {status === "approved" && (
                            <div className="vf-approved-msg">
                                <span>✅</span>
                                <div>
                                    <strong>You're verified!</strong>
                                    <p>You can create rides and passengers will see a verified badge on your profile.</p>
                                </div>
                            </div>
                        )}
                        {status === "pending" && (
                            <div className="vf-pending-msg">
                                <span>⏳</span>
                                <div>
                                    <strong>Under Review</strong>
                                    <p>Your documents are being reviewed by an admin. You'll receive a notification once a decision is made.</p>
                                </div>
                            </div>
                        )}
                        {infoSections}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DriverVerification;
