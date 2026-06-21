const mongoose = require("mongoose");

// =======================================================
// Ride Request Broadcast — a passenger's open request for a ride when no
// suitable rides were found. Broadcast to nearby online verified drivers, who
// can express interest and create a matching ride. Purely additive — does not
// touch the existing Ride / Booking / Payment / Chat models.
// =======================================================
const RideRequestSchema = new mongoose.Schema(
    {
        passenger_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        passengerName: { type: String, default: "" },

        source: { type: String, required: true },
        destination: { type: String, required: true },
        sourceCoords: { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
        destinationCoords: { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
        departureTime: { type: Date, default: null },
        // Chosen vehicle class + the fare the passenger was quoted (our pricing).
        vehicleType: { type: String, enum: ["Car", "Motorcycle", "Auto-rickshaw"], default: "Car" },
        estimatedFare: { type: Number, default: 0 },

        status: {
            type: String,
            enum: ["pending", "accepted", "expired", "cancelled"],
            default: "pending",
            index: true,
        },

        // Drivers who expressed interest (clicked Accept).
        interestedDrivers: [{
            driver_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            name: { type: String, default: "" },
            at: { type: Date, default: Date.now },
        }],
        // The first driver to accept (for quick reference).
        acceptedBy: {
            driver_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
            name: { type: String, default: "" },
            at: { type: Date, default: null },
        },
        // The ride a driver created in response (if linked).
        createdRide_id: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", default: null },

        // Drivers that were notified at broadcast time (audit / dedupe).
        notifiedDriverIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        radiusKm: { type: Number, default: 10 },
        expiresAt: { type: Date, default: null, index: true },
    },
    { timestamps: true }
);

RideRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("RideRequest", RideRequestSchema);
