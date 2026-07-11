// APITxT (authkey.io) SMS OTP delivery.
//
// APITxT's /api/sendOTP endpoint delivers an OTP *we* generate to a mobile
// number over SMS. When no template_id is supplied it uses APITxT's system
// default (DLT-free) route — which is why this works for Indian numbers without
// our own DLT registration (APITxT charges a bit more for that convenience).
//
// We still own OTP generation + verification (hashed + short expiry in our DB);
// APITxT is purely the delivery channel.
//
// Config (env):
//   APITXT_AUTHKEY          — API auth key (Dashboard → API Keys)
//   APITXT_OTP_TEMPLATE_ID  — optional; if set, uses your own SMS template
//
// Degrades gracefully: if APITXT_AUTHKEY is unset, isApitxtEnabled() is false.

const SEND_OTP_URL = "https://apitxt.com/api/sendOTP";

function isApitxtEnabled() {
    return Boolean(process.env.APITXT_AUTHKEY);
}

// Send an OTP over SMS via APITxT.
// `mobileDigits` should be E.164 digits without "+" (e.g. "919967881252").
// A bare 10-digit number is also accepted (APITxT auto-prepends 91).
async function sendApitxtOtp(mobileDigits, otp) {
    const authkey = process.env.APITXT_AUTHKEY;
    const templateId = process.env.APITXT_OTP_TEMPLATE_ID;

    const params = new URLSearchParams({
        authkey,
        mobile: String(mobileDigits),
        otp: String(otp),
    });
    if (templateId && templateId.trim()) params.append("template_id", templateId.trim());

    const res = await fetch(SEND_OTP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || String(data.status).toLowerCase() !== "success") {
        const err = new Error(data?.message || `APITxT OTP send failed (HTTP ${res.status})`);
        err.details = data;
        throw err;
    }
    return data;
}

module.exports = { isApitxtEnabled, sendApitxtOtp };
