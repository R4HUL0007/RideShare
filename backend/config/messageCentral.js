// Message Central (VerifyNow) OTP verification — DIRECT API (cpaas.messagecentral.com).
//
// Message Central owns the whole OTP lifecycle: it GENERATES the code, SENDS the
// SMS, and VALIDATES the code the user enters. We only carry the `verificationId`
// returned by /send between the two steps. Delivers to Indian numbers without DLT
// (pre-approved routes/sender). We never see or store the OTP.
//
// We use the documented DIRECT endpoints (the RapidAPI proxy was unreliable for
// the validate call). Auth is via the account's customerId + password.
//
// Config (env):
//   MC_CUSTOMER_ID   — Message Central customer id (e.g. C-XXXXXXXX)   [required]
//   MC_PASSWORD      — account password (Base64-encoded into `key`)     [required]
//   MC_BASE_URL      — API base (default https://cpaas.messagecentral.com)
//   MC_EMAIL         — optional registered email
//   MC_COUNTRY_CODE  — default country code (default 91)
//
// Degrades gracefully: isMessageCentralEnabled() is false when creds are missing.

function baseUrl() {
    return process.env.MC_BASE_URL || "https://cpaas.messagecentral.com";
}
function isMessageCentralEnabled() {
    return Boolean(process.env.MC_CUSTOMER_ID && process.env.MC_PASSWORD);
}

// Auth token is reused across requests; refreshed periodically / on demand.
let cachedToken = null;
let tokenFetchedAt = 0;
const TOKEN_TTL_MS = 20 * 60 * 1000; // 20 minutes

async function getToken(force = false) {
    const now = Date.now();
    if (!force && cachedToken && now - tokenFetchedAt < TOKEN_TTL_MS) return cachedToken;

    const key = Buffer.from(String(process.env.MC_PASSWORD)).toString("base64");
    const params = new URLSearchParams({
        customerId: process.env.MC_CUSTOMER_ID,
        key,
        scope: "NEW",
        country: process.env.MC_COUNTRY_CODE || "91",
    });
    if (process.env.MC_EMAIL) params.append("email", process.env.MC_EMAIL);

    const res = await fetch(`${baseUrl()}/auth/v1/authentication/token?${params.toString()}`, {
        method: "GET",
        headers: { accept: "*/*" },
    });
    const data = await res.json().catch(() => ({}));
    const token = data?.token;
    if (!res.ok || !token) {
        const err = new Error(data?.message || `Message Central token failed (HTTP ${res.status})`);
        err.details = data;
        throw err;
    }
    cachedToken = token;
    tokenFetchedAt = now;
    return token;
}

// Send an OTP; Message Central generates + delivers it. Returns { verificationId, timeout }.
async function sendMcOtp(mobileNumber, countryCode) {
    const cc = countryCode || process.env.MC_COUNTRY_CODE || "91";
    const token = await getToken();
    const params = new URLSearchParams({
        countryCode: cc,
        mobileNumber: String(mobileNumber),
        flowType: "SMS",
        otpLength: "6",
    });
    const res = await fetch(`${baseUrl()}/verification/v3/send?${params.toString()}`, {
        method: "POST",
        headers: { authToken: token },
    });
    const data = await res.json().catch(() => ({}));
    const verificationId = data?.data?.verificationId;
    if (!res.ok || !verificationId) {
        const err = new Error(data?.data?.errorMessage || data?.message || `Message Central send failed (HTTP ${res.status})`);
        err.details = data;
        throw err;
    }
    return { verificationId: String(verificationId), timeout: data?.data?.timeout };
}

// Validate the code the user entered against the send's verificationId.
// Direct API: GET with query params + authToken header. Returns { ok, status }.
async function validateMcOtp(verificationId, code) {
    const token = await getToken();
    const params = new URLSearchParams({
        verificationId: String(verificationId),
        code: String(code),
    });
    const res = await fetch(`${baseUrl()}/verification/v3/validateOtp?${params.toString()}`, {
        method: "GET",
        headers: { authToken: token },
    });
    const data = await res.json().catch(() => ({}));
    const status = data?.data?.verificationStatus;
    return { ok: status === "VERIFICATION_COMPLETED", status: status || data?.message, raw: data };
}

module.exports = { isMessageCentralEnabled, sendMcOtp, validateMcOtp };
