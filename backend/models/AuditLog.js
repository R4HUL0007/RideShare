const mongoose = require("mongoose");

// An immutable record of a sensitive admin action. Written by the admin
// controller whenever an admin mutates platform state (suspends a user,
// releases escrow, resolves a dispute, approves a withdrawal, removes a
// review, etc.). Never updated or deleted — purely append-only for audit.
const AuditLogSchema = new mongoose.Schema(
    {
        admin_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        adminName: { type: String, default: "" },
        // Machine action key, e.g. "user.suspend", "escrow.release",
        // "dispute.resolve", "withdrawal.approve", "review.remove".
        action: { type: String, required: true, index: true },
        // The kind + id of the entity acted on.
        targetType: { type: String, default: "" },   // "user" | "ride" | "payment" | "dispute" | "withdrawal" | "review"
        target_id: { type: mongoose.Schema.Types.ObjectId, default: null },
        // Free-form details (reason, before/after, amounts) — kept small.
        details: { type: mongoose.Schema.Types.Mixed, default: {} },
        ip: { type: String, default: "" },
    },
    { timestamps: true }
);

AuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", AuditLogSchema);
