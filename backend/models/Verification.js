const mongoose = require("mongoose");

// Driver/Vehicle verification record. One per user (covers their DL + all
// their vehicles). Supports the admin-approval workflow: driver submits docs →
// admin reviews → approved / rejected. Rejected drivers may resubmit.
//
// Architecture is OCR-ready: future providers (Google Vision / AWS Textract /
// Tesseract) can write extracted fields to `ocrData` without schema changes.
const VerificationSchema = new mongoose.Schema(
    {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },

        // ---- Driver documents ----
        drivingLicense: {
            url: { type: String, default: "" },      // Cloudinary / S3 URL
            fileName: { type: String, default: "" },
            uploadedAt: { type: Date, default: null },
        },

        // ---- Vehicle documents (one RC + photos per vehicle) ----
        vehicles: [{
            vehicle_id: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true },
            rc: {
                url: { type: String, default: "" },
                fileName: { type: String, default: "" },
                uploadedAt: { type: Date, default: null },
            },
            photos: {
                front: { url: { type: String, default: "" }, uploadedAt: { type: Date, default: null } },
                side: { url: { type: String, default: "" }, uploadedAt: { type: Date, default: null } },
                rear: { url: { type: String, default: "" }, uploadedAt: { type: Date, default: null } },
            },
        }],

        // ---- Workflow status ----
        status: {
            type: String,
            enum: ["not_submitted", "pending", "approved", "rejected"],
            default: "not_submitted",
            index: true,
        },
        submittedAt: { type: Date, default: null },
        reviewedAt: { type: Date, default: null },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        adminRemarks: { type: String, default: "" },

        // ---- OCR (future-ready) ----
        ocrData: {
            dlNumber: { type: String, default: "" },
            dlName: { type: String, default: "" },
            dlExpiry: { type: Date, default: null },
            rcNumber: { type: String, default: "" },
            processed: { type: Boolean, default: false },
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Verification", VerificationSchema);
