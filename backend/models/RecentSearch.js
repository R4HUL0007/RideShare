const mongoose = require("mongoose");

// =======================================================
// Per-user "recent places" — powers the Uber/Ola-style quick-pick list in the
// shared location search box. This is INTENTIONALLY separate from SearchLog
// (which logs route pairs for recommendations/demand insights): a RecentSearch
// is a single chosen LOCATION (label + coords + optional Google place_id).
//
// Bounded to Maximum_Recent_Count (6) per user, newest-first by updatedAt.
// =======================================================

const RecentSearchSchema = new mongoose.Schema(
    {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        // Display address/label shown in the quick-pick row.
        label: { type: String, default: "" },
        // Google Places place_id when available — the primary de-dup key.
        placeId: { type: String, default: "" },
        // Geocoded coordinates of the chosen place.
        coords: {
            lat: { type: Number, default: null },
            lng: { type: Number, default: null },
        },
    },
    { timestamps: true } // createdAt + updatedAt; updatedAt drives ordering + dedup bump
);

// List newest-first per user.
RecentSearchSchema.index({ user_id: 1, updatedAt: -1 });
// Fast dedup lookup when a place_id is present.
RecentSearchSchema.index({ user_id: 1, placeId: 1 });

module.exports = mongoose.model("RecentSearch", RecentSearchSchema);
