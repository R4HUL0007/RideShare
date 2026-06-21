import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';

// Configure axios to send cookies with requests
axios.defaults.withCredentials = true;

export const registerUser = async (userData) => {
    return await axios.post(`${API_BASE_URL}/auth/register`, userData);
};

export const verifyOTP = async (email, otp) => {
    return await axios.post(`${API_BASE_URL}/auth/verify-otp`, { email, otp });
};

export const resendOTP = async (email) => {
    return await axios.post(`${API_BASE_URL}/auth/resend-otp`, { email });
};

export const loginUser = async (userData) => {
    return await axios.post(`${API_BASE_URL}/auth/login`, userData);
};

// Google sign-in / sign-up. `credential` is the Google ID token; `profile`
// carries the extra fields (username/role/gender/phoneNumber) for new users.
export const googleAuth = async (credential, profile = null) => {
    return await axios.post(`${API_BASE_URL}/auth/google`, { credential, profile });
};

// Verify the OTP for a pending Google signup and create the account.
// `pendingToken` is the signed token returned by googleAuth for new users.
export const verifyGoogleSignup = async (pendingToken, otp) => {
    return await axios.post(`${API_BASE_URL}/auth/google/verify`, { pendingToken, otp });
};

export const forgotPassword = async (email) => {
    return await axios.post(`${API_BASE_URL}/auth/forgot-password`, { email });
};

export const resetPassword = async (email, otp, newPassword) => {
    return await axios.post(`${API_BASE_URL}/auth/reset-password`, { email, otp, newPassword });
};

export const logoutUser = async () => {
    return await axios.post(`${API_BASE_URL}/auth/logout`);
};
