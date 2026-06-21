const mongoose = require("mongoose");

// =======================================================
// Driver Ledger — Uber-style earnings ledger (NOT per-ride withdrawals). Each
// completed + paid Personalized Ride creates one entry. The weekly settlement
// engine aggregates `pending` entries per driver into a Settlement and marks
// them `settled` once the payout succeeds.
// =======================================================
const DriverLedgerSchema = new mongoose.Schema(
    {
        driver_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        ride_id: { type: mongoose.Schema.Types.ObjectId, ref: "PersonalRideRequest", required: true, unique: true },

        grossAmount: { type: Number, required: true, min: 0 },   // fare passenger paid
        commission: { type: Number, default: 0, min: 0 },        // platform cut
        netEarnings: { type: Number, required: true, min: 0 },   // driver take-home

        status: {
            type: String,
            enum: ["pending", "processing", "settled", "failed"],
            default: "pending",
            index: true,
        },
        settlement_id: { type: mongoose.Schema.Types.ObjectId, ref: "Settlement", default: null, index: true },
    },
    { timestamps: true }
);

DriverLedgerSchema.index({ driver_id: 1, status: 1 });

module.exports = mongoose.model("DriverLedger", DriverLedgerSchema);
