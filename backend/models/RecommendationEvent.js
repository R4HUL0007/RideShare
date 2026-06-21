const mongoose = require("mongoose");

// Tracks recommendation engagement: impressions, clicks and conversions
// (a recommended ride that was then booked). Powers recommendation analytics
// (CTR, conversion, most successful recommendations) and future ML training.
const RecommendationEventSchema = new mongoose.Schema(
    {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, default: null },
        ride_id: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", default: null },
        kind: { type: String, enum: ["impression", "click", "conversion"], required: true, index: true },
        surface: { type: String, default: "passenger" }, // passenger | driver | trending
        score: { type: Number, default: 0 },
        reason: { type: String, default: "" },
    },
    { timestamps: true }
);

RecommendationEventSchema.index({ createdAt: -1 });

module.exports = mongoose.model("RecommendationEvent", RecommendationEventSchema);
