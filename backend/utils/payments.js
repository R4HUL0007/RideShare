const crypto = require("crypto");

// Pure, dependency-free payment helpers so the security-critical logic can be
// unit-tested in isolation (no DB, no network). The payment controller uses
// these so tests exercise the exact code that runs in production.

/**
 * Verify a Razorpay payment signature.
 *
 * Razorpay signs `${order_id}|${payment_id}` with HMAC-SHA256 using the key
 * secret. We recompute it and compare in constant time. Returns false for any
 * missing input rather than throwing, so callers can treat it as a clean
 * boolean gate.
 *
 * @param {string} orderId   razorpay_order_id
 * @param {string} paymentId razorpay_payment_id
 * @param {string} signature razorpay_signature (hex)
 * @param {string} secret    RAZORPAY_KEY_SECRET
 * @returns {boolean} whether the signature is authentic
 */
function verifyRazorpaySignature(orderId, paymentId, signature, secret) {
    if (!orderId || !paymentId || !signature || !secret) return false;

    const expected = crypto
        .createHmac("sha256", secret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

    // Constant-time comparison to avoid timing leaks. Lengths must match for
    // timingSafeEqual; a length mismatch is simply not-equal.
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(String(signature), "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

/**
 * Compute the fare breakdown for booking `seats` on a ride at `perSeat` rupees.
 * Commission is a configurable percentage taken FROM the fare (so the driver
 * receives the remainder); tax is future-ready and defaults to 0.
 *
 * All amounts are integers-friendly rupees. The passenger pays `fare + tax`;
 * the platform keeps `platformFee` out of the fare; the driver earns the rest.
 *
 * @param {number} perSeat      price per seat (rupees)
 * @param {number} seats        seat count (>= 1)
 * @param {number} commissionPct platform commission percentage [0..100]
 * @param {number} [taxPct=0]   tax percentage on the fare [0..100]
 */
function computeBreakdown(perSeat, seats, commissionPct = 0, taxPct = 0) {
    const p = Math.max(0, Number(perSeat) || 0);
    const n = Math.max(1, Math.floor(Number(seats) || 1));
    const pct = Math.min(100, Math.max(0, Number(commissionPct) || 0));
    const taxPercent = Math.min(100, Math.max(0, Number(taxPct) || 0));

    const fare = p * n;
    const platformFee = Math.round((fare * pct) / 100);
    const tax = Math.round((fare * taxPercent) / 100);
    const total = fare + tax; // passenger pays fare + tax
    const driverEarnings = Math.max(0, fare - platformFee);

    return { perSeat: p, seats: n, fare, platformFee, tax, total, driverEarnings };
}

module.exports = { verifyRazorpaySignature, computeBreakdown };
