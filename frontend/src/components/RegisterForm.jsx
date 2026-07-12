import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { registerUser } from '../services/authService';
import { clearAuthTokens } from '../utils/authToken';
import VerifyOTP from './VerifyOTP';
import ThemedSelect from './ThemedSelect';
import GoogleSignupButton from './GoogleSignupButton';
import {
    validateField,
    validateAll,
    getPasswordStrength,
    EMAIL_DOMAIN,
} from '../utils/registerValidation';
import '../styles/register.css';

// Draft auto-save key (non-sensitive fields only — never passwords).
const DRAFT_KEY = 'rsr_register_draft';
// Minimum gap between submit attempts, keeps the client rate-limit friendly.
const SUBMIT_COOLDOWN_MS = 1500;

// --- Small inline icon set (no extra deps, lightweight SVGs) ---
const Icon = {
    user: (
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
    ),
    at: (
        <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
    ),
    mail: (
        <>
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-10 6L2 7" />
        </>
    ),
    phone: (
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    ),
    lock: (
        <>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </>
    ),
    role: (
        <>
            <path d="M20 7h-9M14 17H5" />
            <circle cx="17" cy="17" r="3" />
            <circle cx="7" cy="7" r="3" />
        </>
    ),
    gender: (
        <>
            <circle cx="12" cy="10" r="5" />
            <path d="M12 15v7M9 19h6" />
        </>
    ),
    eye: (
        <>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
        </>
    ),
    eyeOff: (
        <>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 2 11s3.5 7 10 7a9.12 9.12 0 0 0 5.39-1.61" />
            <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88M1 1l22 22" />
        </>
    ),
    check: <polyline points="20 6 9 17 4 12" />,
    alert: (
        <>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
        </>
    ),
};

const FieldIcon = ({ children }) => (
    <svg
        className="rsr-input-icon"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        {children}
    </svg>
);

// Inline field error message (animated, accessible).
const FieldError = ({ id, message }) =>
    message ? (
        <span id={id} className="rsr-error" role="alert">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                {Icon.alert}
            </svg>
            {message}
        </span>
    ) : null;

const EMPTY_FORM = {
    name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    phoneNumber: '',
    role: '',
    gender: '',
};

// Restore non-sensitive draft fields from a previous session.
const loadDraft = () => {
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return EMPTY_FORM;
        const saved = JSON.parse(raw);
        return {
            ...EMPTY_FORM,
            name: saved.name || '',
            username: saved.username || '',
            email: saved.email || '',
            phoneNumber: saved.phoneNumber || '',
            role: saved.role || '',
            gender: saved.gender || '',
        };
    } catch {
        return EMPTY_FORM;
    }
};

