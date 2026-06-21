import { useState } from 'react';
import { toast } from 'react-toastify';
import { forgotPassword } from '../services/authService';
import VerifyOTP from './VerifyOTP';

const ForgotPassword = ({ onBack }) => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [showOTPVerification, setShowOTPVerification] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await forgotPassword(email);
            toast.success('If the email exists, an OTP has been sent to your email.');
            setShowOTPVerification(true);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to send OTP');
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordReset = () => {
        toast.success('Password reset successfully! You can now login with your new password.');
        if (onBack) onBack();
    };

    if (showOTPVerification) {
        return (
            <div>
                <VerifyOTP email={email} onVerified={handlePasswordReset} purpose="reset" />
                <button 
                    type="button" 
                    onClick={() => setShowOTPVerification(false)}
                    className="auth-secondary-button"
                >
                    Back
                </button>
            </div>
        );
    }

    return (
        <div>
            <h2>Forgot Password</h2>
            <p>Enter your email address and we'll send you a verification code to reset your password.</p>
            <form onSubmit={handleSubmit}>
                <div>
                    <label>Email</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={loading}
                    />
                </div>
                <button type="submit" disabled={loading}>
                    {loading ? 'Sending...' : 'Send OTP'}
                </button>
            </form>
            <button 
                type="button" 
                onClick={onBack}
                className="auth-secondary-button"
            >
                Back to Login
            </button>
        </div>
    );
};

export default ForgotPassword;

