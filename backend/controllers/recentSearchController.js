const RecentSearch = require("../models/RecentSearch");

// Per-user cap on retained recent places (Maximum_Recent_Count).
const MAX_RECENT = 6;

// Return a user's recent places, newest-first, capped. Never throws.
async function safeList(userId) {
    try {
        return await RecentSearch.find({ user_id: userId })
            .sort({ updatedAt: -1 })
            .limit(MAX_RECENT)
            .select("label placeId coords updatedAt")
            .lean();
    } catch {
        return [];
    }
}

// Drop anything beyond the newest MAX_RECENT for this user.
async function trim(userId) {
    const surplus = await RecentSearch.find({ user_id: userId })
        .sort({ updatedAt: -1 })
        .skip(MAX_RECENT)
        .select("_id")
        .lean();
    if (surplus.length) {
        await RecentSearch.deleteMany({ _id: { $in: surplus.map((d) => d._id) } });
    }
}

// GET /api/recent-searches — the user's quick-pick list.
const list = async (req, res) => {
    const items = await safeList(req.user._id);
    return res.status(200).json(items);
};

// POST /api/recent-searches — record (or bump) a chosen place. Fire-and-forget
// from the client's perspective: invalid input or failures never block the
// caller's location selection, so we always answer 200 with the current list.
const add = async (req, res) => {
    try {
        const userId = req.user._id;
        const label = String(req.body?.label || "").trim().slice(0, 200);
        const placeId = String(req.body?.placeId || "").trim().slice(0, 300);
        const lat = Number(req.body?.lat);
        const lng = Number(req.body?.lng);

        // Only record a valid, geocoded selection.
        if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(200).json(await safeList(userId));
        }

        // De-dup key: place_id when present, else the display label. Upsert bumps
        // updatedAt (mongoose timestamps), moving the entry to the top.
        const match = placeId ? { user_id: userId, placeId } : { user_id: userId, label };
        await RecentSearch.findOneAndUpdate(
            match,
            { $set: { user_id: userId, label, placeId, coords: { lat, lng } } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        await trim(userId);
        return res.status(200).json(await safeList(userId));
    } catch {
        // Recording failed — do not surface an error into the client flow.
        return res.status(200).json([]);
    }
};

// DELETE /api/recent-searches/:id — remove a single entry (scoped to the user).
const removeOne = async (req, res) => {
    try {
        await RecentSearch.deleteOne({ _id: req.params.id, user_id: req.user._id });
        return res.status(200).json(await safeList(req.user._id));
    } catch {
        return res.status(200).json([]);
    }
};

// DELETE /api/recent-searches — clear the user's whole list.
const clearAll = async (req, res) => {
    try {
        await RecentSearch.deleteMany({ user_id: req.user._id });
        return res.status(200).json([]);
    } catch {
        return res.status(200).json([]);
    }
};

module.exports = { list, add, removeOne, clearAll };
