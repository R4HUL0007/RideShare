const mongoose = require("mongoose");
const Ride = require("../models/Ride");
const User = require("../models/User");
const Payment = require("../models/Payment");
const Dispute = require("../models/Dispute");
const Withdrawal = require("../models/Withdrawal");
const { getRazorpay, isRazorpayConfigured, getCommissionPercent } = require("../config/razorpay");
const { verifyRazorpaySignature } = require("../utils/payments");
const {
    computeAutoReleaseAt,
    isEligibleForAutoRelease,
    canPassengerRelease,
    summarizeDriverBalances,
    getAutoReleaseHours,
} = require("../utils/escrow");
const { createNotification } = require("../utils/notify");

const idStr = (v) => (v == null ? null : typeof v === "string" ? v : v._id ? v._id.toString() : v.toString());

/**
 * GET /api/payments/config
 * Public-ish (auth-protected) config the checkout needs: whether payments are
 * enabled and the publishable key id. Never exposes the secret.
 */
exports.getConfig = async (req, res) => {
    res.status(200).json({
        enabled: isRazorpayConfigured(),
        keyId: process.env.RAZORPAY_KEY_ID || null,
        commissionPercent: getCommissionPercent(),
    });
};

/**
 * POST /api/payments/order/:rideId
 * Create a Razorpay order for booking `seats` on a ride and persist a Pending
 * payment. Validates the booking is possible BEFORE taking money. Does NOT
 * reserve seats yet — seats are only reduced after verified payment.
 * Body: { seats }
 */
exports.createOrder = async (req, res) => {
    const userId = req.user.id;
    const { rideId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(rideId)) {
        return res.status(400).json({ message: "Invalid ride id" });
    }
    if (!isRazorpayConfigured()) {
        return res.status(503).json({ message: "Online payments are not configured." });
    }

    try {
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });

        // Pay-AFTER-completion: the passenger must already be booked on this
        // ride, and the ride must be completed. The fare was LOCKED at booking
        // (segment-aware), so we charge exactly that — never recompute here.
        const booking = (ride.passengers || []).find((p) => idStr(p.user_id) === userId);
        if (!booking) {
            return res.status(400).json({ message: "You haven't booked this ride." });
        }
        if (ride.status !== "Completed") {
            return res.status(400).json({ message: "You can pay once the ride is completed." });
        }
        if (booking.paymentStatus === "paid") {
            return res.status(400).json({ message: "This ride is already paid." });
        }
        const total = Number(booking.fareAmount) || 0;
        if (total <= 0) {
            return res.status(400).json({ message: "This ride is free — no payment needed." });
        }
        // Idempotency: a prior Successful payment means it's already settled.
        const existingPaid = await Payment.findOne({ ride_id: ride._id, user_id: userId, status: "Successful" }).lean();
        if (existingPaid) {
            return res.status(400).json({ message: "This ride is already paid." });
        }

        const seats = booking.seats || 1;
        const commissionPct = getCommissionPercent();
        const platformFee = Math.round((total * commissionPct) / 100);
        const b = { total, fare: total, platformFee, tax: 0, driverEarnings: Math.max(0, total - platformFee), perSeat: Math.round(total / seats) };

        // Create the Razorpay order (amount in paise).
        const razorpay = getRazorpay();
        const order = await razorpay.orders.create({
            amount: Math.round(b.total * 100),
            currency: "INR",
            receipt: `ride_${rideId}_${userId}_${Date.now()}`.slice(0, 40),
            notes: { rideId, userId, seats: String(seats) },
        });

        // Persist a Pending payment tied to this order.
        const payment = await Payment.create({
            user_id: userId,
            driver_id: ride.user_id,
            ride_id: ride._id,
            seats,
            order_id: order.id,
            amount: b.total,
            currency: "INR",
            amountBreakdown: { fare: b.fare, platformFee: b.platformFee, tax: b.tax },
            driverEarnings: b.driverEarnings,
            status: "Pending",
            routeSnapshot: { source: ride.source, destination: ride.destination, timing: ride.timing },
        });

        res.status(201).json({
            orderId: order.id,
            amount: order.amount, // paise
            currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID,
            paymentId: payment._id,
            breakdown: {
                perSeat: b.perSeat, seats, fare: b.fare,
                platformFee: b.platformFee, tax: b.tax, total: b.total,
            },
        });
    } catch (error) {
        console.error("Error in createOrder:", error);
        res.status(500).json({ message: "Failed to start payment", error: error.message });
    }
};

