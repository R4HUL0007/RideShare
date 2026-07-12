const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, match: [/^.+@paruluniversity\.ac\.in$/, "Invalid email domain"] },
    // Password is required for local (email/password) accounts but optional for
    // OAuth accounts (e.g. Google), where authentication is delegated.
    password: {
        type: String,
        required: function () {
            return this.authProvider === 'local';
        },
    },
    authProvider: { type: String, enum: ["local", "google"], default: "local" },
    googleId: { type: String },
    phoneNumber: { type: String, required: true },
    // Phone ownership verified via a WhatsApp OTP challenge. Distinct from simply
    // having a number on file — only true after the user enters the code we sent.
    // Reset to false whenever the phone number is changed.
    phoneVerified: { type: Boolean, default: false },
    // Transient phone-verification OTP (bcrypt hash), its expiry, and a wrong-
    // guess counter. Used by the self-managed OTP provider (APITxT), where we
    // generate + verify the code ourselves. Kept separate from the email `otp`
    // fields so the two flows never collide. Cleared on success/too many attempts.
    phoneOtp: { type: String },
    phoneOtpExpiry: { type: Date },
    phoneOtpAttempts: { type: Number, default: 0 },
    // Number of OTP sends in the CURRENT verification cycle (send + resends).
    // Capped by PHONE_OTP_MAX_SENDS to protect SMS credits from abuse. Reset to
    // 0 on successful verification and whenever the phone number changes.
    phoneOtpSendCount: { type: Number, default: 0 },
    // When the phone was last successfully verified. Powers the change lock-in:
    // a verified number can't be changed until PHONE_CHANGE_LOCK_DAYS have passed
    // (prevents change→re-verify OTP spam).
    phoneVerifiedAt: { type: Date },
    // For provider-managed OTP (Message Central), we only store the provider's
    // verificationId between send and validate — the OTP itself never touches us.
    phoneVerificationId: { type: String },
    role: { type: String, enum: ["Student", "Faculty"], required: true },
    gender: { type: String, enum: ["Male", "Female"], required: true },
    // Profile picture URL (e.g. a Cloudinary secure_url). Optional.
    profilePicture: { type: String, default: "" },
    // User notification preferences. Stored as a small flag object.
    notificationPrefs: {
        email: { type: Boolean, default: true },
        rideUpdates: { type: Boolean, default: true },
        promotions: { type: Boolean, default: false },
    },
    isVerified: { type: Boolean, default: false },
    otp: { type: String },
    otpExpiry: { type: Date },
    otpAttempts: { type: Number, default: 0 },
    // -------- Admin & account status (admin panel) --------
    // `isAdmin` gates the admin panel. `adminRole` is future-ready for a
    // granular permission model (super_admin / moderator / support). `status`
    // lets admins suspend/flag accounts without deleting them.
    isAdmin: { type: Boolean, default: false },
    // Driver verification status — set to true when admin approves the driver's
    // documents. Unverified drivers cannot publish rides (enforced in createRide).
    isDriverVerified: { type: Boolean, default: false, index: true },
    adminRole: {
        type: String,
        enum: ["none", "super_admin", "moderator", "support"],
        default: "none",
    },
    status: {
        type: String,
        enum: ["active", "suspended", "flagged", "frozen"],
        default: "active",
        index: true,
    },
    statusReason: { type: String, default: "" },
    // -------- Ratings & reviews (denormalized aggregates) --------
    // Maintained by the review controller whenever a review is submitted, so
    // profiles/cards can read ratings without aggregating on every request.
    // `driver` reflects reviews received while driving; `passenger` reflects
    // reviews received as a passenger.
    ratings: {
        driver: {
            count: { type: Number, default: 0 },
            average: { type: Number, default: 0 },
            categories: {
                driving: { type: Number, default: 0 },
                punctuality: { type: Number, default: 0 },
                communication: { type: Number, default: 0 },
                vehicle: { type: Number, default: 0 },
            },
        },
        passenger: {
            count: { type: Number, default: 0 },
            average: { type: Number, default: 0 },
            categories: {
                punctuality: { type: Number, default: 0 },
                communication: { type: Number, default: 0 },
                behavior: { type: Number, default: 0 },
            },
        },
    },
    // -------- Payout details (driver) --------
    // Where a driver's withdrawals are sent. UPI is sufficient for the MVP;
    // bank details are future-ready. Never required at signup.
    payoutDetails: {
        upiId: { type: String, default: "" },
        bankAccountName: { type: String, default: "" },
        bankAccountNumber: { type: String, default: "" },
        bankIfsc: { type: String, default: "" },
    },
    // -------- Dispute stats (false-dispute protection) --------
    // Maintained as disputes resolve. Used to flag accounts for manual review
    // after repeated false (rejected) disputes. We never auto-ban.
    disputeStats: {
        total: { type: Number, default: 0 },
        resolved: { type: Number, default: 0 },
        false: { type: Number, default: 0 },   // disputes rejected on review
        flagged: { type: Boolean, default: false },
    },
    // -------- Archived chats --------
    // Counterpart user ids whose conversation this user has archived. Chat
    // conversations are keyed by the other user (merged across rides), so a
    // single entry archives the whole conversation with that person.
    archivedChats: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    }],
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);
