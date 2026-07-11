const mongoose = require("mongoose");

// =======================================================
// Per-user recent ROUTE searches (pickup → destination) for the homepage
// "Recent Searches" quick-repeat list. User-facing and clear-able, capped at 10.
//
// Deliberately separate from SearchLog: SearchLog is an unbounded analytics log
// that powers demand/trending aggregations — clearing a user's homepage history
// must NOT touch those. This model is only the user's own recent-route list.
// =======================================================

const PlaceSchema = new mongoose.Schema(
    {
        label: { type: String, default: "" },
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
    },
    { _id: false }
);

const RideSearchHistorySchema = new mongoose.Schema(
    {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        pickup: { type: PlaceSchema, default: () => ({}) },
        destination: { type: PlaceSchema, default: () => ({}) },
    },
    { timestamps: true } // createdAt drives newest-first + the 10-item cap
);

RideSearchHistorySchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model("RideSearchHistory", RideSearchHistorySchema);