/**
 * POST /api/payments/verify
 * Verify the Razorpay signature SERVER-SIDE, then — and only then — confirm the
 * booking (reduce seats, add passenger) and mark the payment Successful.
 * Idempotent: a re-sent verification for an already-confirmed payment is a no-op.
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
exports.verifyPayment = async (req, res) => {
    const userId = req.user.id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    const io = req.app.get("io");
    const users = req.app.get("users") || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ message: "Missing payment verification fields" });
    }

    try {
        const payment = await Payment.findOne({ order_id: razorpay_order_id });
        if (!payment) return res.status(404).json({ message: "Payment record not found" });

        // A user can only verify their own payment.
        if (idStr(payment.user_id) !== userId) {
            return res.status(403).json({ message: "Not your payment." });
        }

        // Idempotency: already confirmed → return success without re-booking.
        if (payment.status === "Successful") {
            return res.status(200).json({ message: "Payment already verified", payment });
        }

        // 1. Verify the signature (HMAC-SHA256 of "order_id|payment_id").
        const validSignature = verifyRazorpaySignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            process.env.RAZORPAY_KEY_SECRET
        );

        if (!validSignature) {
            payment.status = "Failed";
            payment.failureReason = "Signature verification failed";
            await payment.save();
            return res.status(400).json({ message: "Payment verification failed." });
        }

        // 2. Payment verified — start escrow. Pay happens AFTER completion, so
        //    the booking is already reserved and the ride already done; escrow
        //    goes straight to awaiting_completion with the 24h auto-release clock.
        const now = new Date();
        payment.status = "Successful";
        payment.payment_id = razorpay_payment_id;
        payment.signature = razorpay_signature;
        payment.paidAt = now;
        payment.escrowStatus = "awaiting_completion";
        payment.completedAt = now;
        payment.autoReleaseAt = computeAutoReleaseAt(now);
        await payment.save();

        // Flag the passenger's booking as paid + link the payment.
        await Ride.updateOne(
            { _id: payment.ride_id, "passengers.user_id": userId },
            { $set: { "passengers.$.paymentStatus": "paid", "passengers.$.payment_id": payment._id } }
        );

        const ride = await Ride.findById(payment.ride_id).lean();
        const dest = ride?.destination || "your destination";

        // 3. Notifications (user-scoped).
        await createNotification({
            io, users, userId, type: "system", title: "Payment successful",
            message: `You paid ₹${payment.amount} for your ride to ${dest}. Held safely — confirm anytime to release it to your driver (auto-releases in ${getAutoReleaseHours()}h).`,
            rideId: payment.ride_id, link: { tab: "payments" },
        });
        await createNotification({
            io, users, userId: idStr(payment.driver_id), type: "system", title: "Payment received 💰",
            message: `₹${payment.driverEarnings} is held in escrow for your completed ride to ${dest}. Released after the protection window.`,
            rideId: payment.ride_id, link: { tab: "earnings" },
        });

        return res.status(200).json({ message: "Payment verified", payment, ride });
    } catch (error) {
        console.error("Error in verifyPayment:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * POST /api/payments/failed
 * Record a cancelled/failed checkout (user dismissed Razorpay, or it errored).
 * Never reserves seats. Body: { orderId, reason }
 */
