const mongoose = require("mongoose");

// A user-submitted safety report against a driver/passenger/ride. Admins review
// and resolve. Evidence (screenshots/files) are stored as hosted URLs.
const SafetyReportSchema = new mongoose.Schema(
    {
        reporter_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        // Optional subject of the report.
        against_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
        ride_id: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", default: null },

        reportType: {
            type: String,
            enum: ["driver", "passenger", "ride", "unsafe_driving", "harassment", "vehicle_mismatch", "fake_profile", "payment_issue", "other"],
            required: true,
        },
        reason: { type: String, default: "", maxlength: 200 },
        description: { type: String, default: "", maxlength: 2000 },
        evidence: [{ type: String }], // hosted URLs (screenshots / files)

        status: {
            type: String,
            enum: ["open", "under_review", "resolved", "dismissed"],
            default: "open",
            index: true,
        },
        priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
        resolution: { type: String, default: "" },
        resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        resolvedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

SafetyReportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("SafetyReport", SafetyReportSchema);
