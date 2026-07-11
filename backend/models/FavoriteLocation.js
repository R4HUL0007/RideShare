const mongoose = require("mongoose");

// =======================================================
// Per-user "favorite / frequent places" for Smart Ride Suggestions.
// A place the user travels to/from often, ranked by visit frequency. Labels are
// the place's human address/name (explicit "Home"/"Work" naming is a future
// add-on). Separate from RecentSearch/SearchLog — this tracks aggregate usage.
// =======================================================

const FavoriteLocationSchema = new mongoose.Schema(
    {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        label: { type: String, default: "" },
        coords: {
            lat: { type: Number, default: null },
            lng: { type: Number, default: null },
        },
        visitCount: { type: Number, default: 1 },
        lastUsedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// Rank by frequency (most-used first) and recency, per user.
FavoriteLocationSchema.index({ user_id: 1, visitCount: -1 });
FavoriteLocationSchema.index({ user_id: 1, lastUsedAt: -1 });

module.exports = mongoose.model("FavoriteLocation", FavoriteLocationSchema);
