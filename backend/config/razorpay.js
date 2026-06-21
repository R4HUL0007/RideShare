const Razorpay = require("razorpay");

// Lazily-constructed Razorpay client. Returns null when keys aren't configured
// so the rest of the app can degrade gracefully (free rides / direct booking
// still work without payments wired up).
let client = null;

const isRazorpayConfigured = () =>
    Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

const getRazorpay = () => {
    if (!isRazorpayConfigured()) return null;
    if (!client) {
        client = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
    }
    return client;
};

// Platform commission percentage taken from the ride fare. Configurable via
// env (PLATFORM_COMMISSION_PERCENT); defaults to 0 so drivers receive the full
// fare until a commission is intentionally set. Never hardcode commission.
const getCommissionPercent = () => {
    const n = Number(process.env.PLATFORM_COMMISSION_PERCENT);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0;
};

module.exports = { getRazorpay, isRazorpayConfigured, getCommissionPercent };
