const mongoose = require("mongoose");

// A triggered SOS emergency alert. Captures a snapshot of the situation at the
// moment of activation (location, ride, driver, vehicle) so responders and
// admins have full context even if the ride state changes later.
const SosEventSchema = new mongoose.Schema(
    {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        ride_id: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", default: null, index: true },

        // Snapshot at trigger time.
        location: {
            lat: { type: Number, default: null },
            lng: { type: Number, default: null },
            address: { type: String, default: "" },
        },
        rideSnapshot: {
            source: { type: String, default: "" },
            destination: { type: String, default: "" },
            driverName: { type: String, default: "" },
            driverPhone: { type: String, default: "" },
            vehicle: { type: String, default: "" },
            licensePlate: { type: String, default: "" },
        },
        trackingLink: { type: String, default: "" },

        // Who got notified (for the audit trail / responder confirmation).
        notifiedContacts: [{
            name: String,
            phoneNumber: String,
            relationship: String,
        }],

        status: {
            type: String,
            enum: ["active", "acknowledged", "resolved", "false_alarm"],
            default: "active",
            index: true,
        },
        resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        resolvedAt: { type: Date, default: null },
        adminNotes: { type: String, default: "" },
    },
    { timestamps: true }
);

SosEventSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("SosEvent", SosEventSchema);
