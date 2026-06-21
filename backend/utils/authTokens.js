const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const RefreshToken = require("../models/RefreshToken");

// =======================================================
// Access + refresh token helpers (production-grade auth).
//
//  • Access token  : short-lived JWT (default 15m), carried in the `accessToken`
//                    httpOnly cookie. Stateless — verified by authMiddleware.
//  • Refresh token : long-lived opaque random token (default 20d), carried in
//                    the `refreshToken` httpOnly cookie (scoped to /api/auth).
//                    Stored server-side as an HMAC hash so it can be ROTATED on
//                    every use and REVOKED on logout / reuse.
//
// All durations are env-configurable.
// =======================================================

const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const ACCESS_COOKIE_MS = (() => {
    const n = Number(process.env.ACCESS_TOKEN_TTL_MS);
    return Number.isFinite(n) && n > 0 ? n : 15 * 60 * 1000; // 15 minutes
})();
const REFRESH_TTL_DAYS = (() => {
    const n = Number(process.env.REFRESH_TOKEN_TTL_DAYS);
    return Number.isFinite(n) && n > 0 ? n : 20; // 20 days
})();
const REFRESH_TTL_MS = REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;

const ACCESS_COOKIE = "accessToken";
const REFRESH_COOKIE = "refreshToken";
const LEGACY_COOKIE = "token";
// Refresh cookie is only ever sent to the auth endpoints that need it.
const REFRESH_PATH = "/api/auth";

const isProd = () => process.env.NODE_ENV === "production";

// Sign a stateless access JWT. Carries role claims so downstream services could
// authorize statelessly, though our middleware still re-loads the user.
function signAccessToken(user) {
    return jwt.sign(
        {
            id: user._id,
            role: user.role,
            isAdmin: Boolean(user.isAdmin),
            adminRole: user.adminRole || "none",
            typ: "access",
        },
        process.env.JWT_SECRET,
        { expiresIn: ACCESS_TTL }
    );
}

// HMAC the opaque refresh token with a server secret before storage/lookup, so
// a DB compromise alone can't produce a token that matches a stored hash.
const refreshSalt = () => process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;
const hashToken = (token) => crypto.createHmac("sha256", refreshSalt()).update(String(token)).digest("hex");
const newOpaqueToken = () => crypto.randomBytes(48).toString("hex");

// Create + persist a refresh token for a user. Pass an existing `family` to
// rotate within the same lineage; omit it to start a fresh family (new login).
async function issueRefreshToken(user, { family, req } = {}) {
    const token = newOpaqueToken();
    await RefreshToken.create({
        user_id: user._id,
        tokenHash: hashToken(token),
        family: family || crypto.randomBytes(16).toString("hex"),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        userAgent: String(req?.headers?.["user-agent"] || "").slice(0, 200),
        ip: req?.ip || "",
    });
    return token;
}

function cookieBase() {
    return { httpOnly: true, secure: isProd(), sameSite: "lax" };
}

// Set the access cookie (site-wide) and, when provided, the refresh cookie
// (scoped to /api/auth). Pass refreshToken=null to refresh only the access cookie.
function setAuthCookies(res, accessToken, refreshToken) {
    res.cookie(ACCESS_COOKIE, accessToken, { ...cookieBase(), maxAge: ACCESS_COOKIE_MS, path: "/" });
    if (refreshToken) {
        res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieBase(), maxAge: REFRESH_TTL_MS, path: REFRESH_PATH });
    }
}

function clearAuthCookies(res) {
    res.clearCookie(ACCESS_COOKIE, { path: "/" });
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
    res.clearCookie(LEGACY_COOKIE); // legacy single-token cookie (migration)
}

// Pull the presented refresh token from the cookie (prod) or, for dev
// cross-origin tunnels where a sameSite cookie isn't sent, an explicit header/body.
function readRefreshToken(req) {
    return (
        req.cookies?.[REFRESH_COOKIE] ||
        req.headers?.["x-refresh-token"] ||
        req.body?.refreshToken ||
        null
    );
}

module.exports = {
    ACCESS_TTL, ACCESS_COOKIE_MS, REFRESH_TTL_DAYS, REFRESH_TTL_MS,
    ACCESS_COOKIE, REFRESH_COOKIE, LEGACY_COOKIE, REFRESH_PATH,
    isProd, signAccessToken, hashToken, newOpaqueToken, issueRefreshToken,
    setAuthCookies, clearAuthCookies, readRefreshToken,
};
