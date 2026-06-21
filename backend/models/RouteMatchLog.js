const mongoose = require("mongoose");

// Lightweight analytics for Smart Route Matching. One doc per smart search.
// Captures how many candidates were considered, how many matched, the best
// score, and the distribution of match types — for measuring match success
// rate, intermediate-stop vs nearby-destination matches, and (later) conversion.
const RouteMatchLogSchema = new mongoose.Schema(
    {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, default: null },
        candidates: { type: Number, default: 0 },
        matches: { type: Number, default: 0 },
        bestScore: { type: Number, default: 0 },
        // Counts of each match type returned.
        types: {
            exact: { type: Number, default: 0 },
            on_route: { type: Number, default: 0 },
            near_route: { type: Number, default: 0 },
            near_dest: { type: Number, default: 0 },
            partial: { type: Number, default: 0 },
            source_only: { type: Number, default: 0 },
        },
        // Set to true once a ride from this search is booked (conversion).
        converted: { type: Boolean, default: false, index: true },
    },
    { timestamps: true }
);

RouteMatchLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("RouteMatchLog", RouteMatchLogSchema);
