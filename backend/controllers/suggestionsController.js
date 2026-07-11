const mongoose = require("mongoose");
const RideSearchHistory = require("../models/RideSearchHistory");
const FavoriteLocation = require("../models/FavoriteLocation");
const { buildSmartSuggestion, haversineMeters, MATCH_RADIUS_M } = require("../utils/suggestions");
const { cacheWrap } = require("../utils/cache");

const MAX_HISTORY = 10;   // recent searches shown/retained per user
const MAX_FAVORITES = 20; // stored favorites bound (top 5 surfaced)

// Coerce an incoming place into a safe { label, lat, lng } shape.
const sanitizePlace = (p) => {
    const lat = Number(p?.lat);
    const lng = Number(p?.lng);
    return {
        label: String(p?.label || "").trim().slice(0, 200),
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
    };
};

async function recentSearches(userId) {
    try {
        return await RideSearchHistory.find({ user_id: userId })
            .sort({ createdAt: -1 })
            .limit(MAX_HISTORY)
            .lean();
    } catch {
        return [];
    }
}

// Increment (radius-dedup) or create a favorite for a geographic place, then
// bound stored favorites. No-op for places without usable coordinates.
async function bumpFavorite(userId, place) {
    if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return;
    const favs = await FavoriteLocation.find({ user_id: userId }).limit(50);
    let match = null;
    for (const f of favs) {
        if (haversineMeters({ lat: place.lat, lng: place.lng }, { lat: f.coords?.lat, lng: f.coords?.lng }) <= MATCH_RADIUS_M) {
            match = f;
            break;
        }
    }
    if (match) {
        match.visitCount += 1;
        match.lastUsedAt = new Date();
        if (!match.label && place.label) match.label = place.label;
        await match.save();
    } else {
        await FavoriteLocation.create({
            user_id: userId,
            label: place.label || "",
            coords: { lat: place.lat, lng: place.lng },
            visitCount: 1,
            lastUsedAt: new Date(),
        });
    }
    // Keep storage bounded — drop the least-used beyond MAX_FAVORITES.
    const surplus = await FavoriteLocation.find({ user_id: userId })
        .sort({ visitCount: -1, lastUsedAt: -1 })
        .skip(MAX_FAVORITES)
        .select("_id")
        .lean();
    if (surplus.length) {
        await FavoriteLocation.deleteMany({ _id: { $in: surplus.map((d) => d._id) } });
    }
}

// GET /api/suggestions?lat&lng&hour&day — homepage smart card + lists.
exports.get = async (req, res) => {
    try {
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);
        const hour = Number(req.query.hour);
        const day = Number(req.query.day);
        const loc = (Number.isFinite(lat) && Number.isFinite(lng)) ? `${lat.toFixed(2)},${lng.toFixed(2)}` : "none";
        const key = `sugg:${req.user._id}:${loc}:${Number.isFinite(hour) ? hour : "x"}`;

        // Cache the computed card/lists briefly (per user + rounded loc + hour).
        const core = await cacheWrap(key, 60, () =>
            buildSmartSuggestion(req.user._id, { lat, lng, hour, day })
        );
        // Recent searches are cheap + clearable → always fresh.
        const recents = await recentSearches(req.user._id);
        return res.status(200).json({ ...core, recentSearches: recents });
    } catch {
        // Never block the homepage.
        return res.status(200).json({ smartCard: null, favoritePlaces: [], frequentDestinations: [], recentSearches: [] });
    }
};

// POST /api/suggestions/record { pickup, destination } — record a route search
// (trim to 10) + bump favorites. Fire-and-forget from the client.
exports.record = async (req, res) => {
    try {
        const userId = req.user._id;
        const pickup = sanitizePlace(req.body?.pickup);
        const destination = sanitizePlace(req.body?.destination);

        // Need at least a destination to be meaningful.
        if (!destination.label && !Number.isFinite(destination.lat)) {
            return res.status(200).json({ ok: false });
        }

        await RideSearchHistory.create({ user_id: userId, pickup, destination });
        const surplus = await RideSearchHistory.find({ user_id: userId })
            .sort({ createdAt: -1 })
            .skip(MAX_HISTORY)
            .select("_id")
            .lean();
        if (surplus.length) {
            await RideSearchHistory.deleteMany({ _id: { $in: surplus.map((d) => d._id) } });
        }

        await bumpFavorite(userId, pickup);
        await bumpFavorite(userId, destination);
        return res.status(200).json({ ok: true });
    } catch {
        return res.status(200).json({ ok: false });
    }
};

// DELETE /api/suggestions/searches/:id — remove one recent search (user-scoped).
exports.removeSearch = async (req, res) => {
    try {
        if (mongoose.Types.ObjectId.isValid(req.params.id)) {
            await RideSearchHistory.deleteOne({ _id: req.params.id, user_id: req.user._id });
        }
        return res.status(200).json(await recentSearches(req.user._id));
    } catch {
        return res.status(200).json([]);
    }
};

// DELETE /api/suggestions/searches — clear all recent searches (user-scoped).
// Does NOT touch SearchLog / favorites.
exports.clearSearches = async (req, res) => {
    try {
        await RideSearchHistory.deleteMany({ user_id: req.user._id });
        return res.status(200).json([]);
    } catch {
        return res.status(200).json([]);
    }
};
