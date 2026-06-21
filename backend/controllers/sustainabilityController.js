// =======================================================
// Sustainability / Carbon Footprint Controller
// -------------------------------------------------------
// Derives environmental impact from COMPLETED ride history (read-only — no new
// writes, integrates cleanly with existing data). Uses stored route distance
// when available, else a haversine estimate from coords. All user endpoints are
// hard-scoped to req.user.
// =======================================================

const mongoose = require("mongoose");
const Ride = require("../models/Ride");
const { rideImpact, aggregateImpact, insight } = require("../utils/carbon");
const { haversineKm } = require("../utils/geo");

const idStr = (v) => (v == null ? null : typeof v === "string" ? v : v._id ? v._id.toString() : v.toString());

// Best distance for a ride: stored route distance → haversine from coords → 0.
function rideDistanceKm(ride) {
    if (Number.isFinite(ride.route?.distanceKm) && ride.route.distanceKm > 0) return ride.route.distanceKm;
    const d = haversineKm(ride.sourceCoords, ride.destinationCoords);
    return Number.isFinite(d) && d > 0 ? d : 0;
}
const vType = (ride) => ride.vehicle_id?.vehicleType || "Car";
const completedAt = (ride) => ride.tracking?.endedAt || ride.updatedAt || ride.timing;

// Map a passenger count for the driver view (multi-seat aware).
function paxCount(ride) {
    return (ride.passengers || []).reduce((s, p) => s + (p.seats || 1), 0);
}

/**
 * GET /api/sustainability/me
 * Combined personal impact (driver + passenger), role breakdowns, monthly
 * timeline (this month / last month / YTD) and an insight line.
 */
exports.myImpact = async (req, res) => {
    const uid = req.user._id;
    try {
        const [driverRides, passengerRides] = await Promise.all([
            Ride.find({ user_id: uid, status: "Completed" })
                .select("route sourceCoords destinationCoords vehicle_id passengers tracking updatedAt timing")
                .populate("vehicle_id", "vehicleType").lean(),
            Ride.find({ "passengers.user_id": uid, status: "Completed", user_id: { $ne: uid } })
                .select("route sourceCoords destinationCoords vehicle_id tracking updatedAt timing pricePerPerson")
                .populate("vehicle_id", "vehicleType").lean(),
        ]);

        // As a DRIVER: avoided trips ≈ passengers carried.
        const driverItems = driverRides.map((r) => ({
            distanceKm: rideDistanceKm(r), vehicleType: vType(r), passengers: paxCount(r), at: completedAt(r),
        }));
        // As a PASSENGER: the user avoided one solo trip per shared ride.
        const passengerItems = passengerRides.map((r) => ({
            distanceKm: rideDistanceKm(r), vehicleType: vType(r), passengers: 1, at: completedAt(r),
            price: r.pricePerPerson || 0,
        }));

        const driver = aggregateImpact(driverItems);
        driver.passengersTransported = driverItems.reduce((s, i) => s + i.passengers, 0);

        const passenger = aggregateImpact(passengerItems);
        passenger.tripsShared = passengerItems.filter((i) => i.passengers > 0).length;
        passenger.moneySavedInr = passengerItems.reduce((s, i) => s + (Number(i.price) || 0), 0);

        // Combined personal totals.
        const allItems = [...driverItems, ...passengerItems];
        const total = aggregateImpact(allItems);

        res.status(200).json({
            total,
            driver,
            passenger,
            timeline: buildTimeline(allItems),
            insight: insight(total),
        });
    } catch (err) {
        console.error("sustainability.myImpact:", err.message);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * GET /api/sustainability/platform  (admin)
 * Aggregate impact across ALL completed rides (driver-side counts each ride's
 * carried passengers — the platform's true shared impact).
 */
exports.platformImpact = async (req, res) => {
    try {
        const rides = await Ride.find({ status: "Completed" })
            .select("route sourceCoords destinationCoords vehicle_id passengers tracking updatedAt timing")
            .populate("vehicle_id", "vehicleType").lean();
        const items = rides.map((r) => ({
            distanceKm: rideDistanceKm(r), vehicleType: vType(r), passengers: paxCount(r), at: completedAt(r),
        }));
        const total = aggregateImpact(items);
        total.passengersTransported = items.reduce((s, i) => s + i.passengers, 0);
        res.status(200).json({ total, timeline: buildTimeline(items), insight: insight(total) });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

// Build this-month / last-month / year-to-date aggregates from dated items.
function buildTimeline(items) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const within = (from, to) => items.filter((i) => {
        const t = i.at ? new Date(i.at).getTime() : 0;
        return t >= from.getTime() && (!to || t < to.getTime());
    });

    return {
        thisMonth: aggregateImpact(within(monthStart, null)),
        lastMonth: aggregateImpact(within(lastMonthStart, monthStart)),
        yearToDate: aggregateImpact(within(yearStart, null)),
    };
}
