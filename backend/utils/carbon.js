// =======================================================
// Carbon / Sustainability calculation engine (pure, CommonJS)
// -------------------------------------------------------
// Estimates the environmental impact of shared rides. The core idea: when N
// passengers share one vehicle instead of each driving their own, the trip's
// emissions are split, avoiding (N) would-be solo trips' worth of emissions.
//
// All factors are configurable via env so the model can evolve (EVs, vehicle-
// specific factors, regional grids) without touching callers. Pure functions —
// unit testable, no DB.
// =======================================================

// ---- Emission / fuel factors (sensible India-centric defaults) ----
const F = {
    // grams of CO2 per km for an average petrol car (well-to-wheel ~ tailpipe).
    co2PerKm: { Car: 170, Motorcycle: 90, Scooter: 75, "Auto-rickshaw": 110, default: 170 },
    // litres of fuel per km (avg consumption).
    fuelPerKm: { Car: 0.075, Motorcycle: 0.025, Scooter: 0.022, "Auto-rickshaw": 0.04, default: 0.075 },
    // A mature tree absorbs ~21 kg CO2 per year.
    co2PerTreeYear: Number(process.env.CARBON_CO2_PER_TREE_KG ?? 21),
    // Fuel price (INR/L) for an indicative money-saved estimate.
    fuelPriceInr: Number(process.env.CARBON_FUEL_PRICE_INR ?? 100),
};

const co2Factor = (type) => F.co2PerKm[type] || F.co2PerKm.default;
const fuelFactor = (type) => F.fuelPerKm[type] || F.fuelPerKm.default;

/**
 * Impact of a single completed shared ride.
 *
 * Logic: a shared ride carries `passengers` people in one vehicle. Without
 * ride-sharing, those passengers would (approximately) have taken their own
 * vehicles — so the AVOIDED trips ≈ passengers (the driver was travelling
 * anyway). Avoided emissions = passengers × distance × factor.
 *
 * @param {object} ride { distanceKm, vehicleType, passengers }
 * @returns {{ co2SavedKg, fuelSavedL, sharedDistanceKm, passengers, treeEquivalent, moneySavedInr }}
 */
function rideImpact({ distanceKm, vehicleType, passengers }) {
    const dist = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;
    const pax = Number.isFinite(passengers) && passengers > 0 ? passengers : 0;
    const co2g = pax * dist * co2Factor(vehicleType);
    const fuelL = pax * dist * fuelFactor(vehicleType);
    const co2Kg = co2g / 1000;
    return {
        co2SavedKg: round(co2Kg, 2),
        fuelSavedL: round(fuelL, 2),
        sharedDistanceKm: round(pax * dist, 1),
        passengers: pax,
        treeEquivalent: round(co2Kg / F.co2PerTreeYear, 2),
        moneySavedInr: Math.round(fuelL * F.fuelPriceInr),
    };
}

/**
 * Aggregate impact across many rides. Each ride contributes its `rideImpact`.
 * @param {Array} rides items with { distanceKm, vehicleType, passengers }
 */
function aggregateImpact(rides) {
    const total = { co2SavedKg: 0, fuelSavedL: 0, sharedDistanceKm: 0, passengers: 0, sharedTrips: 0, moneySavedInr: 0 };
    for (const r of rides || []) {
        const i = rideImpact(r);
        total.co2SavedKg += i.co2SavedKg;
        total.fuelSavedL += i.fuelSavedL;
        total.sharedDistanceKm += i.sharedDistanceKm;
        total.passengers += i.passengers;
        total.moneySavedInr += i.moneySavedInr;
        if (i.passengers > 0) total.sharedTrips += 1;
    }
    total.co2SavedKg = round(total.co2SavedKg, 2);
    total.fuelSavedL = round(total.fuelSavedL, 2);
    total.sharedDistanceKm = round(total.sharedDistanceKm, 1);
    total.treeEquivalent = round(total.co2SavedKg / F.co2PerTreeYear, 2);
    return total;
}

/**
 * A friendly insight line based on totals.
 */
function insight(total) {
    if (!total || total.co2SavedKg <= 0) {
        return "Share or join rides to start reducing CO₂ emissions together.";
    }
    const trees = Math.max(1, Math.round(total.treeEquivalent));
    return `By sharing rides you've helped avoid about ${total.co2SavedKg} kg of CO₂ — equivalent to what ${trees} tree${trees > 1 ? "s" : ""} absorb in a year.`;
}

function round(n, d = 2) {
    const f = 10 ** d;
    return Math.round((Number(n) || 0) * f) / f;
}

module.exports = { rideImpact, aggregateImpact, insight, co2Factor, fuelFactor, FACTORS: F };
