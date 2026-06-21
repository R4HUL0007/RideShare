import axios from 'axios';
import { API_BASE_URL } from './constants';
import { getToken, getRefreshToken, persistAuthTokens, clearAuthTokens } from './authToken';

// Create axios instance with default config
const axiosInstance = axios.create({
    baseURL: '', // Don't set baseURL here since we're using full URLs
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Request interceptor: attach the Bearer token only in dev (cross-origin). In
// production `getToken()` returns null and auth rides on the httpOnly cookie.
axiosInstance.interceptors.request.use(
    (config) => {
        const token = getToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Auth endpoints that must NOT trigger a refresh-and-retry (avoids loops).
const isAuthEndpoint = (url = '') =>
    /\/auth\/(login|refresh|logout|register|verify-otp|resend-otp|google|forgot-password|reset-password)/.test(url);

// A single in-flight refresh shared across concurrent 401s (de-duplication), so
// a burst of failed requests triggers exactly one /auth/refresh call.
let refreshPromise = null;

async function runRefresh() {
    // Dev: send the stored refresh token as a header (cross-origin cookies
    // aren't sent). Prod: rely on the httpOnly refresh cookie (withCredentials).
    const headers = {};
    const rt = getRefreshToken();
    if (rt) headers['x-refresh-token'] = rt;
    // Bare axios (not axiosInstance) so this call skips the interceptors.
    const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true, headers });
    persistAuthTokens(data); // dev-only persistence; no-op in prod
    return data;
}

// Response interceptor: on a 401, transparently refresh the access token once
// and retry the original request. If refresh fails, clear local tokens and
// bounce to login.
axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const original = error.config;
        const status = error.response?.status;

        if (status === 401 && original && !original._retried && !isAuthEndpoint(original.url)) {
            original._retried = true;
            try {
                refreshPromise = refreshPromise || runRefresh().finally(() => { refreshPromise = null; });
                await refreshPromise;
                // Re-attach the (rotated) dev Bearer token; prod uses the cookie.
                const token = getToken();
                original.headers = original.headers || {};
                if (token) original.headers.Authorization = `Bearer ${token}`;
                return axiosInstance(original);
            } catch (refreshErr) {
                clearAuthTokens();
                if (window.location.pathname !== '/') {
                    window.location.href = '/';
                }
                return Promise.reject(refreshErr);
            }
        }
        return Promise.reject(error);
    }
);

export default axiosInstance;

