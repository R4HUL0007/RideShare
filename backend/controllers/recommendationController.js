// =======================================================
// Smart Recommendation Controller
// -------------------------------------------------------
// Personalized recommendations for passengers + demand insights for drivers,
// plus engagement tracking (impression/click/conversion). All user endpoints
// are auth-scoped to req.user.
// =======================================================

const {
    recommendRidesForPassenger,
    demandInsightsForDriver,
    trendingRoutes,
} = require("../utils/recommendation");
const RecommendationEvent = require("../models/RecommendationEvent");
const mongoose = require("mongoose");
const { cacheWrap } = require("../utils/cache");

/**
 * GET /api/recommendations/passenger
 * → { items: [rides with _reco], favoriteRoutes, recentRoutes, preferredHours }
 */
exports.passenger = async (req, res) => {
    try {
        const { items, profile } = await recommendRidesForPassenger(req.user._id, req.user.role, { limit: 8 });
        // Log impressions (fire-and-forget).
        try {
            RecommendationEvent.insertMany(
                items.map((r) => ({ user_id: req.user._id, ride_id: r._id, kind: "impression", surface: "passenger", score: r._reco?.score || 0, reason: r._reco?.reason || "" })),
                { ordered: false }
            ).catch(() => {});
        } catch { /* non-fatal */ }

        res.status(200).json({
            items,
            favoriteRoutes: profile.favoriteRoutes,
            recentRoutes: profile.recentRoutes,
            preferredHours: profile.preferredHours,
        });
    } catch (err) {
        console.error("recommendation.passenger:", err.message);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * GET /api/recommendations/driver → demand insights for the driver's audience.
 */
exports.driver = async (req, res) => {
    try {
        const days = Math.min(30, Math.max(1, parseInt(req.query.days, 10) || 7));
        const data = await demandInsightsForDriver(req.user._id, req.user.role, { days });
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * GET /api/recommendations/trending → platform trending routes.
 */
exports.trending = async (req, res) => {
    try {
        // Cache the platform-wide trending aggregate (Redis when available, else
        // in-process) — it's identical for everyone and recomputes from logs.
        const data = await cacheWrap("reco:trending:7d", 120, () => trendingRoutes({ days: 7 }));
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * POST /api/recommendations/track  body: { rideId?, kind, surface?, score?, reason? }
 * Records a click (or other engagement) on a recommendation.
 */
exports.track = async (req, res) => {
    const { rideId, kind, surface, score, reason } = req.body || {};
    if (!["impression", "click", "conversion"].includes(kind)) {
        return res.status(400).json({ message: "Invalid kind" });
    }
    try {
        // Drop an invalid rideId rather than letting a CastError 500 the request.
        const validRideId = rideId && mongoose.Types.ObjectId.isValid(rideId) ? rideId : null;
        await RecommendationEvent.create({
            user_id: req.user._id,
            ride_id: validRideId,
            kind,
            surface: surface || "passenger",
            score: score || 0,
            reason: reason || "",
        });
        res.status(201).json({ message: "tracked" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/* ---- Admin analytics (aggregate) ---- */
exports.analytics = async (req, res) => {
    try {
        const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));
        const since = new Date(); since.setDate(since.getDate() - days);
        const agg = await RecommendationEvent.aggregate([
            { $match: { createdAt: { $gte: since } } },
            { $group: { _id: "$kind", count: { $sum: 1 } } },
        ]);
        const counts = { impression: 0, click: 0, conversion: 0 };
        agg.forEach((a) => { if (a._id in counts) counts[a._id] = a.count; });
        res.status(200).json({
            days,
            ...counts,
            ctr: counts.impression ? Math.round((counts.click / counts.impression) * 100) : 0,
            conversionRate: counts.click ? Math.round((counts.conversion / counts.click) * 100) : 0,
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};
