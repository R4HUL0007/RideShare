// Auth-token storage strategy.
//
// PRODUCTION (Vite production build): the app is served same-origin behind nginx
// and authenticates EXCLUSIVELY via the httpOnly `token` cookie. We never store
// the JWT in JS-readable storage, so an XSS payload cannot exfiltrate it.
//
// DEVELOPMENT (dev server / cross-origin tunnels like ngrok/devtunnels): a
// sameSite cookie isn't sent cross-site, so we fall back to a localStorage
// Bearer token sent via the Authorization header.
//
// `import.meta.env.PROD` is statically true only in production builds.
const COOKIE_ONLY = import.meta.env.PROD;
const TOKEN_KEY = "token";
const REFRESH_KEY = "refreshToken";

export const isCookieOnlyAuth = () => COOKIE_ONLY;

// Persist the access token only in dev (no-op in production).
export const saveToken = (token) => {
    if (COOKIE_ONLY || !token) return;
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
};

// Read the access token only in dev (returns null in production → cookie used).
export const getToken = () => {
    if (COOKIE_ONLY) return null;
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};

// Persist the refresh token only in dev (prod keeps it in the httpOnly cookie).
export const saveRefreshToken = (token) => {
    if (COOKIE_ONLY || !token) return;
    try { localStorage.setItem(REFRESH_KEY, token); } catch { /* ignore */ }
};

export const getRefreshToken = () => {
    if (COOKIE_ONLY) return null;
    try { return localStorage.getItem(REFRESH_KEY); } catch { return null; }
};

// Persist both tokens from an auth/refresh response (dev-only; no-op in prod).
export const persistAuthTokens = (data) => {
    saveToken(data?.token);
    saveRefreshToken(data?.refreshToken);
};

// Always safe to call; clears any locally-stored tokens.
export const clearToken = () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
};

export const clearAuthTokens = () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(REFRESH_KEY); } catch { /* ignore */ }
};
