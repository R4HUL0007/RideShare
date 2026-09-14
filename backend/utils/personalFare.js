// =======================================================
// Personalized Ride — fare + commission helpers. Server-authoritative pricing
// (the client estimate must match, but the server recomputes on completion).
// =======================================================

// Per-vehicle distance pricing. Matches the passenger-facing estimate.
const VEHICLE_PRICING = {
    Bike: { base: 15, perKm: 7, min: 20, eta: "2-4 min" },
    Auto: { base: 25, perKm: 11, min: 30, eta: "3-6 min" },
    Car: { base: 40, perKm: 15, min: 50, eta: "4-8 min" },
};

const VEHICLE_TYPES = Object.keys(VEHICLE_PRICING);

// Compute a fare (rounded ₹) for a vehicle type over a distance in km.
function computeFare(vehicleType, distanceKm) {
    const p = VEHICLE_PRICING[vehicleType] || VEHICLE_PRICING.Car;
    const km = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;
    return Math.max(p.min, Math.round(p.base + p.perKm * km));
}

// Estimated trip duration in minutes from distance (assumes ~25 km/h city avg).
function computeDurationMin(distanceKm) {
    const km = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;
    return Math.max(2, Math.round((km / 25) * 60));
}

// Platform commission percent (reuses the shared env var; defaults 10%).
function getCommissionPercent() {
    const n = Number(process.env.PLATFORM_COMMISSION_PERCENT);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 10;
}

// Split a fare into { commission, netEarnings } using the configured percent.
function splitFare(fare) {
    const amount = Number(fare) || 0;
    const commission = Math.round((amount * getCommissionPercent()) / 100);
    return { commission, netEarnings: Math.max(0, amount - commission) };
}

// Configurable matching/expiry knobs.
const config = {
    radiusKm: () => Number(process.env.PERSONAL_RIDE_RADIUS_KM) || 10,
    requestExpiryMin: () => Number(process.env.PERSONAL_RIDE_EXPIRY_MIN) || 5,
    otpExpiryMin: () => Number(process.env.PERSONAL_RIDE_OTP_EXPIRY_MIN) || 10,
    // How long a passenger/driver may still cancel an already-assigned or
    // already-started ride before it's considered "too far along" to bail on
    // (protects the other side's committed time once things are underway).
    cancelWindowMin: () => Number(process.env.PERSONAL_RIDE_CANCEL_WINDOW_MIN) || 10,
    // Safety-net cleanup thresholds — closes rides abandoned mid-flow (e.g. a
    // driver's app crashed) so they don't sit as "active" forever. See
    // jobs/personalRideJobs.js:runStaleActiveSweep.
    maxAssignedMin: () => Number(process.env.PERSONAL_RIDE_MAX_ASSIGNED_MIN) || 60,
    maxTripHours: () => Number(process.env.PERSONAL_RIDE_MAX_TRIP_HOURS) || 6,
};

module.exports = { VEHICLE_PRICING, VEHICLE_TYPES, computeFare, computeDurationMin, getCommissionPercent, splitFare, config };
