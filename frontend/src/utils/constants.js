// API Base URL with fallback
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Google OAuth client ID (optional). When unset, the "Continue with Google"
// button is hidden so the app degrades gracefully.
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// Cloudinary unsigned upload config (optional). When unset, the profile avatar
// upload is disabled gracefully and a URL can still be entered manually.
export const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '';
export const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '';

// Max avatar upload size in bytes (1 MB).
export const MAX_AVATAR_BYTES = 1 * 1024 * 1024;

// Log API URL in development for debugging (only in browser console)
if (import.meta.env.DEV) {
    console.log('🔧 API Base URL:', API_BASE_URL);
    console.log('🔧 VITE_API_URL env:', import.meta.env.VITE_API_URL || 'Not set (using fallback)');
}

