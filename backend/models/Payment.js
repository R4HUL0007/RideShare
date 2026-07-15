const mongoose = require("mongoose");

// A payment record for a ride booking. One payment maps to one (ride, payer,
// driver) booking attempt. The Razorpay order is created up front (status
// "Pending") and only flipped to "Successful" after the signature is verified
// server-side — the booking is confirmed in that same verified step.
//
// `amountBreakdown` keeps the fare / platform fee / tax split so receipts and a
// future commission payout can be reconstructed without recomputation. Amounts
// are stored in rupees (not paise) for display; Razorpay amounts (paise) are
// derived when talking to the API.
const PaymentSchema = new mongoose.Schema(
    {
        // Who paid (passenger) and who earns (driver).
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        driver_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        ride_id: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", required: true, index: true },

        // Seats this payment covers — used to confirm the booking on success.
        seats: { type: Number, required: true, min: 1, default: 1 },

        // Razorpay identifiers. order_id is set at creation; payment_id +
        // signature are filled in on verification.
        order_id: { type: String, required: true, unique: true },
        payment_id: { type: String, default: null },
        signature: { type: String, default: null },

        // Money (in INR rupees).
        amount: { type: Number, required: true, min: 0 }, // total charged to passenger
        currency: { type: String, default: "INR" },
        amountBreakdown: {
            fare: { type: Number, default: 0 },        // base ride fare (driver-facing)
            platformFee: { type: Number, default: 0 }, // platform commission
            tax: { type: Number, default: 0 },         // future-ready, defaults 0
        },
        // Net amount the driver earns from this payment (fare - platformFee).
        driverEarnings: { type: Number, default: 0 },

        // How the passenger paid. "online" = Razorpay (escrow-protected payout).
        // "cash" = settled in person with the driver; recorded for history but
        // kept OUT of the withdrawable escrow balance (escrowStatus stays "none")
        // so the driver is never paid twice for money they already collected.
        method: {
            type: String,
            enum: ["online", "cash"],
            default: "online",
            index: true,
        },

        status: {
            type: String,
            // Tracks the Razorpay PAYMENT lifecycle (did the passenger pay?).
            // Refunded / "Partial Refund" reserved for future use.
            enum: ["Pending", "Successful", "Failed", "Cancelled", "Refunded", "Partial Refund"],
            default: "Pending",
            index: true,
        },
        // Optional human-readable failure reason for the failure screen.
        failureReason: { type: String, default: "" },

        // -------- Escrow (payout custody) --------
        // A SEPARATE dimension from `status`. The passenger's money is held by
        // the platform until release. Lifecycle:
        //   none -> held (on verified payment)
        //        -> awaiting_completion (ride completed; 24h auto-release armed)
        //        -> released (passenger confirmed OR auto-release OR admin)
        //        -> disputed (frozen, admin reviews) -> released | refunded
        //        -> refunded (ride fell through / dispute upheld)
        escrowStatus: {
            type: String,
            enum: ["none", "held", "awaiting_completion", "released", "disputed", "refunded"],
            default: "none",
            index: true,
        },
        // When the ride was completed and the auto-release clock started.
        completedAt: { type: Date, default: null },
        // After this instant, passenger silence auto-releases funds to the driver.
        autoReleaseAt: { type: Date, default: null, index: true },
        escrowReleasedAt: { type: Date, default: null },
        // How the escrow was released: who/what triggered it.
        releaseType: {
            type: String,
            enum: [null, "passenger_confirmed", "auto", "admin"],
            default: null,
        },
        // Set once the released earnings have been paid out via a withdrawal.
        withdrawal_id: { type: mongoose.Schema.Types.ObjectId, ref: "Withdrawal", default: null },

        // Denormalized route snapshot so history/receipts survive ride edits.
        routeSnapshot: {
            source: { type: String, default: "" },
            destination: { type: String, default: "" },
            timing: { type: Date, default: null },
        },

        paidAt: { type: Date, default: null },
    },
    { timestamps: true }
);

// Fast "my payments" / "my earnings" lookups, newest first.
PaymentSchema.index({ user_id: 1, createdAt: -1 });
PaymentSchema.index({ driver_id: 1, status: 1, createdAt: -1 });
// Driver earnings buckets + the auto-release sweep.
PaymentSchema.index({ driver_id: 1, escrowStatus: 1 });
PaymentSchema.index({ escrowStatus: 1, autoReleaseAt: 1 });

module.exports = mongoose.model("Payment", PaymentSchema);
