const mongoose = require("mongoose");
const crypto = require("crypto");

// A secure, shareable trip-tracking link. A passenger/driver shares an active
// ride with trusted contacts via an unguessable token. The public view (no auth)
// resolves the token to a read-only live tracking snapshot. Links expire.
const TripShareSchema = new mongoose.Schema(
    {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        ride_id: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", required: true, index: true },
        token: { type: String, required: true, unique: true, index: true },
        active: { type: Boolean, default: true },
        expiresAt: { type: Date, required: true },
        viewCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// Generate a cryptographically-random, URL-safe token.
TripShareSchema.statics.makeToken = function () {
    return crypto.randomBytes(24).toString("base64url");
};

module.exports = mongoose.model("TripShare", TripShareSchema);
