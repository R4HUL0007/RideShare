const mongoose = require("mongoose");

// =======================================================
// Settlement — a weekly payout batch for one driver. Aggregates the driver's
// `pending` ledger entries for the period, attempts a Razorpay payout to their
// UPI, and records the outcome. Failed payouts are retried by a background job.
// =======================================================
const SettlementSchema = new mongoose.Schema(
    {
        driver_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        batchId: { type: String, required: true, index: true }, // e.g. "WK-2026-06-20"
        periodStart: { type: Date, required: true },
        periodEnd: { type: Date, required: true },

        rideCount: { type: Number, default: 0 },
        totalGross: { type: Number, default: 0 },
        totalCommission: { type: Number, default: 0 },
        totalNet: { type: Number, default: 0 },   // amount paid out to the driver
        ledgerEntryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "DriverLedger" }],

        upiId: { type: String, default: "" },
        status: {
            type: String,
            enum: ["pending", "processing", "settled", "failed"],
            default: "pending",
            index: true,
        },
        payoutRef: { type: String, default: "" },      // Razorpay payout id
        failureReason: { type: String, default: "" },
        retries: { type: Number, default: 0 },
        processedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

SettlementSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Settlement", SettlementSchema);
