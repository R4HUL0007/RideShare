const mongoose = require("mongoose");

// =======================================================
// Personalized Ride Request — an Uber/Ola-style on-demand ride that lives
// entirely on its own (separate from the shared-ride Create/Find/Book/Escrow
// flow). One document carries the full lifecycle: SEARCHING → DRIVER_ASSIGNED
// → RIDE_STARTED → RIDE_COMPLETED → PAYMENT_RECEIVED (or CANCELLED/EXPIRED).
// =======================================================

const PlaceSchema = new mongoose.Schema(
    {
        address: { type: String, default: "" },
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
    },
    { _id: false }
);

const PersonalRideRequestSchema = new mongoose.Schema(
    {
        passenger_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        passengerName: { type: String, default: "" },

        pickup: { type: PlaceSchema, required: true },
        destination: { type: PlaceSchema, required: true },
        distanceKm: { type: Number, default: 0 },
        durationMin: { type: Number, default: 0 },
        vehicleType: { type: String, enum: ["Bike", "Auto", "Car"], default: "Car" },
        notes: { type: String, default: "", maxlength: 300 },

        estimatedFare: { type: Number, default: 0 },
        finalFare: { type: Number, default: 0 },

        status: {
            type: String,
            enum: [
                "SEARCHING", "DRIVER_ASSIGNED", "RIDE_STARTED",
                "RIDE_COMPLETED", "PAYMENT_RECEIVED",
                "CANCELLED", "EXPIRED", "NO_DRIVERS",
            ],
            default: "SEARCHING",
            index: true,
        },

        // Driver matching.
        driver_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
        driverName: { type: String, default: "" },
        vehicle_id: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null },
        notifiedDriverIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        interestedDrivers: [{
            driver_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            name: { type: String, default: "" },
            at: { type: Date, default: Date.now },
        }],
        declinedDriverIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        radiusKm: { type: Number, default: 10 },

        // Boarding OTP (start-of-ride verification).
        otp: {
            code: { type: String, default: "" },
            expiresAt: { type: Date, default: null },
            attempts: { type: Number, default: 0 },
            verifiedAt: { type: Date, default: null },
        },

        // Lifecycle timestamps.
        assignedAt: { type: Date, default: null },
        reachedPickupAt: { type: Date, default: null },
        startedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },

        // Live tracking (driver's latest shared position).
        tracking: {
            state: { type: String, enum: ["idle", "enroute_pickup", "arrived", "in_progress", "completed"], default: "idle" },
            driverLocation: { lat: { type: Number, default: null }, lng: { type: Number, default: null }, updatedAt: { type: Date, default: null } },
            // Cumulative GPS distance travelled during the trip (km) — used to
            // bill the actual route rather than the straight-line estimate.
            distanceKm: { type: Number, default: 0 },
            // GPS-validated completion (parity with shared rides).
            startLocation: { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
            endLocation: { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
            atDestination: { type: Boolean, default: false },
            arrivedAtDestAt: { type: Date, default: null },
        },

        // How the ride was completed: AUTO_GPS | DRIVER_MANUAL | PASSENGER_CONFIRMATION.
        completionMethod: {
            type: String,
            enum: [null, "AUTO_GPS", "DRIVER_MANUAL", "PASSENGER_CONFIRMATION"],
            default: null,
        },

        // Payment (UPI to RidexShare — passenger never pays the driver directly).
        payment: {
            method: { type: String, default: "upi" },
            status: { type: String, enum: ["pending", "received", "failed"], default: "pending" },
            razorpayOrderId: { type: String, default: "" },
            razorpayPaymentId: { type: String, default: "" },
            paidAt: { type: Date, default: null },
        },

        // Earnings split (computed at completion; mirrored into DriverLedger).
        commission: { type: Number, default: 0 },
        driverEarnings: { type: Number, default: 0 },
        ledger_id: { type: mongoose.Schema.Types.ObjectId, ref: "DriverLedger", default: null },

        cancelledBy: { type: String, enum: [null, "passenger", "driver", "admin", "system"], default: null },
        cancelReason: { type: String, default: "" },
        expiresAt: { type: Date, default: null, index: true },
    },
    { timestamps: true }
);

PersonalRideRequestSchema.index({ status: 1, createdAt: -1 });
PersonalRideRequestSchema.index({ driver_id: 1, status: 1 });

module.exports = mongoose.model("PersonalRideRequest", PersonalRideRequestSchema);
