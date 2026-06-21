import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { loginUser } from "../services/authService";
import { persistAuthTokens } from "../utils/authToken";
import ForgotPassword from "./ForgotPassword";
import GoogleSignupButton from "./GoogleSignupButton";
import "../styles/login.css";

// Lightweight inline field icon (matches the register form's style).
const FieldIcon = ({ children }) => (
    <svg
        className="rsl-input-icon"
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

const LoginForm = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [googleFlowActive, setGoogleFlowActive] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        if (loading) return; // prevent duplicate submissions
        setLoading(true);
        try {
            const response = await loginUser({ email, password });
            // Dev-only token persistence (cross-origin tunnels). No-op in prod
            // where the access + refresh httpOnly cookies are the credentials.
            persistAuthTokens(response.data);
            toast.success(response.data.message || "Login successful!");
            navigate("/dashboard");
        } catch (error) {
            console.error("❌ Login Error:", error);

            // Check for ad blocker or network blocking issues
            if (error.code === 'ERR_BLOCKED_BY_CLIENT' || error.message?.includes('ERR_BLOCKED_BY_CLIENT')) {
                toast.error("Request blocked. Please disable your ad blocker or check your browser extensions.", {
                    autoClose: 5000
                });
            } else if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
                toast.error("Network error. Please check if the backend server is running and accessible.", {
                    autoClose: 5000
                });
            } else {
                toast.error(error.response?.data?.message || "Login failed. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    if (showForgotPassword) {
        return <ForgotPassword onBack={() => setShowForgotPassword(false)} />;
    }

    // Google result on the LOGIN page: in every case the user ends up
    // authenticated (existing account → login; new account → created + OTP
    // verified), so we go straight to the dashboard. (`token` is dev-only now;
    // in production auth rides on the httpOnly cookie the server already set.)
    const handleGoogleAuthenticated = () => {
        navigate("/dashboard");
    };

    return (
        <div className="rsl-root">
            {/* Welcome-back "arrival" hero — distinct from the register commute hero */}
            {!googleFlowActive && (
            <div className="rsl-hero" aria-hidden="true">
                <div className="rsl-hero-text">
                    <div className="rsl-hero-title">Welcome back</div>
                    <div className="rsl-hero-sub">Your next ride is one tap away</div>
                </div>
                <div className="rsl-track" />
                <span className="rsl-pin-ping" />
                <svg
                    className="rsl-pin"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                >
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
                </svg>
                <svg
                    className="rsl-car"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                >
                    <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
                </svg>
            </div>
            )}

            {!googleFlowActive && (
            <form onSubmit={handleLogin} noValidate>
                {/* Email */}
                <div className="rsl-field">
                    <label className="rsl-label" htmlFor="rsl-email">Email</label>
                    <div className="rsl-input-wrap">
                        <FieldIcon>
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="m22 7-10 6L2 7" />
                        </FieldIcon>
                        <input
                            id="rsl-email"
                            className="rsl-input"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com"
                            autoComplete="email"
                            required
                            disabled={loading}
                            autoFocus
                        />
                    </div>
                </div>

                {/* Password */}
                <div className="rsl-field">
                    <label className="rsl-label" htmlFor="rsl-password">Password</label>
                    <div className="rsl-input-wrap">
                        <FieldIcon>
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </FieldIcon>
                        <input
                            id="rsl-password"
                            className="rsl-input rsl-has-toggle"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Your password"
                            autoComplete="current-password"
                            required
                            disabled={loading}
                        />
                        <button
                            type="button"
                            className="rsl-pw-toggle"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            aria-pressed={showPassword}
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16" height="16" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                            >
                                {showPassword ? (
                                    <>
                                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 2 11s3.5 7 10 7a9.12 9.12 0 0 0 5.39-1.61" />
                                        <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88M1 1l22 22" />
                                    </>
                                ) : (
                                    <>
                                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </>
                                )}
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Forgot password */}
                <div className="rsl-forgot-row">
                    <button
                        type="button"
                        onClick={() => setShowForgotPassword(true)}
                        className="rsl-forgot"
                        disabled={loading}
                    >
                        Forgot Password?
                    </button>
                </div>

                {/* Submit */}
                <button type="submit" className="rsl-submit" disabled={loading} aria-busy={loading}>
                    {loading ? (
                        <>
                            <span className="rsl-spinner" aria-hidden="true" />
                            Logging in...
                        </>
                    ) : (
                        <>
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18" height="18" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                            >
                                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                <polyline points="10 17 15 12 10 7" />
                                <line x1="15" y1="12" x2="3" y2="12" />
                            </svg>
                            Login
                        </>
                    )}
                </button>
            </form>
            )}

            {/* Continue with Google (existing → dashboard, new → create + dashboard).
                Renders only when configured; hides the form during its profile/OTP steps. */}
            <GoogleSignupButton
                onAuthenticated={handleGoogleAuthenticated}
                onProfileModeChange={setGoogleFlowActive}
            />
        </div>
    );
};

export default LoginForm;
