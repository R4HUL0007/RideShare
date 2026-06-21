// Pure, dependency-free escrow helpers so the payout-critical logic is unit
// testable in isolation (no DB, no timers). The payment controller + scheduler
// use these so tests exercise the exact production code.

// Hours after ride completion before escrow auto-releases to the driver if the
// passenger neither confirms nor disputes. Configurable via env.
const getAutoReleaseHours = () => {
    const n = Number(process.env.ESCROW_AUTO_RELEASE_HOURS);
    return Number.isFinite(n) && n > 0 ? n : 24;
};

/**
 * Given the moment a ride was completed, return the instant at which escrow
 * should auto-release. `from` may be a Date or ms timestamp.
 */
const computeAutoReleaseAt = (from = Date.now(), hours = getAutoReleaseHours()) => {
    const base = from instanceof Date ? from.getTime() : Number(from);
    return new Date(base + hours * 60 * 60 * 1000);
};

/**
 * Is a payment eligible for AUTO release right now?
 * Only payments that are paid (Successful), still held awaiting completion, NOT
 * disputed, and whose autoReleaseAt has passed.
 *
 * @param {object} payment a Payment-like object
 * @param {number} [now=Date.now()]
 */
const isEligibleForAutoRelease = (payment, now = Date.now()) => {
    if (!payment) return false;
    if (payment.status !== "Successful") return false;
    if (payment.escrowStatus !== "awaiting_completion") return false;
    if (!payment.autoReleaseAt) return false;
    const at = payment.autoReleaseAt instanceof Date ? payment.autoReleaseAt.getTime() : new Date(payment.autoReleaseAt).getTime();
    return now >= at;
};

/**
 * Can the given user (must be the payer) confirm completion to release escrow?
 * Allowed only while the payment is paid and the escrow is held or awaiting
 * completion (not already released/refunded/disputed).
 */
const canPassengerRelease = (payment, userId) => {
    if (!payment) return false;
    const payer = payment.user_id?._id ? payment.user_id._id.toString() : String(payment.user_id);
    if (payer !== String(userId)) return false;
    if (payment.status !== "Successful") return false;
    return ["held", "awaiting_completion"].includes(payment.escrowStatus);
};

/**
 * Reduce a list of a driver's payments into balance buckets (rupees).
 *   escrowPending : earnings held (held + awaiting_completion, not disputed)
 *   disputed      : earnings frozen in dispute
 *   released      : earnings released to the driver (available to withdraw,
 *                   minus anything already tied to a withdrawal)
 *   withdrawn     : released earnings already attached to a withdrawal
 *   total         : lifetime earnings that are at least released
 *   available     : released - withdrawn (what a driver can request now)
 */
const summarizeDriverBalances = (payments = []) => {
    let escrowPending = 0, disputed = 0, released = 0, withdrawn = 0;
    for (const p of payments) {
        if (p.status !== "Successful") continue;
        const amt = p.driverEarnings || 0;
        switch (p.escrowStatus) {
            case "held":
            case "awaiting_completion":
                escrowPending += amt; break;
            case "disputed":
                disputed += amt; break;
            case "released":
                released += amt;
                if (p.withdrawal_id) withdrawn += amt;
                break;
            default:
                break;
        }
    }
    const available = Math.max(0, released - withdrawn);
    return {
        escrowPending,
        disputed,
        released,
        withdrawn,
        available,
        total: released + escrowPending, // lifetime earned (excl. refunded)
    };
};

module.exports = {
    getAutoReleaseHours,
    computeAutoReleaseAt,
    isEligibleForAutoRelease,
    canPassengerRelease,
    summarizeDriverBalances,
};
