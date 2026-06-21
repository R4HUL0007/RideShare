// =======================================================
// RidexShare AI — Data Tools (server-side, read-only)
// -------------------------------------------------------
// Tools that fetch REAL, user-scoped data straight from the database. These run
// with the authenticated user's context (ctx.user) and are HARD-SCOPED to that
// user — a tool can never return another user's rides, payments or earnings.
// They power conversational payments/earnings/escrow/bookings answers with real
// numbers (never fabricated).
// =======================================================

const mongoose = require("mongoose");
const Ride = require("../../models/Ride");
const Payment = require("../../models/Payment");

const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN")}`;
const uid = (ctx) => ctx?.user?._id;

/**
 * My bookings (rides where the user is a passenger).
 */
async function getMyBookings(_args, ctx) {
    const id = uid(ctx);
    if (!id) return { ok: false, message: "You need to be signed in." };
    const rides = await Ride.find({ "passengers.user_id": id })
        .select("source destination timing status seatsAvailable user_id tracking.state")
        .populate("user_id", "name")
        .sort({ timing: -1 })
        .limit(10)
        .lean();
    if (rides.length === 0) return { ok: true, empty: true, message: "You don't have any bookings yet." };
    return {
        ok: true,
        count: rides.length,
        items: rides.map((r) => ({
            id: String(r._id),
            route: `${r.source} → ${r.destination}`,
            driver: r.user_id?.name || "Driver",
            timing: r.timing,
            status: r.status,
            trackingState: r.tracking?.state || "scheduled",
        })),
    };
}

/**
 * My rides (rides the user created/offered).
 */
async function getMyRides(_args, ctx) {
    const id = uid(ctx);
    if (!id) return { ok: false, message: "You need to be signed in." };
    const rides = await Ride.find({ user_id: id })
        .select("source destination timing status seatsAvailable passengers")
        .sort({ timing: -1 })
        .limit(10)
        .lean();
    if (rides.length === 0) return { ok: true, empty: true, message: "You haven't created any rides yet." };
    return {
        ok: true,
        count: rides.length,
        items: rides.map((r) => ({
            id: String(r._id),
            route: `${r.source} → ${r.destination}`,
            timing: r.timing,
            status: r.status,
            seatsAvailable: r.seatsAvailable,
            passengers: (r.passengers || []).length,
        })),
    };
}

/**
 * Payment history (rides the user paid for as a passenger).
 */
async function getPaymentHistory(_args, ctx) {
    const id = uid(ctx);
    if (!id) return { ok: false, message: "You need to be signed in." };
    const payments = await Payment.find({ user_id: id })
        .select("amount status escrowStatus routeSnapshot createdAt paidAt")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
    if (payments.length === 0) return { ok: true, empty: true, message: "You don't have any payments yet." };
    const totalPaid = payments.filter((p) => p.status === "Successful").reduce((s, p) => s + (p.amount || 0), 0);
    return {
        ok: true,
        count: payments.length,
        totalPaidLabel: inr(totalPaid),
        items: payments.map((p) => ({
            amountLabel: inr(p.amount),
            status: p.status,
            escrow: p.escrowStatus,
            route: p.routeSnapshot ? `${p.routeSnapshot.source || ""} → ${p.routeSnapshot.destination || ""}`.trim() : "",
            date: p.paidAt || p.createdAt,
        })),
    };
}

/**
 * Driver earnings summary (released / escrow-pending / total) + optional month.
 */
async function getEarnings(args, ctx) {
    const id = uid(ctx);
    if (!id) return { ok: false, message: "You need to be signed in." };

    const driverId = new mongoose.Types.ObjectId(id);
    const agg = await Payment.aggregate([
        { $match: { driver_id: driverId, status: "Successful" } },
        { $group: { _id: "$escrowStatus", total: { $sum: "$driverEarnings" }, count: { $sum: 1 } } },
    ]);

    const buckets = { held: 0, awaiting_completion: 0, released: 0, disputed: 0, refunded: 0 };
    agg.forEach((a) => { if (a._id in buckets) buckets[a._id] = a.total; });

    const available = buckets.released;
    const escrowPending = buckets.held + buckets.awaiting_completion;
    const total = available + escrowPending;

    // "this month" earnings if asked.
    let monthLabel = null;
    if (args?.thisMonth) {
        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const monthAgg = await Payment.aggregate([
            { $match: { driver_id: driverId, status: "Successful", paidAt: { $gte: monthStart } } },
            { $group: { _id: null, total: { $sum: "$driverEarnings" } } },
        ]);
        monthLabel = inr(monthAgg[0]?.total || 0);
    }

    if (total === 0 && !monthLabel) {
        return { ok: true, empty: true, message: "You haven't earned anything yet. Offer rides to start earning!" };
    }
    return {
        ok: true,
        availableLabel: inr(available),
        escrowPendingLabel: inr(escrowPending),
        totalLabel: inr(total),
        monthLabel,
    };
}

