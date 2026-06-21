import { useState, useRef, useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { toast } from 'react-toastify';
import { googleAuth, verifyGoogleSignup } from '../services/authService';
import { GOOGLE_CLIENT_ID } from '../utils/constants';
import { getToken, persistAuthTokens } from '../utils/authToken';
import ThemedSelect from './ThemedSelect';
import VerifyOTP from './VerifyOTP';
import { validateField } from '../utils/registerValidation';

/**
 * GoogleSignupButton — "Continue with Google" for the registration page.
 *
 * Flow (new user):
 *   Google → verify token → Complete Profile → OTP Verification →
 *   Create Account (only now) → JWT → Dashboard.
 *
 * The account is NOT created until the OTP is confirmed. After profile entry the
 * backend emails an OTP and returns a short-lived signed `pendingToken` (which
 * carries the verified Google identity + profile + a hashed OTP). On OTP submit
 * we POST { pendingToken, otp } to /auth/google/verify, which creates the
 * account and returns the JWT.
 *
 * Existing verified user → logs straight in. Legacy unverified row → standard
 * VerifyOTP (/auth/verify-otp).
 *
 * Renders nothing when no Google client ID is configured (graceful degradation).
 */
const GoogleSignupButton = ({ onAuthenticated, onProfileModeChange }) => {
    const [needsProfile, setNeedsProfile] = useState(false);
    const [otpEmail, setOtpEmail] = useState('');
    // When set, OTP is for a brand-new signup → verify via /google/verify.
    const [pendingToken, setPendingToken] = useState('');
    const [otp, setOtp] = useState('');
    const [otpExpired, setOtpExpired] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(0);
    const [loading, setLoading] = useState(false);
    const [prefill, setPrefill] = useState({ name: '', email: '' });
    const [profile, setProfile] = useState({
        username: '',
        role: '',
        gender: '',
        phoneNumber: '',
    });
    const [errors, setErrors] = useState({});
    // Keep the verified Google credential to resend with the completed profile.
    const credentialRef = useRef(null);
    // Guards against the auto-submit firing more than once for the same code.
    const autoSubmittedRef = useRef(false);

    // The Google flow "owns" the screen during profile completion OR OTP entry,
    // so notify the parent to hide the main registration form in both cases.
    useEffect(() => {
        if (onProfileModeChange) onProfileModeChange(needsProfile || Boolean(otpEmail));
    }, [needsProfile, otpEmail, onProfileModeChange]);

    // Countdown timer for the pending-signup OTP (truthful 3-min window).
    useEffect(() => {
        if (!otpEmail || !pendingToken || secondsLeft <= 0) return undefined;
        const id = setInterval(() => {
            setSecondsLeft((s) => {
                if (s <= 1) {
                    clearInterval(id);
                    setOtpExpired(true);
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [otpEmail, pendingToken, secondsLeft]);

    if (!GOOGLE_CLIENT_ID) {
        // No client ID configured — hide the feature entirely.
        return null;
    }

    const completeAuth = (data, mode = 'login') => {
        // Dev-only token persistence (cross-origin tunnels). No-op in production,
        // where the httpOnly access + refresh cookies set by the server are the
        // sole credentials.
        persistAuthTokens(data);
        if (onAuthenticated) onAuthenticated(data, mode);
    };

    const handleError = (error) => {
        if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
            toast.error('Network error. Please check your connection and try again.', { autoClose: 5000 });
        } else if (error.response?.status === 429) {
            toast.error('Too many attempts. Please wait a moment and try again.', { autoClose: 5000 });
        } else {
            toast.error(error.response?.data?.message || 'Google sign-in failed. Please try again.');
        }
    };

    const handleCredential = async (credentialResponse) => {
        const credential = credentialResponse?.credential;
        if (!credential) {
            toast.error('Google sign-in failed. Please try again.');
            return;
        }
        credentialRef.current = credential;
        setLoading(true);
        try {
            const { data } = await googleAuth(credential);
            if (data?.user) {
                // Existing verified account → logged in (server set the cookie;
                // `user` is the success signal — `token` is dev-only now).
                completeAuth(data, 'login');
                toast.success(data?.message || 'Signed in successfully!');
            } else if (data?.needsOtp) {
                // Legacy unverified account row → standard OTP (/verify-otp).
                setPendingToken('');
                setOtpEmail(data.email);
                toast.info(data?.message || 'Please verify the code sent to your email.');
            } else if (data?.needsProfile) {
                // New user — collect the fields Google can't provide.
                setPrefill(data.prefill || { name: '', email: '' });
                setNeedsProfile(true);
                toast.info('Almost there! Please complete your profile to finish signing up.');
            }
        } catch (error) {
            handleError(error);
        } finally {
            setLoading(false);
        }
    };

    const setField = (name, value) => {
        setProfile((prev) => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
        }
    };

    const validateProfile = () => {
        const next = {
            username: validateField('username', profile.username),
            role: validateField('role', profile.role),
            gender: validateField('gender', profile.gender),
            phoneNumber: validateField('phoneNumber', profile.phoneNumber),
        };
        const filtered = Object.fromEntries(Object.entries(next).filter(([, v]) => v));
        setErrors(filtered);
        return Object.keys(filtered).length === 0;
    };

    const submitProfile = async (e) => {
        e.preventDefault();
        if (loading) return;
        if (!validateProfile()) {
            toast.error('Please fix the highlighted fields');
            return;
        }
        setLoading(true);
        try {
            const { data } = await googleAuth(credentialRef.current, profile);
            if (data?.needsOtp) {
                // Profile accepted, OTP emailed. Account is NOT created yet —
                // it's created only after OTP at /google/verify. Carry the
                // signed pending token into the OTP step and start the timer.
                setNeedsProfile(false);
                setPendingToken(data.pendingToken || '');
                setOtpEmail(data.email);
                setOtp('');
                setOtpExpired(false);
                autoSubmittedRef.current = false;
                setSecondsLeft(data.expiresInSec || 180);
                toast.info(data?.message || 'Verification code sent to your email.');
                return;
            }
            if (data?.needsProfile) {
                // Token likely expired mid-flow — ask the user to retry Google.
                toast.error('Your Google session expired. Please click Continue with Google again.');
                setNeedsProfile(false);
                return;
            }
            // Defensive: if a token ever comes back directly, honor it.
            completeAuth(data, 'signup');
        } catch (error) {
            const msg = error.response?.data?.message || '';
            if (/username/i.test(msg)) setErrors((p) => ({ ...p, username: msg }));
            handleError(error);
        } finally {
            setLoading(false);
        }
    };

    // Verify the OTP for a brand-new Google signup → backend CREATES the account
    // and returns the JWT (Google → Profile → OTP → Create → JWT → Dashboard).
    // Shared by both auto-submit (on 6th digit) and the manual button.
    const verifyPendingOtp = async (code) => {
        if (loading || otpExpired) return;
        if (!code || code.length !== 6) {
            toast.error('Please enter the complete 6-digit code');
            return;
        }
        setLoading(true);
        try {
            const { data } = await verifyGoogleSignup(pendingToken, code);
            completeAuth(data, 'signup');
            toast.success(data?.message || 'Account created! Please sign in to continue.');
        } catch (error) {
            const msg = error.response?.data?.message || '';
            // Allow retry on a wrong code; bounce back to Google if expired.
            if (/expired|session/i.test(msg)) {
                setOtpExpired(true);
            } else {
                // Wrong code — clear it so the user can retype/re-autofill.
                setOtp('');
                autoSubmittedRef.current = false;
            }
            handleError(error);
        } finally {
            setLoading(false);
        }
    };

    const submitPendingOtp = (e) => {
        e.preventDefault();
        verifyPendingOtp(otp.trim());
    };

    // Restart the whole Google flow (used when the code/window expires).
    const restartGoogle = () => {
        setOtpEmail('');
        setPendingToken('');
        setOtp('');
        setOtpExpired(false);
        setSecondsLeft(0);
        autoSubmittedRef.current = false;
        toast.info('Please click "Continue with Google" to get a new code.');
    };

    // Legacy unverified account row finalizes via the standard /verify-otp path
    // (VerifyOTP stores the token); just complete auth afterwards.
    const handleLegacyOtpVerified = () => {
        const token = getToken();
        completeAuth({ token }, 'signup');
        toast.success('Account verified! Please sign in to continue.');
    };

    // Accept typed or pasted digits; auto-submit the moment 6 are present so the
    // user never has to click "Verify" (closest to "auto-read" for email OTPs —
    // a browser cannot read an email inbox; SMS-only Web OTP doesn't apply here).
    const handleOtpDigits = (e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
        setOtp(digits);
        if (digits.length === 6 && !autoSubmittedRef.current && !otpExpired) {
            autoSubmittedRef.current = true;
            verifyPendingOtp(digits);
        }
    };

    const formatTime = (total) => {
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    };

    // --- OTP verification step ---
    if (otpEmail) {
        // Legacy unverified account row → finalize via standard /verify-otp.
        if (!pendingToken) {
            return <VerifyOTP email={otpEmail} onVerified={handleLegacyOtpVerified} />;
        }

        // New Google signup → OTP creates the account via /google/verify.
        return (
            <div className="rsr-root rsr-google-profile" aria-live="polite">
                <p className="rsr-google-profile-title">Verify your email</p>
                <p className="rsr-google-profile-sub">
                    Enter the 6-digit code sent to <strong>{otpEmail}</strong>
                </p>
                <form onSubmit={submitPendingOtp} className="rsr-grid">
                    <div className="rsr-field rsr-col-full">
                        <label className="rsr-label" htmlFor="g-otp">Verification Code</label>
                        <div className="rsr-input-wrap">
                            <input
                                id="g-otp"
                                className="rsr-input rsr-otp-input"
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                value={otp}
                                onChange={handleOtpDigits}
                                placeholder="------"
                                autoComplete="one-time-code"
                                autoFocus
                                disabled={loading || otpExpired}
                            />
                        </div>

                        {/* Truthful countdown / expiry state */}
                        <div className="rsr-otp-meta">
                            {otpExpired ? (
                                <span className="rsr-otp-expired" role="alert">Code expired</span>
                            ) : (
                                <span className={`rsr-otp-timer${secondsLeft <= 30 ? ' low' : ''}`}>
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                        aria-hidden="true"
                                    >
                                        <circle cx="12" cy="12" r="9" />
                                        <polyline points="12 8 12 12 15 14" />
                                    </svg>
                                    Expires in {formatTime(secondsLeft)}
                                </span>
                            )}
                            <span className="rsr-otp-hint">Auto-verifies when complete</span>
                        </div>
                    </div>

                    {otpExpired ? (
                        <button
                            type="button"
                            className="rsr-submit"
                            onClick={restartGoogle}
                            disabled={loading}
                        >
                            Get a new code
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className="rsr-submit"
                            disabled={loading || otp.length !== 6}
                            aria-busy={loading}
                        >
                            {loading ? (
                                <>
                                    <span className="rsr-spinner" aria-hidden="true" />
                                    Verifying...
                                </>
                            ) : (
                                'Verify & Create Account'
                            )}
                        </button>
                    )}
                </form>
            </div>
        );
    }

    // --- Profile completion step ---
    if (needsProfile) {
        return (
            <div className="rsr-root rsr-google-profile" aria-live="polite">
                <p className="rsr-google-profile-title">Complete your profile</p>
                <p className="rsr-google-profile-sub">
                    Signing up as <strong>{prefill.email}</strong>
                </p>

                <form onSubmit={submitProfile} className="rsr-grid">
                    <div className="rsr-field rsr-col-full">
                        <label className="rsr-label" htmlFor="g-username">Username</label>
                        <div className="rsr-input-wrap">
                            <input
                                id="g-username"
                                className={`rsr-input${errors.username ? ' rsr-input-invalid' : ''}`}
                                type="text"
                                value={profile.username}
                                onChange={(e) => setField('username', e.target.value)}
                                placeholder="Choose a username"
                                autoComplete="username"
                                disabled={loading}
                                style={{ paddingLeft: '0.6rem' }}
                            />
                        </div>
                        {errors.username && (
                            <span className="rsr-error" role="alert">{errors.username}</span>
                        )}
                    </div>

                    <div className="rsr-field">
                        <label className="rsr-label" htmlFor="g-role">Role</label>
                        <ThemedSelect
                            id="g-role"
                            ariaLabel="Role"
                            value={profile.role}
                            onChange={(v) => setField('role', v)}
                            placeholder="Select Role"
                            disabled={loading}
                            invalid={Boolean(errors.role)}
                            options={[
                                { value: 'Student', label: 'Student' },
                                { value: 'Faculty', label: 'Faculty' },
                            ]}
                        />
                        {errors.role && <span className="rsr-error" role="alert">{errors.role}</span>}
                    </div>

                    <div className="rsr-field">
                        <label className="rsr-label" htmlFor="g-gender">Gender</label>
                        <ThemedSelect
                            id="g-gender"
                            ariaLabel="Gender"
                            value={profile.gender}
                            onChange={(v) => setField('gender', v)}
                            placeholder="Select Gender"
                            disabled={loading}
                            invalid={Boolean(errors.gender)}
                            options={[
                                { value: 'Male', label: 'Male' },
                                { value: 'Female', label: 'Female' },
                            ]}
                        />
                        {errors.gender && <span className="rsr-error" role="alert">{errors.gender}</span>}
                    </div>

                    <div className="rsr-field rsr-col-full">
                        <label className="rsr-label" htmlFor="g-phone">Phone Number</label>
                        <div className="rsr-input-wrap">
                            <input
                                id="g-phone"
                                className={`rsr-input${errors.phoneNumber ? ' rsr-input-invalid' : ''}`}
                                type="tel"
                                inputMode="numeric"
                                maxLength={10}
                                value={profile.phoneNumber}
                                onChange={(e) => setField('phoneNumber', e.target.value.replace(/\D/g, '').slice(0, 10))}
                                placeholder="10-digit number"
                                autoComplete="tel"
                                disabled={loading}
                                style={{ paddingLeft: '0.6rem' }}
                            />
                        </div>
                        {errors.phoneNumber && (
                            <span className="rsr-error" role="alert">{errors.phoneNumber}</span>
                        )}
                    </div>

                    <button type="submit" className="rsr-submit" disabled={loading} aria-busy={loading}>
                        {loading ? (
                            <>
                                <span className="rsr-spinner" aria-hidden="true" />
                                Finishing up...
                            </>
                        ) : (
                            'Complete Sign Up'
                        )}
                    </button>
                </form>
            </div>
        );
    }

    // --- Default: the Google button + divider ---
    return (
        <div className="rsr-root rsr-google">
            <div className="rsr-divider"><span>or</span></div>
            <div className={`rsr-google-btn${loading ? ' is-loading' : ''}`}>
                <GoogleLogin
                    onSuccess={handleCredential}
                    onError={() => toast.error('Google sign-in was cancelled or failed.')}
                    text="continue_with"
                    shape="pill"
                    width="100%"
                    theme="filled_black"
                    logo_alignment="center"
                />
            </div>
            <p className="rsr-google-note">
                Use your <strong>@paruluniversity.ac.in</strong> Google account only.
            </p>
        </div>
    );
};

export default GoogleSignupButton;
