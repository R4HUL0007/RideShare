const mongoose = require("mongoose");

// A single review left by one ride participant for another, scoped to a ride.
// `direction` records who reviewed whom so we can aggregate driver vs passenger
// reputations separately and surface the right category set.
//
// Duplicate prevention: a unique compound index on (ride, reviewer, reviewee)
// guarantees one review per ride per reviewer→reviewee pair.
const ReviewSchema = new mongoose.Schema(
    {
        ride: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", required: true, index: true },
        reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        reviewee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        // "driverToPassenger" = a driver reviewing a passenger;
        // "passengerToDriver" = a passenger reviewing a driver.
        direction: {
            type: String,
            enum: ["driverToPassenger", "passengerToDriver"],
            required: true,
        },
        rating: { type: Number, required: true, min: 1, max: 5 },
        comment: { type: String, trim: true, maxlength: 1000, default: "" },
        // Per-category 1–5 scores. The set used depends on `direction`:
        //   passengerToDriver: driving, punctuality, communication, vehicle
        //   driverToPassenger: punctuality, communication, behavior
        categories: {
            driving: { type: Number, min: 0, max: 5, default: 0 },
            punctuality: { type: Number, min: 0, max: 5, default: 0 },
            communication: { type: Number, min: 0, max: 5, default: 0 },
            vehicle: { type: Number, min: 0, max: 5, default: 0 },
            behavior: { type: Number, min: 0, max: 5, default: 0 },
        },
    },
    { timestamps: true }
);

// One review per (ride, reviewer, reviewee) — prevents duplicate submissions.
ReviewSchema.index({ ride: 1, reviewer: 1, reviewee: 1 }, { unique: true });
// Fast "reviews received by a user" lookups, newest first.
ReviewSchema.index({ reviewee: 1, createdAt: -1 });

module.exports = mongoose.model("Review", ReviewSchema);