/**
 * Escrow balance for the user as a driver (funds held + awaiting completion).
 */
async function getEscrowBalance(_args, ctx) {
    const id = uid(ctx);
    if (!id) return { ok: false, message: "You need to be signed in." };
    const driverId = new mongoose.Types.ObjectId(id);
    const agg = await Payment.aggregate([
        { $match: { driver_id: driverId, status: "Successful", escrowStatus: { $in: ["held", "awaiting_completion"] } } },
        { $group: { _id: null, total: { $sum: "$driverEarnings" }, count: { $sum: 1 } } },
    ]);
    const total = agg[0]?.total || 0;
    return {
        ok: true,
        escrowBalanceLabel: inr(total),
        count: agg[0]?.count || 0,
        empty: total === 0,
    };
}

/**
 * Search available rides (for conversational search). Read-only, respects the
 * gender-safety rule implicitly via the rides API on the frontend; here we
 * surface matches for display.
 */
async function searchRides(args, ctx) {
    const id = uid(ctx);

    // Smart Route Matching path: when the caller supplies destination coords
    // (e.g. a future geocoding step in the assistant), rank by route overlap /
    // nearby destination and include a match score + reason.
    const dLat = Number(args?.destLat), dLng = Number(args?.destLng);
    if (Number.isFinite(dLat) && Number.isFinite(dLng)) {
        const { rankRides } = require("../../utils/routeMatch");
        const filter = { status: "Available", seatsAvailable: { $gte: 1 } };
        if (id) filter.user_id = { $ne: id };
        const candidates = await Ride.find(filter)
            .select("source destination timing seatsAvailable pricePerPerson user_id vehicle_id sourceCoords destinationCoords route")
            .populate("user_id", "name ratings")
            .populate("vehicle_id", "make model")
            .limit(300)
            .lean();
        const sLat = Number(args?.sourceLat), sLng = Number(args?.sourceLng);
        const query = {
            destinationCoords: { lat: dLat, lng: dLng },
            sourceCoords: Number.isFinite(sLat) && Number.isFinite(sLng) ? { lat: sLat, lng: sLng } : null,
        };
        const ranked = rankRides(query, candidates).slice(0, 6);
        if (ranked.length === 0) return { ok: true, empty: true, message: `No rides found near ${args?.destination || "your destination"}.` };
        return {
            ok: true,
            count: ranked.length,
            smart: true,
            items: ranked.map(({ ride: r, match }) => ({
                id: String(r._id),
                source: r.source,
                destination: r.destination,
                driver: r.user_id?.name || "Driver",
                vehicle: r.vehicle_id ? `${r.vehicle_id.make || ""} ${r.vehicle_id.model || ""}`.trim() : "—",
                seats: r.seatsAvailable,
                timing: r.timing,
                price: r.pricePerPerson,
                matchScore: match.score,
                matchReason: match.reason,
            })),
        };
    }

    const filter = { status: "Available", seatsAvailable: { $gte: 1 } };
    if (args?.destination) filter.destination = new RegExp(escapeRx(args.destination), "i");
    if (id) filter.user_id = { $ne: id }; // never show the user's own rides
    const hasTimeFilter = args?.afterHour != null;
    let rides = await Ride.find(filter)
        .select("source destination timing seatsAvailable pricePerPerson user_id vehicle_id")
        .populate("user_id", "name")
        .populate("vehicle_id", "make model")
        .sort({ timing: 1 })
        // Fetch a wider candidate set when a time filter applies, so the
        // "after HH:00" filter below doesn't strip the only 8 fetched rides and
        // wrongly report "no rides" while later qualifying rides exist.
        .limit(hasTimeFilter ? 50 : 8)
        .lean();

    // Optional "after HH:MM" time filter, then cap to 8 for the assistant.
    if (hasTimeFilter) {
        rides = rides.filter((r) => new Date(r.timing).getHours() >= args.afterHour).slice(0, 8);
    }

    if (rides.length === 0) return { ok: true, empty: true, message: `No available rides found${args?.destination ? " to " + args.destination : ""}.` };
    return {
        ok: true,
        count: rides.length,
        items: rides.map((r) => ({
            id: String(r._id),
            source: r.source,
            destination: r.destination,
            driver: r.user_id?.name || "Driver",
            vehicle: r.vehicle_id ? `${r.vehicle_id.make || ""} ${r.vehicle_id.model || ""}`.trim() : "—",
            seats: r.seatsAvailable,
            timing: r.timing,
            price: r.pricePerPerson,
        })),
    };
}

