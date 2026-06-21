import axiosInstance from '../utils/axiosConfig';
import {
    API_BASE_URL,
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_UPLOAD_PRESET,
} from '../utils/constants';

// Whether the Cloudinary unsigned upload is configured.
export const isCloudinaryConfigured = () =>
    Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET);

// Fetch the current user's profile (existing endpoint).
export const getProfile = async () => {
    return await axiosInstance.get(`${API_BASE_URL}/auth/me`);
};

// Update editable profile fields (name, phoneNumber, gender, profilePicture).
export const updateProfile = async (data) => {
    return await axiosInstance.put(`${API_BASE_URL}/auth/profile`, data);
};

// Change password for a logged-in local account.
export const changePassword = async (currentPassword, newPassword) => {
    return await axiosInstance.put(`${API_BASE_URL}/auth/change-password`, {
        currentPassword,
        newPassword,
    });
};

// Update notification preferences.
export const updateNotificationPrefs = async (prefs) => {
    return await axiosInstance.put(`${API_BASE_URL}/auth/notification-prefs`, prefs);
};

/**
 * Upload an image to Cloudinary via an UNSIGNED preset (client-side).
 * Returns the hosted secure_url. Throws on failure.
 *
 * Note: a separate axios call (not axiosInstance) is used so our app's
 * Authorization header / 401 interceptor are NOT sent to Cloudinary.
 */
export const uploadToCloudinary = async (file) => {
    if (!isCloudinaryConfigured()) {
        throw new Error('Cloudinary is not configured');
    }
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    // Use fetch to avoid leaking app auth headers to a third-party origin.
    const res = await fetch(url, { method: 'POST', body: form });
    if (!res.ok) {
        throw new Error('Upload failed');
    }
    const data = await res.json();
    return data.secure_url;
};
