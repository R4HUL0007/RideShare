const mongoose = require("mongoose");

// A user's emergency contact. Contacts are notified on SOS. `relationship`
// covers guardian/parent. `priority` distinguishes primary vs secondary; the
// primary is notified first. Verification is future-ready (e.g. confirm the
// contact via an SMS/link) — defaults to "unverified".
const EmergencyContactSchema = new mongoose.Schema(
    {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 80 },
        phoneNumber: { type: String, required: true, trim: true },
        email: { type: String, default: "", trim: true },
        relationship: {
            type: String,
            enum: ["Parent", "Guardian", "Spouse", "Sibling", "Friend", "Other"],
            default: "Other",
        },
        priority: { type: String, enum: ["primary", "secondary", "other"], default: "other", index: true },
        verificationStatus: { type: String, enum: ["unverified", "verified"], default: "unverified" },
    },
    { timestamps: true }
);

EmergencyContactSchema.index({ user_id: 1, priority: 1 });

module.exports = mongoose.model("EmergencyContact", EmergencyContactSchema);
