import { useState } from 'react';
import { toast } from 'react-toastify';
import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';
import { persistAuthTokens } from '../utils/authToken';import '../styles/otp.css';
import '../styles/otp.css';

const VerifyOTP = ({ email, onVerified, purpose = 'verification' }) => {
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPasswordFields, setShowPasswordFields] = useState(false);

    const handleChange = (index, value) => {
        if (value.length > 1) return; // Only allow single digit
        
        const newOtp = [...otp];
        newOtp[index] = value;
        setOtp(newOtp);

        // Auto-focus next input
        if (value && index < 5) {
            const nextInput = document.getElementById(`otp-${index + 1}`);
            if (nextInput) nextInput.focus();
        }
    };

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            const prevInput = document.getElementById(`otp-${index - 1}`);
            if (prevInput) prevInput.focus();
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').trim();
        if (pastedData.length === 6 && /^\d+$/.test(pastedData)) {
            const newOtp = pastedData.split('');
            setOtp(newOtp);
            document.getElementById('otp-5').focus();
        }
    };

    const handleVerify = async (e) => {
        e.preventDefault();
        const otpString = otp.join('');
        
        if (otpString.length !== 6) {
            toast.error('Please enter the complete 6-digit OTP');
            return;
        }

        // For password reset, validate OTP first, then show password fields
        if (purpose === 'reset' && !showPasswordFields) {
            // Verify OTP first
            setLoading(true);
            try {
                // We'll verify the OTP is valid format, then show password fields
                // The actual OTP verification happens when submitting with password
                setShowPasswordFields(true);
                toast.info('OTP accepted. Please enter your new password.');
            } catch (error) {
                toast.error('Invalid OTP format');
            } finally {
                setLoading(false);
            }
            return;
        }

        // Validate passwords for reset
        if (purpose === 'reset') {
            if (!newPassword || newPassword.length < 6) {
                toast.error('Password must be at least 6 characters');
                return;
            }
            if (newPassword !== confirmPassword) {
                toast.error('Passwords do not match');
                return;
            }
        }

        setLoading(true);
        try {
            const endpoint = purpose === 'verification' 
                ? `${API_BASE_URL}/auth/verify-otp`
                : `${API_BASE_URL}/auth/reset-password`;
            
            const payload = purpose === 'verification'
                ? { email, otp: otpString }
                : { email, otp: otpString, newPassword };

            const response = await axios.post(endpoint, payload, {
                withCredentials: true
            });

            // Dev-only token persistence. No-op in production (httpOnly access +
            // refresh cookies set by the server are the sole credentials there).
            persistAuthTokens(response.data);

            toast.success(response.data.message || 'Verification successful!');
            if (onVerified) {
                onVerified();
            }
        } catch (error) {
            if (purpose === 'reset' && showPasswordFields) {
                // If OTP is invalid, reset to OTP entry
                setShowPasswordFields(false);
                setOtp(['', '', '', '', '', '']);
                document.getElementById('otp-0')?.focus();
            }
            toast.error(error.response?.data?.message || 'Invalid OTP. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResendOTP = async () => {
        setResending(true);
        try {
            const endpoint = purpose === 'verification'
                ? `${API_BASE_URL}/auth/resend-otp`
                : `${API_BASE_URL}/auth/forgot-password`;
            
            await axios.post(endpoint, { email });
            toast.success('OTP sent successfully! Please check your email.');
            setOtp(['', '', '', '', '', '']);
            document.getElementById('otp-0').focus();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to resend OTP');
        } finally {
            setResending(false);
        }
    };

    return (
        <div className="otp-verification ov-root">
            <div className="ov-badge" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                </svg>
            </div>
            <h2>{purpose === 'verification' ? 'Verify Your Email' : 'Reset Your Password'}</h2>
            <p>We've sent a 6-digit verification code to <strong>{email}</strong></p>
            
            <form onSubmit={handleVerify}>
                <div className="otp-input-container">
                    {otp.map((digit, index) => (
                        <input
                            key={index}
                            id={`otp-${index}`}
                            type="text"
                            inputMode="numeric"
                            maxLength="1"
                            value={digit}
                            onChange={(e) => handleChange(index, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(index, e)}
                            onPaste={index === 0 ? handlePaste : undefined}
                            className={`otp-input${digit ? ' filled' : ''}`}
                            autoFocus={index === 0 && !showPasswordFields}
                            disabled={loading || showPasswordFields}
                        />
                    ))}
                </div>

                {purpose === 'reset' && showPasswordFields && (
                    <>
                        <div>
                            <label>New Password</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                minLength={6}
                                disabled={loading}
                            />
                        </div>
                        <div>
                            <label>Confirm Password</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength={6}
                                disabled={loading}
                            />
                        </div>
                    </>
                )}

                <button type="submit" disabled={loading} className="btn btn-primary">
                    {loading 
                        ? (purpose === 'reset' ? 'Resetting...' : 'Verifying...') 
                        : (purpose === 'reset' && !showPasswordFields 
                            ? 'Continue' 
                            : purpose === 'reset' 
                                ? 'Reset Password' 
                                : 'Verify OTP')
                    }
                </button>
            </form>

            <div className="otp-resend">
                <p>Didn't receive the code?</p>
                <button 
                    type="button" 
                    onClick={handleResendOTP} 
                    disabled={resending}
                    className="btn-link"
                >
                    {resending ? 'Sending...' : 'Resend OTP'}
                </button>
            </div>
        </div>
    );
};

export default VerifyOTP;