function escapeRx(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Personalized recommendations for the assistant ("recommend rides for me").
 * Reuses the recommendation engine — returns top recommended rides with reasons.
 */
async function recommendRides(_args, ctx) {    const id = uid(ctx);
    if (!id) return { ok: false, message: "You need to be signed in." };
    try {
        const { recommendRidesForPassenger } = require("../../utils/recommendation");
        const { items, profile } = await recommendRidesForPassenger(id, ctx.user?.role, { limit: 5 });
        if (!items || items.length === 0) {
            return { ok: true, empty: true, message: "I don't have enough of your travel history yet to personalize recommendations. Book or search a few rides and I'll suggest rides on your usual routes." };
        }
        return {
            ok: true,
            count: items.length,
            favoriteRoute: profile.favoriteRoutes?.[0]?.destination || null,
            items: items.map((r) => ({
                id: String(r._id),
                source: r.source,
                destination: r.destination,
                driver: r.user_id?.name || "Driver",
                vehicle: r.vehicle_id ? `${r.vehicle_id.make || ""} ${r.vehicle_id.model || ""}`.trim() : "—",
                seats: r.seatsAvailable,
                timing: r.timing,
                price: r.pricePerPerson,
                matchScore: r._reco?.score,
                matchReason: r._reco?.reason,
            })),
        };
    } catch (err) {
        return { ok: false, message: "Couldn't load recommendations right now." };
    }
}

/**
 * Carbon/sustainability impact for the assistant ("how much carbon have I
 * saved?"). Reuses the sustainability controller logic via a direct call.
 */
async function carbonImpact(_args, ctx) {
    const id = uid(ctx);
    if (!id) return { ok: false, message: "You need to be signed in." };
    try {
        const Ride = require("../../models/Ride");
        const { aggregateImpact } = require("../../utils/carbon");
        const { haversineKm } = require("../../utils/geo");
        const dist = (r) => (Number.isFinite(r.route?.distanceKm) && r.route.distanceKm > 0)
            ? r.route.distanceKm
            : (haversineKm(r.sourceCoords, r.destinationCoords) || 0);
        const [driverRides, passengerRides] = await Promise.all([
            Ride.find({ user_id: id, status: "Completed" }).select("route sourceCoords destinationCoords vehicle_id passengers").populate("vehicle_id", "vehicleType").lean(),
            Ride.find({ "passengers.user_id": id, status: "Completed", user_id: { $ne: id } }).select("route sourceCoords destinationCoords vehicle_id").populate("vehicle_id", "vehicleType").lean(),
        ]);
        const items = [
            ...driverRides.map((r) => ({ distanceKm: dist(r), vehicleType: r.vehicle_id?.vehicleType || "Car", passengers: (r.passengers || []).reduce((s, p) => s + (p.seats || 1), 0) })),
            ...passengerRides.map((r) => ({ distanceKm: dist(r), vehicleType: r.vehicle_id?.vehicleType || "Car", passengers: 1 })),
        ];
        const total = aggregateImpact(items);
        if (total.sharedTrips === 0) return { ok: true, empty: true, message: "You haven't completed any shared rides yet — share or join rides to start saving CO₂!" };
        return { ok: true, ...total };
    } catch (err) {
        return { ok: false, message: "Couldn't load your environmental impact right now." };
    }
}

module.exports = {
    getMyBookings,
    getMyRides,
    getPaymentHistory,
    getEarnings,
    getEscrowBalance,
    searchRides,
    recommendRides,
    carbonImpact,
};
