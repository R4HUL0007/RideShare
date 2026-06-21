const mongoose = require("mongoose");

// A driver's request to withdraw their AVAILABLE (released) balance. For the
// MVP a UPI id is sufficient; bank details are future-ready. Payouts are
// admin-approved (manual for now) — the architecture is ready for automated
// payouts (Razorpay Route / RazorpayX) later without schema changes.
const WithdrawalSchema = new mongoose.Schema(
    {
        driver_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        amount: { type: Number, required: true, min: 1 },

        // Snapshot of payout destination at request time.
        method: { type: String, enum: ["upi", "bank"], default: "upi" },
        upiId: { type: String, default: "" },
        bankDetails: {
            accountName: { type: String, default: "" },
            accountNumber: { type: String, default: "" },
            ifsc: { type: String, default: "" },
        },

        status: {
            type: String,
            enum: ["Requested", "Approved", "Processed", "Rejected"],
            default: "Requested",
            index: true,
        },
        // The released payments this withdrawal draws from (for reconciliation).
        payment_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: "Payment" }],

        adminNote: { type: String, default: "" },
        processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        processedAt: { type: Date, default: null },
        // Future-ready: provider payout reference (e.g. RazorpayX payout id).
        payoutRef: { type: String, default: "" },
    },
    { timestamps: true }
);

WithdrawalSchema.index({ driver_id: 1, createdAt: -1 });

module.exports = mongoose.model("Withdrawal", WithdrawalSchema);
