const mongoose = require("mongoose");

// Server-side record of an issued refresh token. We never store the token
// itself — only an HMAC-SHA256 hash — so a DB leak can't be used to forge a
// session. Tokens are grouped into a `family`: rotating a token revokes the old
// one and issues a new one in the same family. If a REVOKED token is ever
// presented again (replay/theft), we revoke the whole family.
const RefreshTokenSchema = new mongoose.Schema(
    {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        // HMAC-SHA256(token, REFRESH_TOKEN_SECRET). Unique + indexed for O(1) lookup.
        tokenHash: { type: String, required: true, unique: true, index: true },
        // Rotation lineage — all tokens descended from one login share a family.
        family: { type: String, required: true, index: true },
        expiresAt: { type: Date, required: true },
        revokedAt: { type: Date, default: null },
        // Hash of the token that replaced this one (audit trail for rotation).
        replacedByHash: { type: String, default: null },
        userAgent: { type: String, default: "" },
        ip: { type: String, default: "" },
    },
    { timestamps: true }
);

// TTL index: Mongo auto-purges expired refresh tokens (housekeeping).
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", RefreshTokenSchema);