exports.markFailed = async (req, res) => {
    const userId = req.user.id;
    const { orderId, reason } = req.body || {};
    if (!orderId) return res.status(400).json({ message: "Missing order id" });
    try {
        const payment = await Payment.findOne({ order_id: orderId });
        if (!payment) return res.status(404).json({ message: "Payment not found" });
        if (idStr(payment.user_id) !== userId) {
            return res.status(403).json({ message: "Not your payment." });
        }
        // Don't override a successful payment.
        if (payment.status === "Pending") {
            payment.status = "Cancelled";
            payment.failureReason = (reason || "Payment cancelled").slice(0, 200);
            await payment.save();
        }
        res.status(200).json({ message: "Recorded", payment });
    } catch (error) {
        console.error("Error in markFailed:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * GET /api/payments/history
 * The logged-in user's own payments (as payer), newest first.
 * Optional filters: ?status=Successful&from=ISO&to=ISO
 */
exports.getMyPayments = async (req, res) => {
    const userId = req.user.id;
    try {
        const filter = { user_id: userId };
        if (req.query.status && req.query.status !== "All") filter.status = req.query.status;
        if (req.query.from || req.query.to) {
            filter.createdAt = {};
            if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
            if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
        }
        const payments = await Payment.find(filter)
            .populate("driver_id", "name profilePicture")
            .populate("ride_id", "source destination timing")
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();
        res.status(200).json(payments);
    } catch (error) {
        console.error("Error in getMyPayments:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * GET /api/payments/earnings
 * Driver earnings summary (escrow-aware balance buckets) + history. Scoped to
 * the logged-in driver. Includes payout details + pending withdrawals.
 */
exports.getEarnings = async (req, res) => {
    const driverId = req.user.id;
    try {
        const payments = await Payment.find({ driver_id: driverId, status: "Successful" })
            .populate("user_id", "name profilePicture")
            .populate("ride_id", "source destination timing status")
            .sort({ createdAt: -1 })
            .limit(300)
            .lean();

        const balances = summarizeDriverBalances(payments);

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        let monthly = 0;
        const rideSet = new Set();
        let passengers = 0;
        for (const p of payments) {
            if (p.escrowReleasedAt && new Date(p.escrowReleasedAt) >= monthStart) monthly += p.driverEarnings || 0;
            if (p.ride_id?._id) rideSet.add(idStr(p.ride_id._id));
            passengers += p.seats || 1;
        }

        const user = await User.findById(driverId).select("payoutDetails").lean();
        const pendingWithdrawals = await Withdrawal.find({
            driver_id: driverId,
            status: { $in: ["Requested", "Approved"] },
        }).sort({ createdAt: -1 }).lean();

        res.status(200).json({
            summary: {
                total: balances.total,            // lifetime earned (released + in escrow)
                available: balances.available,    // released, not yet withdrawn
                escrowPending: balances.escrowPending,
                disputed: balances.disputed,
                released: balances.released,
                monthly,
                rides: rideSet.size,
                passengers,
                avgPerRide: rideSet.size ? Math.round(balances.total / rideSet.size) : 0,
            },
            payoutDetails: user?.payoutDetails || {},
            pendingWithdrawals,
            payments,
        });
    } catch (error) {
        console.error("Error in getEarnings:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * GET /api/payments/:id/receipt
 * Receipt data for a single payment. Visible to the payer OR the driver.
 */
exports.getReceipt = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid payment id" });
    }
    try {
        const payment = await Payment.findById(id)
            .populate("user_id", "name email phoneNumber")
            .populate("driver_id", "name email phoneNumber")
            .populate("ride_id", "source destination timing")
            .lean();
        if (!payment) return res.status(404).json({ message: "Payment not found" });

        const isPayer = idStr(payment.user_id) === userId;
        const isDriver = idStr(payment.driver_id) === userId;
        if (!isPayer && !isDriver) {
            return res.status(403).json({ message: "Not authorized to view this receipt." });
        }
        res.status(200).json(payment);
    } catch (error) {
        console.error("Error in getReceipt:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/* =======================================================
   Escrow lifecycle
   ======================================================= */

/**
 * Internal: release a single held/awaiting payment to the driver. Idempotent
 * (a no-op if already released/refunded). Sends notifications when io/users
 * are provided. Returns the updated payment (or null if not releasable).
 *
 * @param {object} payment a Mongoose Payment document
 * @param {"passenger_confirmed"|"auto"|"admin"} type
 */
async function releaseEscrow(payment, type, { io, users } = {}) {
    if (!payment) return null;
    // Atomic, idempotent transition: only the writer that actually flips
    // held/awaiting_completion -> released proceeds. A payment that was disputed
    // or already released won't match the filter, so it can't be paid twice and
    // a dispute raised mid-sweep is never released.
    const updated = await Payment.findOneAndUpdate(
        { _id: payment._id, escrowStatus: { $in: ["held", "awaiting_completion"] } },
        { $set: { escrowStatus: "released", releaseType: type, escrowReleasedAt: new Date() } },
        { new: true }
    );
    if (!updated) return payment; // already released/refunded/disputed — no-op

    if (io) {
        await createNotification({
            io, users,
            userId: idStr(updated.driver_id),
            type: "system",
            title: "Escrow released",
            message: `₹${updated.driverEarnings} has been released to your earnings${type === "auto" ? " (auto-released)" : ""}.`,
            rideId: updated.ride_id,
            link: { tab: "earnings" },
        });
    }
    return updated;
}
// Exported so the auto-release scheduler reuses the exact same logic.
exports._releaseEscrow = releaseEscrow;

/**
 * Internal: refund a payment to the passenger. Idempotent (no-op if already
 * refunded). Calls the Razorpay refund API for REAL captured payments
 * (payment_id starts with "pay_"); seed/test/free records skip the gateway and
 * are just marked refunded locally. Always updates the local record so the app
 * state is consistent even if the gateway call fails.
 *
 * @param {object} payment a Mongoose Payment document
 * @param {object} opts { reason }
 * @returns {Promise<{payment, gatewayRefunded, gatewayError, refundId}>}
 */
async function refundPayment(payment, { reason } = {}) {
    if (!payment) return { payment: null, gatewayRefunded: false };
    if (payment.escrowStatus === "refunded" || payment.status === "Refunded") {
        return { payment, gatewayRefunded: false, skipped: true };
    }

    let gatewayRefunded = false, gatewayError = null, refundId = null;
    const rzp = getRazorpay();
    // Only hit the gateway for real captured Razorpay payments.
    if (rzp && payment.payment_id && /^pay_/.test(payment.payment_id)) {
        try {
            const refund = await rzp.payments.refund(payment.payment_id, {
                amount: Math.round((payment.amount || 0) * 100), // paise
                speed: "optimum",
                notes: { reason: String(reason || "admin_refund").slice(0, 200), order_id: payment.order_id || "" },
            });
            gatewayRefunded = true;
            refundId = refund?.id || null;
        } catch (e) {
            gatewayError = e?.error?.description || e?.message || "Razorpay refund failed";
            console.error("[refundPayment] Razorpay refund failed:", gatewayError);
        }
    }

    if (gatewayError) {
        // Gateway refund did NOT succeed — do not claim success. Freeze the
        // funds (so the auto-release sweep can't pay the driver) and surface the
        // failure for admin retry instead of silently marking it refunded.
        payment.escrowStatus = "disputed";
        payment.failureReason = `Refund failed: ${gatewayError}`.slice(0, 300);
        await payment.save();
        return { payment, gatewayRefunded: false, gatewayError, refundId };
    }

    payment.escrowStatus = "refunded";
    payment.status = "Refunded";
    await payment.save();
    return { payment, gatewayRefunded, gatewayError, refundId };
}
exports._refundPayment = refundPayment;
/**
 * Arm escrow for all of a ride's paid bookings when the ride is COMPLETED.
 * Sets escrowStatus held -> awaiting_completion and starts the 24h auto-release
 * clock. Called from the ride completion / tracking-end flow. Safe to call more
 * than once (only flips held → awaiting_completion).
 *
 * @param {string} rideId
 * @param {object} ctx { io, users }
 */
async function armEscrowForRide(rideId, { io, users } = {}) {
    const now = new Date();
    const autoReleaseAt = computeAutoReleaseAt(now);
    // Snapshot the held payments, then flip them atomically. A concurrent second
    // completion finds nothing still "held", so it won't re-notify or reset the
    // auto-release clock.
    const held = await Payment.find({
        ride_id: rideId, status: "Successful", escrowStatus: "held",
    }).select("_id user_id").lean();
    if (held.length === 0) return 0;

    await Payment.updateMany(
        { ride_id: rideId, status: "Successful", escrowStatus: "held" },
        { $set: { escrowStatus: "awaiting_completion", completedAt: now, autoReleaseAt } }
    );

    if (io) {
        for (const p of held) {
            await createNotification({
                io, users,
                userId: idStr(p.user_id),
                type: "system",
                title: "Confirm your ride",
                message: `Your ride is marked complete. Confirm to release payment, or it auto-releases in ${getAutoReleaseHours()}h.`,
                rideId,
                link: { tab: "payments" },
            });
        }
    }
    return held.length;
}
exports.armEscrowForRide = armEscrowForRide;

/**
 * POST /api/payments/:id/confirm
 * Passenger confirms the ride was completed → release escrow to the driver
 * immediately. Only the payer can confirm their own payment.
 */
exports.confirmCompletion = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const io = req.app.get("io");
    const users = req.app.get("users") || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid payment id" });
    }
    try {
        const payment = await Payment.findById(id);
        if (!payment) return res.status(404).json({ message: "Payment not found" });
        if (!canPassengerRelease(payment, userId)) {
            return res.status(403).json({ message: "You can't release this payment." });
        }
        await releaseEscrow(payment, "passenger_confirmed", { io, users });

        // Log drop-off confirmation for the verification timeline/analytics, and
        // flag the passenger's booking as drop-off-confirmed.
        try {
            const { _log } = require("./checkinController");
            await _log(payment.ride_id, "dropoff_confirmed", { actor_id: userId, passenger_id: userId });
            await Ride.updateOne(
                { _id: payment.ride_id, "passengers.user_id": userId },
                { $set: { "passengers.$.dropOffConfirmed": true } }
            );
        } catch { /* non-fatal */ }

        await createNotification({
            io, users, userId,
            type: "system",
            title: "Thanks for confirming",
            message: `Payment of ₹${payment.amount} released to your driver. Hope the ride went well!`,
            rideId: payment.ride_id,
            link: { tab: "payments" },
        });

        res.status(200).json({ message: "Payment released to driver", payment });
    } catch (error) {
        console.error("Error in confirmCompletion:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/* =======================================================
   Disputes
   ======================================================= */

/**
 * POST /api/payments/:id/dispute
 * Passenger raises a dispute → FREEZES escrow (awaiting_completion/held →
 * disputed) so it won't auto-release. Only the payer can dispute, and only
 * before the funds are released. Body: { reason, description, evidence[] }
 */
exports.raiseDispute = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { reason, description, evidence } = req.body || {};
    const io = req.app.get("io");
    const users = req.app.get("users") || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid payment id" });
    }
    const allowedReasons = ["ride_not_taken", "driver_no_show", "wrong_route", "safety_concern", "overcharged", "other"];
    if (!allowedReasons.includes(reason)) {
        return res.status(400).json({ message: "Invalid dispute reason." });
    }
    try {
        const payment = await Payment.findById(id);
        if (!payment) return res.status(404).json({ message: "Payment not found" });
        if (idStr(payment.user_id) !== userId) {
            return res.status(403).json({ message: "Not your payment." });
        }
        if (payment.status !== "Successful") {
            return res.status(400).json({ message: "Only paid bookings can be disputed." });
        }
        if (payment.escrowStatus === "released") {
            return res.status(409).json({ message: "This payment has already been released and can't be disputed." });
        }
        if (payment.escrowStatus === "refunded") {
            return res.status(409).json({ message: "This payment was already refunded." });
        }
        if (payment.escrowStatus === "disputed") {
            return res.status(409).json({ message: "A dispute is already open for this payment." });
        }

        // Freeze the escrow.
        payment.escrowStatus = "disputed";
        await payment.save();

        const dispute = await Dispute.create({
            payment_id: payment._id,
            ride_id: payment.ride_id,
            raisedBy: userId,
            against: payment.driver_id,
            reason,
            description: (description || "").slice(0, 1000),
            evidence: Array.isArray(evidence) ? evidence.slice(0, 5) : [],
            status: "open",
        });

        // Bump the passenger's dispute counter (total).
        await User.updateOne({ _id: userId }, { $inc: { "disputeStats.total": 1 } });

        // Notify the driver their payout is on hold.
        await createNotification({
            io, users,
            userId: idStr(payment.driver_id),
            type: "system",
            title: "Payment disputed",
            message: `A booking payment of ₹${payment.driverEarnings} is on hold pending review.`,
            rideId: payment.ride_id,
            link: { tab: "earnings" },
        });
        await createNotification({
            io, users, userId,
            type: "system",
            title: "Dispute submitted",
            message: "We've received your dispute. The payment is frozen pending review.",
            rideId: payment.ride_id,
            link: { tab: "payments" },
        });

        res.status(201).json({ message: "Dispute raised", dispute, payment });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "A dispute already exists for this payment." });
        }
        console.error("Error in raiseDispute:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * GET /api/payments/disputes
 * The logged-in user's disputes (as the one who raised them), newest first.
 */
exports.getMyDisputes = async (req, res) => {
    const userId = req.user.id;
    try {
        const disputes = await Dispute.find({ raisedBy: userId })
            .populate("against", "name profilePicture")
            .populate("ride_id", "source destination timing")
            .sort({ createdAt: -1 })
            .lean();
        res.status(200).json(disputes);
    } catch (error) {
        console.error("Error in getMyDisputes:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/* =======================================================
   Withdrawals (driver payouts)
   ======================================================= */

/**
 * PUT /api/payments/payout-details
 * Save/update the driver's payout destination (UPI for MVP; bank future-ready).
 * Body: { upiId, bankAccountName, bankAccountNumber, bankIfsc }
 */
exports.updatePayoutDetails = async (req, res) => {
    const userId = req.user.id;
    const { upiId, bankAccountName, bankAccountNumber, bankIfsc } = req.body || {};
    try {
        const updates = {};
        if (upiId !== undefined) {
            // Light UPI sanity check (e.g. name@bank). Empty clears it.
            if (upiId && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upiId)) {
                return res.status(400).json({ message: "Enter a valid UPI ID (e.g. name@bank)." });
            }
            updates["payoutDetails.upiId"] = upiId;
        }
        if (bankAccountName !== undefined) updates["payoutDetails.bankAccountName"] = bankAccountName;
        if (bankAccountNumber !== undefined) updates["payoutDetails.bankAccountNumber"] = bankAccountNumber;
        if (bankIfsc !== undefined) updates["payoutDetails.bankIfsc"] = bankIfsc;

        const user = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true })
            .select("payoutDetails").lean();
        res.status(200).json({ message: "Payout details saved", payoutDetails: user.payoutDetails });
    } catch (error) {
        console.error("Error in updatePayoutDetails:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * POST /api/payments/withdraw
 * Driver requests a withdrawal of their AVAILABLE (released, not-yet-withdrawn)
 * balance. Requires a saved UPI id. Attaches the released payments funding it
 * and marks them as withdrawn. Admin approval processes the actual payout.
 * Body: { amount? }  (defaults to full available balance)
 */
exports.requestWithdrawal = async (req, res) => {
    const driverId = req.user.id;
    const io = req.app.get("io");
    const users = req.app.get("users") || {};
    try {
        const user = await User.findById(driverId).select("payoutDetails").lean();
        const upiId = user?.payoutDetails?.upiId;
        if (!upiId) {
            return res.status(400).json({ message: "Add a UPI ID in payout details first." });
        }

        // Atomically CLAIM released, not-yet-withdrawn payments for this
        // withdrawal first (assign a withdrawal id), so two concurrent requests
        // can't fund two withdrawals from the same money (TOCTOU).
        const withdrawalId = new mongoose.Types.ObjectId();
        await Payment.updateMany(
            { driver_id: driverId, status: "Successful", escrowStatus: "released", withdrawal_id: null },
            { $set: { withdrawal_id: withdrawalId } }
        );
        const claimed = await Payment.find({ withdrawal_id: withdrawalId });
        const available = claimed.reduce((s, p) => s + (p.driverEarnings || 0), 0);
        if (available <= 0) {
            // Nothing actually claimed — release any (zero-value) holds back.
            if (claimed.length) {
                await Payment.updateMany({ withdrawal_id: withdrawalId }, { $set: { withdrawal_id: null } });
            }
            return res.status(400).json({ message: "No funds available to withdraw yet." });
        }

        const withdrawal = await Withdrawal.create({
            _id: withdrawalId,
            driver_id: driverId,
            amount: available,
            method: "upi",
            upiId,
            status: "Requested",
            payment_ids: claimed.map((p) => p._id),
        });

        await createNotification({
            io, users,
            userId: driverId,
            type: "system",
            title: "Withdrawal requested",
            message: `Your withdrawal of ₹${available} to ${upiId} is pending approval.`,
            link: { tab: "earnings" },
        });

        res.status(201).json({ message: "Withdrawal requested", withdrawal });
    } catch (error) {
        console.error("Error in requestWithdrawal:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * GET /api/payments/withdrawals
 * The logged-in driver's withdrawal requests, newest first.
 */
exports.getMyWithdrawals = async (req, res) => {
    const driverId = req.user.id;
    try {
        const withdrawals = await Withdrawal.find({ driver_id: driverId })
            .sort({ createdAt: -1 })
            .lean();
        res.status(200).json(withdrawals);
    } catch (error) {
        console.error("Error in getMyWithdrawals:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