const RegisterForm = ({ onSwitchToLogin }) => {
    const [formData, setFormData] = useState(loadDraft);
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const [showOTPVerification, setShowOTPVerification] = useState(false);
    const [registeredEmail, setRegisteredEmail] = useState('');
    const [pendingToken, setPendingToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [googleProfileMode, setGoogleProfileMode] = useState(false);
    const navigate = useNavigate();
    const lastSubmitRef = useRef(0);

    const strength = getPasswordStrength(formData.password);

    // --- Auto-save (debounced) non-sensitive fields to localStorage. ---
    useEffect(() => {
        const t = setTimeout(() => {
            try {
                const { name, username, email, phoneNumber, role, gender } = formData;
                localStorage.setItem(
                    DRAFT_KEY,
                    JSON.stringify({ name, username, email, phoneNumber, role, gender })
                );
            } catch {
                /* storage unavailable (private mode/quota) — non-critical */
            }
        }, 400);
        return () => clearTimeout(t);
    }, [formData]);

    const setField = useCallback((name, value) => {
        setFormData((prev) => {
            const next = { ...prev, [name]: value };
            // Live-validate this field once it's been interacted with.
            setErrors((prevErr) => {
                const updated = { ...prevErr };
                setTouched((prevTouched) => {
                    if (prevTouched[name]) {
                        updated[name] = validateField(name, value, next);
                    }
                    // Keep confirmPassword in sync when password changes.
                    if (name === 'password' && prevTouched.confirmPassword) {
                        updated.confirmPassword = validateField(
                            'confirmPassword',
                            next.confirmPassword,
                            next
                        );
                    }
                    return prevTouched;
                });
                return updated;
            });
            return next;
        });
    }, []);

    const handleChange = (e) => setField(e.target.name, e.target.value);

    const handleBlur = (e) => {
        const { name, value } = e.target;
        setTouched((prev) => ({ ...prev, [name]: true }));
        setErrors((prev) => ({ ...prev, [name]: validateField(name, value, formData) }));
    };

    // Custom Role/Gender selects emit just the value.
    const handleSelectChange = (name) => (value) => {
        setTouched((prev) => ({ ...prev, [name]: true }));
        setField(name, value);
        setErrors((prev) => ({ ...prev, [name]: validateField(name, value, { ...formData, [name]: value }) }));
    };

    const focusFirstError = (errObj) => {
        const order = ['name', 'username', 'email', 'phoneNumber', 'password', 'confirmPassword', 'role', 'gender'];
        const idMap = {
            name: 'rsr-name',
            username: 'rsr-username',
            email: 'rsr-email',
            phoneNumber: 'rsr-phone',
            password: 'rsr-password',
            confirmPassword: 'rsr-confirm-password',
            role: 'rsr-role',
            gender: 'rsr-gender',
        };
        const first = order.find((f) => errObj[f]);
        if (first) {
            const el = document.getElementById(idMap[first]);
            if (el) el.focus();
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();

        // Guard against duplicate / rapid-fire submissions (rate-limit friendly).
        if (loading) return;
        const now = Date.now();
        if (now - lastSubmitRef.current < SUBMIT_COOLDOWN_MS) return;

        // Run full validation and surface all errors at once.
        const allErrors = validateAll(formData);
        setErrors(allErrors);
        setTouched({
            name: true, username: true, email: true, phoneNumber: true,
            password: true, confirmPassword: true, role: true, gender: true,
        });

        if (Object.keys(allErrors).length > 0) {
            focusFirstError(allErrors);
            toast.error('Please fix the highlighted fields');
            return;
        }

        if (!acceptedTerms) {
            toast.error('Please accept the Terms & Privacy Policy to continue');
            const el = document.getElementById('rsr-terms');
            if (el) el.focus();
            return;
        }

        lastSubmitRef.current = now;
        setLoading(true);
        try {
            // Build the exact payload the backend expects — confirmPassword and
            // terms are client-only and never sent.
            const payload = {
                name: formData.name,
                username: formData.username,
                email: formData.email,
                password: formData.password,
                phoneNumber: formData.phoneNumber,
                role: formData.role,
                gender: formData.gender,
            };

            const res = await registerUser(payload);
            toast.success('Registration successful! Please check your email for verification code.');

            // Clear the saved draft once registration starts.
            try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }

            setRegisteredEmail(formData.email);
            setPendingToken(res?.data?.pendingToken || '');
            setShowOTPVerification(true);
        } catch (error) {
            // Friendly, specific feedback for network / rate-limit / server errors.
            if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
                toast.error('Network error. Please check your connection and try again.', { autoClose: 5000 });
            } else if (error.code === 'ERR_BLOCKED_BY_CLIENT') {
                toast.error('Request blocked. Please disable your ad blocker and try again.', { autoClose: 5000 });
            } else if (error.response?.status === 429) {
                toast.error('Too many attempts. Please wait a moment and try again.', { autoClose: 5000 });
            } else {
                const msg = error.response?.data?.message || 'An error occurred. Please try again.';
                toast.error(msg);
                // Map a known duplicate message back onto the relevant field.
                if (/email/i.test(msg)) setErrors((p) => ({ ...p, email: msg }));
                else if (/username/i.test(msg)) setErrors((p) => ({ ...p, username: msg }));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleOTPVerified = async () => {
        // verifyOTP issues the session (access + refresh cookies; dev also
        // persists the token), so the user is already logged in.
        // Signup is intentionally EMAIL-ONLY — we don't ask for a phone OTP here
        // to avoid burdening the user with two codes at sign-up. Phone
        // verification is instead requested only when the user tries to create
        // or book a ride (enforced server-side, prompted in the UI).
        toast.success('Email verified!');
        navigate('/dashboard');
    };

    // Google auth result. New signups must sign in manually → switch to the
    // Login tab. An existing Google account that just logged in → Dashboard.
    const handleGoogleAuthenticated = (data, mode) => {
        if (mode === 'signup') {
            // New account: don't keep any fresh dev tokens — make them sign in.
            clearAuthTokens();
            if (onSwitchToLogin) onSwitchToLogin();
            else navigate('/');
        } else {
            // Existing account logged in (cookie set; `user` present in dev too).
            navigate('/dashboard');
        }
    };

    if (showOTPVerification) {
        return <VerifyOTP email={registeredEmail} pendingToken={pendingToken} onVerified={handleOTPVerified} />;
    }

    // Helper to compute aria-describedby for a field with an error.
    const describedBy = (field) => (errors[field] && touched[field] ? `${field}-error` : undefined);
    const isInvalid = (field) => Boolean(errors[field] && touched[field]);

    return (
        <div className="rsr-root">
            {/* Transportation-themed animated banner */}
            {!googleProfileMode && (
            <div className="rsr-hero" aria-hidden="true">
                <span className="rsr-hero-glow g1" />
                <span className="rsr-hero-glow g2" />
                <div className="rsr-hero-text">
                    <div className="rsr-hero-title">Share Rides. Save Money.</div>
                    <div className="rsr-hero-sub">Travel smarter across campus</div>
                </div>
                <div className="rsr-road" />
                <svg
                    className="rsr-car"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                >
                    <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
                </svg>
            </div>
            )}

            {!googleProfileMode && (
            <form onSubmit={handleRegister} className="rsr-grid" noValidate>
                {/* Full Name */}
                <div className="rsr-field">
                    <label className="rsr-label" htmlFor="rsr-name">Full Name</label>
                    <div className="rsr-input-wrap">
                        <FieldIcon>{Icon.user}</FieldIcon>
                        <input
                            id="rsr-name"
                            className={`rsr-input${isInvalid('name') ? ' rsr-input-invalid' : ''}`}
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            placeholder="Your full name"
                            autoComplete="name"
                            aria-invalid={isInvalid('name')}
                            aria-describedby={describedBy('name')}
                            disabled={loading}
                            autoFocus
                        />
                    </div>
                    {isInvalid('name') && <FieldError id="name-error" message={errors.name} />}
                </div>

                {/* Username */}
                <div className="rsr-field">
                    <label className="rsr-label" htmlFor="rsr-username">Username</label>
                    <div className="rsr-input-wrap">
                        <FieldIcon>{Icon.at}</FieldIcon>
                        <input
                            id="rsr-username"
                            className={`rsr-input${isInvalid('username') ? ' rsr-input-invalid' : ''}`}
                            type="text"
                            name="username"
                            value={formData.username}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            placeholder="Choose a username"
                            autoComplete="username"
                            aria-invalid={isInvalid('username')}
                            aria-describedby={describedBy('username')}
                            disabled={loading}
                        />
                    </div>
                    {isInvalid('username') && <FieldError id="username-error" message={errors.username} />}
                </div>

                {/* Email */}
                <div className="rsr-field">
                    <label className="rsr-label" htmlFor="rsr-email">Email</label>
                    <div className="rsr-input-wrap">
                        <FieldIcon>{Icon.mail}</FieldIcon>
                        <input
                            id="rsr-email"
                            className={`rsr-input${isInvalid('email') ? ' rsr-input-invalid' : ''}`}
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            placeholder={`you@${EMAIL_DOMAIN}`}
                            autoComplete="email"
                            aria-invalid={isInvalid('email')}
                            aria-describedby={describedBy('email')}
                            disabled={loading}
                        />
                    </div>
                    {isInvalid('email') && <FieldError id="email-error" message={errors.email} />}
                </div>

                {/* Phone Number */}
                <div className="rsr-field">
                    <label className="rsr-label" htmlFor="rsr-phone">Phone Number</label>
                    <div className="rsr-input-wrap">
                        <FieldIcon>{Icon.phone}</FieldIcon>
                        <input
                            id="rsr-phone"
                            className={`rsr-input${isInvalid('phoneNumber') ? ' rsr-input-invalid' : ''}`}
                            type="tel"
                            name="phoneNumber"
                            value={formData.phoneNumber}
                            onChange={(e) => {
                                // Keep input numeric and capped at 10 digits.
                                const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                                setField('phoneNumber', digits);
                            }}
                            onBlur={handleBlur}
                            placeholder="10-digit number"
                            autoComplete="tel"
                            inputMode="numeric"
                            maxLength={10}
                            aria-invalid={isInvalid('phoneNumber')}
                            aria-describedby={describedBy('phoneNumber')}
                            disabled={loading}
                        />
                    </div>
                    {isInvalid('phoneNumber') && <FieldError id="phoneNumber-error" message={errors.phoneNumber} />}
                </div>

                {/* Password */}
                <div className="rsr-field">
                    <label className="rsr-label" htmlFor="rsr-password">Password</label>
                    <div className="rsr-input-wrap">
                        <FieldIcon>{Icon.lock}</FieldIcon>
                        <input
                            id="rsr-password"
                            className={`rsr-input rsr-has-toggle${isInvalid('password') ? ' rsr-input-invalid' : ''}`}
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            placeholder="Min. 6 characters"
                            autoComplete="new-password"
                            aria-invalid={isInvalid('password')}
                            aria-describedby={describedBy('password') || (formData.password ? 'password-strength' : undefined)}
                            disabled={loading}
                        />
                        <button
                            type="button"
                            className="rsr-pw-toggle"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            aria-pressed={showPassword}
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16" height="16" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                            >
                                {showPassword ? Icon.eyeOff : Icon.eye}
                            </svg>
                        </button>
                    </div>
                    {/* Password strength meter */}
                    {formData.password && !isInvalid('password') && (
                        <div id="password-strength" className="rsr-strength" aria-live="polite">
                            <div className={`rsr-strength-bar lvl-${strength.level}`}>
                                <span /><span /><span />
                            </div>
                            <span className={`rsr-strength-label lvl-${strength.level}`}>
                                {strength.label}
                            </span>
                        </div>
                    )}
                    {isInvalid('password') && <FieldError id="password-error" message={errors.password} />}
                </div>

                {/* Confirm Password */}
                <div className="rsr-field">
                    <label className="rsr-label" htmlFor="rsr-confirm-password">Confirm Password</label>
                    <div className="rsr-input-wrap">
                        <FieldIcon>{Icon.lock}</FieldIcon>
                        <input
                            id="rsr-confirm-password"
                            className={`rsr-input rsr-has-toggle${isInvalid('confirmPassword') ? ' rsr-input-invalid' : ''}`}
                            type={showConfirm ? 'text' : 'password'}
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            placeholder="Re-enter password"
                            autoComplete="new-password"
                            aria-invalid={isInvalid('confirmPassword')}
                            aria-describedby={describedBy('confirmPassword')}
                            disabled={loading}
                        />
                        <button
                            type="button"
                            className="rsr-pw-toggle"
                            onClick={() => setShowConfirm((v) => !v)}
                            aria-label={showConfirm ? 'Hide password' : 'Show password'}
                            aria-pressed={showConfirm}
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16" height="16" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                            >
                                {showConfirm ? Icon.eyeOff : Icon.eye}
                            </svg>
                        </button>
                    </div>
                    {/* Live "passwords match" confirmation */}
                    {formData.confirmPassword && !isInvalid('confirmPassword') &&
                        formData.confirmPassword === formData.password && (
                            <span className="rsr-match-ok" aria-live="polite">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                    aria-hidden="true"
                                >
                                    {Icon.check}
                                </svg>
                                Passwords match
                            </span>
                        )}
                    {isInvalid('confirmPassword') && (
                        <FieldError id="confirmPassword-error" message={errors.confirmPassword} />
                    )}
                </div>

                {/* Role */}
                <div className="rsr-field">
                    <label className="rsr-label" htmlFor="rsr-role">Role</label>
                    <ThemedSelect
                        id="rsr-role"
                        ariaLabel="Role"
                        value={formData.role}
                        onChange={handleSelectChange('role')}
                        placeholder="Select Role"
                        disabled={loading}
                        invalid={isInvalid('role')}
                        describedById={describedBy('role')}
                        icon={<FieldIcon>{Icon.role}</FieldIcon>}
                        options={[
                            { value: 'Student', label: 'Student' },
                            { value: 'Faculty', label: 'Faculty' },
                        ]}
                    />
                    {isInvalid('role') && <FieldError id="role-error" message={errors.role} />}
                </div>

                {/* Gender */}
                <div className="rsr-field">
                    <label className="rsr-label" htmlFor="rsr-gender">Gender</label>
                    <ThemedSelect
                        id="rsr-gender"
                        ariaLabel="Gender"
                        value={formData.gender}
                        onChange={handleSelectChange('gender')}
                        placeholder="Select Gender"
                        disabled={loading}
                        invalid={isInvalid('gender')}
                        describedById={describedBy('gender')}
                        icon={<FieldIcon>{Icon.gender}</FieldIcon>}
                        options={[
                            { value: 'Male', label: 'Male' },
                            { value: 'Female', label: 'Female' },
                        ]}
                    />
                    {isInvalid('gender') && <FieldError id="gender-error" message={errors.gender} />}
                </div>

                {/* Terms & Privacy acceptance */}
                <div className="rsr-terms-row rsr-col-full">
                    <input
                        id="rsr-terms"
                        type="checkbox"
                        className="rsr-checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        disabled={loading}
                    />
                    <label htmlFor="rsr-terms" className="rsr-terms-label">
                        I agree to the <a href="#terms" onClick={(e) => e.preventDefault()}>Terms &amp; Conditions</a> and{' '}
                        <a href="#privacy" onClick={(e) => e.preventDefault()}>Privacy Policy</a>.
                    </label>
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    className="rsr-submit"
                    disabled={loading || !acceptedTerms}
                    aria-busy={loading}
                >
                    {loading ? (
                        <>
                            <span className="rsr-spinner" aria-hidden="true" />
                            Creating account...
                        </>
                    ) : (
                        <>
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18" height="18" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                            >
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <line x1="19" y1="8" x2="19" y2="14" />
                                <line x1="22" y1="11" x2="16" y2="11" />
                            </svg>
                            Create Account
                        </>
                    )}
                </button>

                {/* Trust footnote */}
                <p className="rsr-footnote">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                    >
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    Safe &amp; verified university community
                </p>
            </form>
            )}

            {/* Sign up with Google (renders only when configured) */}
            <GoogleSignupButton
                onAuthenticated={handleGoogleAuthenticated}
                onProfileModeChange={setGoogleProfileMode}
            />
        </div>
    );
};

export default RegisterForm;
