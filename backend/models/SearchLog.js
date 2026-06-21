const mongoose = require("mongoose");

// A lightweight log of ride searches. Powers (a) personal frequent-route
// detection for passenger recommendations and (b) aggregate demand insights for
// drivers (popular / unserved routes). Kept compact + indexed for fast
// aggregation. Capped retention can be added later (TTL index) if needed.
const SearchLogSchema = new mongoose.Schema(
    {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, default: null },
        role: { type: String, default: "" }, // Student | Faculty (searcher's role)
        source: { type: String, default: "" },
        destination: { type: String, default: "", index: true },
        sourceCoords: { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
        destinationCoords: { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
        // Whether the search returned any matches (for "unserved routes").
        resultCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

SearchLogSchema.index({ createdAt: -1 });
SearchLogSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model("SearchLog", SearchLogSchema);
