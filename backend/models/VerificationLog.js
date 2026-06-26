const mongoose = require("mongoose");

// Append-only audit/analytics log for the Ride Check-In & Verification system.
// One document per event. Powers the admin verification timeline and analytics
// (check-in success rate, no-show rate, verification failures, confirmations).
const VerificationLogSchema = new mongoose.Schema(
    {
        ride_id: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", required: true, index: true },
        actor_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        passenger_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        event: {
            type: String,
            enum: [
                "code_generated", "checked_in", "boarding_verified", "verification_failed",
                "ride_started", "ride_completed", "dropoff_confirmed",
                "passenger_no_show", "driver_no_show", "issue_reported",
                "route_deviation",
            ],
            required: true,
            index: true,
        },
        details: { type: Object, default: {} },
    },
    { timestamps: true }
);

VerificationLogSchema.index({ createdAt: -1 });
VerificationLogSchema.index({ ride_id: 1, createdAt: 1 });

module.exports = mongoose.model("VerificationLog", VerificationLogSchema);
