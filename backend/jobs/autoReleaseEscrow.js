const Payment = require("../models/Payment");
const { isEligibleForAutoRelease } = require("../utils/escrow");

// Periodic sweep that auto-releases escrow to drivers when a passenger neither
// confirms nor disputes within the auto-release window. Silence must NEVER
// block a driver's payout — this job is what guarantees that.
//
// Eligibility (see utils/escrow.isEligibleForAutoRelease): payment Successful,
// escrow still `awaiting_completion` (i.e. NOT disputed/released/refunded), and
// autoReleaseAt has passed. Disputed payments are skipped by definition.

/**
 * Run one sweep. Returns the number of payments released. Exposed separately so
 * it can be unit-tested deterministically without timers.
 *
 * @param {object} ctx { io, users } for notifications (optional)
 */
let sweepRunning = false;

async function runAutoReleaseSweep({ io, users } = {}) {
    // Re-entrancy guard: if a previous sweep is still running (slow DB / large
    // backlog), skip this tick so two sweeps can't process the same batch.
    if (sweepRunning) return 0;
    sweepRunning = true;
    try {
        // Lazy require to avoid a circular import at module load.
        const { _releaseEscrow } = require("../controllers/paymentController");

        const now = Date.now();
        const due = await Payment.find({
            status: "Successful",
            escrowStatus: "awaiting_completion",
            autoReleaseAt: { $lte: new Date(now) },
        });

        let released = 0;
        for (const payment of due) {
            // Defensive double-check against the pure predicate.
            if (!isEligibleForAutoRelease(payment, now)) continue;
            // _releaseEscrow is an atomic conditional transition, so even if a
            // dispute lands between the find and here, it won't be released.
            const updated = await _releaseEscrow(payment, "auto", { io, users });
            if (updated && updated.escrowStatus === "released") released += 1;
        }
        if (released > 0) {
            console.log(`[autoReleaseEscrow] released ${released} payment(s) to drivers.`);
        }
        return released;
    } finally {
        sweepRunning = false;
    }
}

let timer = null;

/**
 * Start the recurring sweep. Safe to call once at server boot. Interval is
 * configurable via ESCROW_SWEEP_INTERVAL_MS (default 15 minutes).
 */
function startAutoReleaseScheduler(app) {
    if (timer) return timer;
    const intervalMs = Number(process.env.ESCROW_SWEEP_INTERVAL_MS) || 15 * 60 * 1000;
    const ctx = app
        ? { io: app.get("io"), users: app.get("users") }
        : {};

    // Kick one sweep shortly after boot, then on the interval.
    const tick = () => runAutoReleaseSweep(ctx).catch((e) => console.error("[autoReleaseEscrow] sweep error:", e.message));
    setTimeout(tick, 30 * 1000);
    timer = setInterval(tick, intervalMs);
    if (timer.unref) timer.unref(); // don't keep the process alive just for this
    return timer;
}

module.exports = { runAutoReleaseSweep, startAutoReleaseScheduler };
