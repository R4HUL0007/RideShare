const mongoose = require("mongoose");

const RideSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    role: {
        type: String,
        enum: ["Student", "Faculty"],
        required: true
    },
    gender_preference: {
        type: String,
        enum: ["Male", "Female", "Any"], // Fixed inconsistency (capitalized "Any")
        required: true
    },
    source: {
        type: String,
        required: true
    },
    destination: {
        type: String,
        required: true
    },
    timing: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ["Available", "Booked", "Completed", "Cancelled"],
        default: "Available"
    },
    // Set when a driver cancels their ride (soft-cancel; the ride is retained
    // for the driver's records instead of being deleted).
    cancelledAt: {
        type: Date,
        default: null
    },
    seatsAvailable: {
        type: Number,
        required: true,
        default: 1  // Default seat count per ride
    },
    passengers: [{
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        // Number of seats this passenger booked. Defaults to 1 so existing
        // bookings (created before multi-seat support) read back as 1 seat.
        seats: {
            type: Number,
            default: 1,
            min: 1
        },
        bookedAt: {
            type: Date,
            default: Date.now
        },
        // -------- Ride Check-In & Verification --------
        // A unique 4-digit code the passenger shows the driver before boarding.
        // The driver enters it to verify the passenger actually boarded. Codes
        // are generated lazily (on first check-in / verification request) so
        // existing bookings remain valid.
        verificationCode: { type: String, default: "" },
        // Passenger tapped "Check In" once the driver arrived at the pickup.
        checkedIn: { type: Boolean, default: false },
        checkedInAt: { type: Date, default: null },
        // Driver confirmed the passenger's code → boarding verified.
        boardingVerified: { type: Boolean, default: false },
        verifiedAt: { type: Date, default: null },
        // OTP security: expiry timestamp for the current code and a failed-attempt
        // counter (resets when a new code is issued / resent). Powers the premium
        // OTP verification flow (expiring codes + max attempts + resend).
        otpExpiresAt: { type: Date, default: null },
        otpAttempts: { type: Number, default: 0 },
        // No-show flags (set via the no-show reporting endpoints).
        noShow: { type: Boolean, default: false },
        // Passenger confirmed drop-off at completion (mirrors escrow confirm).
        dropOffConfirmed: { type: Boolean, default: false },
        // -------- Unified pay-after-completion pricing --------
        // The fare for THIS passenger's segment, locked at booking time (no charge
        // taken then). Payment is collected AFTER the ride is completed, the same
        // as the personalized-ride flow. `dropCoords` is the passenger's drop-off
        // (their searched destination) used to compute the distance-based fare.
        fareAmount: { type: Number, default: null },
        dropCoords: {
            lat: { type: Number, default: null },
            lng: { type: Number, default: null },
        },
        // Per-passenger payment state for the post-completion charge:
        //   unpaid  → booked, not yet paid (ride may be upcoming or completed)
        //   paid    → paid after completion; a Payment doc holds the escrow
        paymentStatus: { type: String, enum: ["unpaid", "paid"], default: "unpaid" },
        // How this passenger settled: online (Razorpay/escrow) or cash (in person).
        paymentMethod: { type: String, enum: [null, "online", "cash"], default: null },
        payment_id: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null }
    }],
    vehicle_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vehicle"
    },
    pickupLocation: {
        type: String
    },
    pricePerPerson: {
        type: Number,
        min: 0
    },
    sourceCoords: {
        lat: {
            type: Number,
            default: null
        },
        lng: {
            type: Number,
            default: null
        }
    },
    destinationCoords: {
        lat: {
            type: Number,
            default: null
        },
        lng: {
            type: Number,
            default: null
        }
    },
    // Stored Google Maps route data (for Smart Route Matching). The polyline is
    // the encoded route string; distance/duration come from the Directions API.
    // Optional — legacy rides without it fall back to a straight-line approx.
    route: {
        polyline: { type: String, default: "" },
        distanceKm: { type: Number, default: null },
        durationMin: { type: Number, default: null },
    },
    // Live ride tracking. `state` drives the Uber/Ola-style status flow.
    // driverLocation holds the latest shared driver position.
    tracking: {
        state: {
            type: String,
            enum: ["scheduled", "enroute", "arriving", "arrived", "in_progress", "completed"],
            default: "scheduled"
        },
        driverLocation: {
            lat: { type: Number, default: null },
            lng: { type: Number, default: null },
            updatedAt: { type: Date, default: null }
        },
        startedAt: { type: Date, default: null },
        endedAt: { type: Date, default: null },
        // -------- Production lifecycle (GPS-validated completion) --------
        // Cumulative GPS distance travelled during the trip (km).
        distanceKm: { type: Number, default: 0 },
        // Driver location captured at ride start / completion (admin audit).
        startLocation: { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
        endLocation: { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
        // Destination proximity: set true once the driver enters the dest radius;
        // arrivedAtDestAt drives the auto-complete dwell timer.
        atDestination: { type: Boolean, default: false },
        arrivedAtDestAt: { type: Date, default: null },
        // Route deviation monitoring.
        deviationFlagged: { type: Boolean, default: false },
        lastDeviationAt: { type: Date, default: null },
        // How the ride was completed (admin log).
        completionMethod: {
            type: String,
            enum: [null, "AUTO_GPS", "DRIVER_MANUAL", "PASSENGER_CONFIRMATION"],
            default: null
        }
    },
    // Ride-level boarding-verification throttle. A wrong code can't be tied to a
    // single passenger, so failed driver verify attempts are counted here and the
    // verify endpoint locks briefly after too many — the brute-force guard the
    // per-passenger counter could not enforce.
    boardingVerifyAttempts: { type: Number, default: 0 },
    boardingVerifyLockUntil: { type: Date, default: null }
}, { timestamps: true });

// Geospatial pre-filter index for Smart Route Matching — bounds candidate
// rides by source proximity efficiently (bounding-box query on lat/lng).
RideSchema.index({ "sourceCoords.lat": 1, "sourceCoords.lng": 1 });
RideSchema.index({ role: 1, status: 1 });
// "My Rides" (driver) — was a full collection scan without this.
RideSchema.index({ user_id: 1, status: 1, createdAt: -1 });
// "My Bookings" / ride history — passenger lookups into the embedded array.
RideSchema.index({ "passengers.user_id": 1 });

module.exports = mongoose.model("Ride", RideSchema);
