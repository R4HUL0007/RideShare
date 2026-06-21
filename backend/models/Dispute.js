const mongoose = require("mongoose");

// A passenger-raised dispute against a payment/ride. Filing a dispute FREEZES
// the linked payment's escrow (escrowStatus -> "disputed") so the auto-release
// sweep skips it. An admin later resolves it to either release funds to the
// driver or refund the passenger. Evidence upload is future-ready (URLs only).
//
// `outcome` records whether the dispute was upheld (refund) or rejected (false
// dispute → counts against the passenger's dispute stats).
const DisputeSchema = new mongoose.Schema(
    {
        payment_id: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true },
        ride_id: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", required: true },
        // Who raised it (passenger) and who it's against (driver).
        raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        against: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

        reason: {
            type: String,
            enum: ["ride_not_taken", "driver_no_show", "wrong_route", "safety_concern", "overcharged", "other"],
            required: true,
        },
        description: { type: String, default: "", maxlength: 1000 },
        // Future-ready: hosted evidence URLs (e.g. Cloudinary).
        evidence: [{ type: String }],

        status: {
            type: String,
            enum: ["open", "under_review", "resolved"],
            default: "open",
            index: true,
        },
        // Set when resolved. "released" = dispute rejected, driver paid;
        // "refunded" = dispute upheld, passenger refunded.
        outcome: { type: String, enum: [null, "released", "refunded"], default: null },
        resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        resolutionNote: { type: String, default: "" },
        resolvedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

// One dispute per payment.
DisputeSchema.index({ payment_id: 1 }, { unique: true });

module.exports = mongoose.model("Dispute", DisputeSchema);
