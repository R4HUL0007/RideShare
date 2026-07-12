const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const { sendOTPEmail } = require("../utils/emailService");
const { isSafeHttpUrl } = require("../utils/sanitize");
const { isApitxtEnabled, sendApitxtOtp } = require("../config/apitxt");
const { isMessageCentralEnabled, sendMcOtp, validateMcOtp } = require("../config/messageCentral");
const { phoneVerificationRequired, phoneChangeLockDays, phoneOtpMaxSends } = require("../utils/phoneGate");

// Public runtime config for the client (no auth, no secrets).
exports.getPublicConfig = (req, res) => {
    res.json({ requirePhoneVerification: phoneVerificationRequired() });
};

// Which SMS OTP provider to use: "messagecentral" (provider-managed OTP) or
// "apitxt" (self-managed OTP). Defaults to apitxt.
const phoneOtpProvider = () => (process.env.PHONE_OTP_PROVIDER || "apitxt").toLowerCase();
const RefreshToken = require("../models/RefreshToken");
const {
    signAccessToken, issueRefreshToken, setAuthCookies, clearAuthCookies,
    hashToken, readRefreshToken,
} = require("../utils/authTokens");

// Google OAuth client (token verification happens server-side).
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const REQUIRED_EMAIL_DOMAIN = "paruluniversity.ac.in";

// Max wrong OTP guesses before the code is invalidated (brute-force guard).
const OTP_MAX_ATTEMPTS = 5;

// Whether to also return the JWT in the response body. In PRODUCTION we don't —
// the app is same-origin behind nginx and authenticates via the httpOnly cookie
// only, so the token is never exposed to JS (XSS can't steal it). In dev/tunnel
// setups (cross-origin, where a sameSite cookie isn't sent) we return it so the
// client can fall back to an Authorization: Bearer header.
const exposeBodyToken = () => process.env.NODE_ENV !== "production";

// Standard auth payload shape (no secrets).
const publicUser = (user) => ({
    _id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    phoneVerified: user.phoneVerified || false,
});

// Issue a fresh session: a short-lived access token + a rotating refresh token,
// both set as httpOnly cookies. In dev (cross-origin tunnels where sameSite
// cookies aren't sent) the tokens are ALSO returned in the body so the client
// can fall back to headers; in production the body never carries tokens.
async function issueSession(req, res, user, message) {
    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user, { req });
    setAuthCookies(res, accessToken, refreshToken);
    return res.json({
        message,
        token: exposeBodyToken() ? accessToken : undefined,
        refreshToken: exposeBodyToken() ? refreshToken : undefined,
        user: publicUser(user),
    });
}

// Generate 6-digit OTP
const generateOTP = () => {
    return crypto.randomInt(100000, 1000000).toString();
};

// Store a HASHED OTP (never plaintext) + expiry, resetting the attempt counter.
const setOtpForUser = async (userId, otp, otpExpiry) => {
    const otpHash = await bcrypt.hash(otp, 10);
    await User.updateOne(
        { _id: userId },
        { $set: { otp: otpHash, otpExpiry, otpAttempts: 0 } }
    );
};

// Register User - Send OTP
exports.registerUser = async (req, res) => {
    let { name, username, email, password, phoneNumber, role, gender } = req.body;
    // Coerce identity fields to strings (defense in depth on top of the global
    // operator sanitizer) so query/string operations can't be subverted.
    email = email == null ? "" : String(email);
    username = username == null ? "" : String(username);

    try {
        // Validate phone number format (10 digits)
        if (phoneNumber && !/^\d{10}$/.test(phoneNumber)) {
            return res.status(400).json({ message: "Phone number must be 10 digits" });
        }

        // Enforce the university-domain rule up front. The account is only
        // created at OTP-verify time, so without this the user wouldn't learn
        // their email is ineligible until after entering the code.
        if (!email || !email.toLowerCase().endsWith(`@${REQUIRED_EMAIL_DOMAIN}`)) {
            return res.status(400).json({ message: `Please use your @${REQUIRED_EMAIL_DOMAIN} email address` });
        }

        // Validate password presence/strength up front. Hashing an undefined
        // password throws and surfaces as a confusing 500; a too-short one would
        // bypass the same rule enforced in changePassword.
        if (!password || password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        // Check if user exists by email or username
        const userExists = await User.findOne({ 
            $or: [{ email }, { username }] 
        });

        if (userExists) {
            if (userExists.email === email) {
                return res.status(400).json({ message: "Email already registered" });
            }
            if (userExists.username === username) {
                return res.status(400).json({ message: "Username already taken" });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = generateOTP();
        const otpHash = await bcrypt.hash(otp, 10);
        const OTP_TTL_SEC = 600; // 10 minutes

        // Do NOT create the account yet. Carry the registration data + a HASHED
        // OTP in a short-lived, signed "pending signup" token. The account is
        // created only after the OTP is confirmed at /verify-otp. This keeps
        // unverified accounts out of the database (mirrors the Google flow).
        const pendingToken = jwt.sign(
            {
                kind: "local_pending_signup",
                name,
                username,
                email,
                phoneNumber,
                role,
                gender,
                passwordHash: hashedPassword,
                otpHash,
            },
            process.env.JWT_SECRET,
            { expiresIn: OTP_TTL_SEC }
        );

        // Send OTP email (plaintext code — only the hash is carried in the token).
        await sendOTPEmail(email, otp, "verification");

        res.status(201).json({
            message: "Registration successful! Please check your email for verification code.",
            email,
            pendingToken,
            expiresInSec: OTP_TTL_SEC,
        });
    } catch (error) {
        console.error("Error in registerUser:", error);

        if (error.name === "ValidationError") {
            const errorMessage = Object.values(error.errors).map((err) => err.message).join(", ");
            return res.status(400).json({ message: errorMessage });
        }
        // A unique-index violation (race between the existence check and create).
        if (error.code === 11000) {
            return res.status(400).json({ message: "Email or username is already registered." });
        }

        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {
    const { otp, pendingToken } = req.body;
    const email = req.body.email == null ? "" : String(req.body.email);

    try {
        // ---- New flow: pending-signup token (account not yet in the DB) ----
        if (pendingToken) {
            let pending;
            try {
                pending = jwt.verify(pendingToken, process.env.JWT_SECRET);
            } catch (err) {
                return res.status(400).json({ message: "Your sign-up session expired. Please register again." });
            }
            if (pending.kind !== "local_pending_signup") {
                return res.status(400).json({ message: "Invalid sign-up session" });
            }

            const otpMatches = await bcrypt.compare(String(otp || ""), pending.otpHash);
            if (!otpMatches) {
                return res.status(400).json({ message: "Invalid OTP" });
            }

            // Race guard: ensure the email/username weren't taken meanwhile.
            const existing = await User.findOne({
                $or: [{ email: pending.email }, { username: pending.username }],
            });
            if (existing) {
                if (existing.email === pending.email) {
                    return res.status(400).json({ message: "Email already registered" });
                }
                return res.status(400).json({ message: "Username already taken" });
            }

            // Create the verified account NOW (password already hashed at register).
            const user = await User.create({
                name: pending.name,
                username: pending.username,
                email: pending.email,
                password: pending.passwordHash,
                phoneNumber: pending.phoneNumber,
                role: pending.role,
                gender: pending.gender,
                isVerified: true,
            });

            return issueSession(req, res, user, "Email verified successfully!");
        }

        // ---- Legacy flow: account already exists in the DB (pre-migration) ----
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.isVerified) {
            return res.status(400).json({ message: "Email already verified" });
        }

        if (!user.otp || !user.otpExpiry) {
            return res.status(400).json({ message: "No OTP found. Please register again." });
        }

        if (new Date() > user.otpExpiry) {
            return res.status(400).json({ message: "OTP has expired. Please request a new one." });
        }

        const otpOk = await bcrypt.compare(String(otp || ""), user.otp);
        if (!otpOk) {
            const attempts = (user.otpAttempts || 0) + 1;
            if (attempts >= OTP_MAX_ATTEMPTS) {
                // Invalidate the code after too many wrong guesses (brute-force guard).
                await User.updateOne({ _id: user._id }, { $unset: { otp: "", otpExpiry: "" }, $set: { otpAttempts: 0 } });
                return res.status(429).json({ message: "Too many incorrect attempts. Please request a new code." });
            }
            await User.updateOne({ _id: user._id }, { $set: { otpAttempts: attempts } });
            return res.status(400).json({ message: "Invalid OTP" });
        }

        // Verify user
        await User.updateOne(
            { _id: user._id },
            {
                $set: { isVerified: true },
                $unset: { otp: "", otpExpiry: "", otpAttempts: "" }
            }
        );

        // Issue the session (access + rotating refresh cookies).
        return issueSession(req, res, user, "Email verified successfully!");
    } catch (error) {
        console.error("Error in verifyOTP:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Resend OTP
exports.resendOTP = async (req, res) => {
    const { pendingToken } = req.body;
    const email = req.body.email == null ? "" : String(req.body.email);

    try {
        // ---- New flow: re-issue a fresh OTP + pending token (no DB account) ----
        if (pendingToken) {
            let pending;
            try {
                // Allow resending even if the previous token has just expired —
                // the signature is still validated, only the exp claim is ignored.
                pending = jwt.verify(pendingToken, process.env.JWT_SECRET, { ignoreExpiration: true });
            } catch (err) {
                return res.status(400).json({ message: "Your sign-up session is invalid. Please register again." });
            }
            if (pending.kind !== "local_pending_signup") {
                return res.status(400).json({ message: "Invalid sign-up session" });
            }

            const otp = generateOTP();
            const otpHash = await bcrypt.hash(otp, 10);
            const OTP_TTL_SEC = 600; // 10 minutes

            const freshToken = jwt.sign(
                {
                    kind: "local_pending_signup",
                    name: pending.name,
                    username: pending.username,
                    email: pending.email,
                    phoneNumber: pending.phoneNumber,
                    role: pending.role,
                    gender: pending.gender,
                    passwordHash: pending.passwordHash,
                    otpHash,
                },
                process.env.JWT_SECRET,
                { expiresIn: OTP_TTL_SEC }
            );

            await sendOTPEmail(pending.email, otp, "verification");

            return res.json({
                message: "OTP sent successfully to your email",
                pendingToken: freshToken,
                expiresInSec: OTP_TTL_SEC,
            });
        }

        // ---- Legacy flow: account already exists in the DB ----
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.isVerified) {
            return res.status(400).json({ message: "Email already verified" });
        }

        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await setOtpForUser(user._id, otp, otpExpiry);

        await sendOTPEmail(email, otp, "verification");

        res.json({ message: "OTP sent successfully to your email" });
    } catch (error) {
        console.error("Error in resendOTP:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Login User - Check verification and use httpOnly cookies
exports.loginUser = async (req, res) => {
    const { password } = req.body;
    const email = req.body.email == null ? "" : String(req.body.email);

    try {
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const user = await User.findOne({ email });
        // Generic message for both "no user" and "Google account (no password)"
        // so login can't enumerate accounts or crash on a missing password hash.
        if (!user || !user.password) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        // Check if email is verified
        if (!user.isVerified) {
            return res.status(403).json({ 
                message: "Please verify your email before logging in. Check your email for the verification code." 
            });
        }

        // Issue the session (access + rotating refresh cookies).
        return issueSession(req, res, user, "Login successful");
    } catch (error) {
        console.error("Error in loginUser:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Forgot Password - Send OTP
exports.forgotPassword = async (req, res) => {
    const email = req.body.email == null ? "" : String(req.body.email);

    try {
        const user = await User.findOne({ email });
        // Respond with the SAME generic message whether the account is missing or
        // unverified, so this endpoint can't be used to enumerate registered
        // emails. Only a verified account actually gets an OTP.
        if (!user || !user.isVerified) {
            return res.json({ message: "If the email exists, an OTP has been sent" });
        }

        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await setOtpForUser(user._id, otp, otpExpiry);

        await sendOTPEmail(email, otp, "reset");

        res.json({ message: "If the email exists, an OTP has been sent" });
    } catch (error) {
        console.error("Error in forgotPassword:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Reset Password - Verify OTP and reset
exports.resetPassword = async (req, res) => {
    const { otp, newPassword } = req.body;
    const email = req.body.email == null ? "" : String(req.body.email);

    try {
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: "New password must be at least 6 characters" });
        }

        const user = await User.findOne({ email });
        // Uniform response whether the email is unknown or simply has no active
        // OTP, so resetPassword can't be used to enumerate registered accounts.
        if (!user || !user.otp || !user.otpExpiry) {
            return res.status(400).json({ message: "Invalid or expired code. Please request a new one." });
        }

        if (new Date() > user.otpExpiry) {
            return res.status(400).json({ message: "OTP has expired. Please request a new one." });
        }

        const otpOk = await bcrypt.compare(String(otp || ""), user.otp);
        if (!otpOk) {
            const attempts = (user.otpAttempts || 0) + 1;
            if (attempts >= OTP_MAX_ATTEMPTS) {
                await User.updateOne({ _id: user._id }, { $unset: { otp: "", otpExpiry: "" }, $set: { otpAttempts: 0 } });
                return res.status(429).json({ message: "Too many incorrect attempts. Please request a new code." });
            }
            await User.updateOne({ _id: user._id }, { $set: { otpAttempts: attempts } });
            return res.status(400).json({ message: "Invalid OTP" });
        }

        // Reset password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await User.updateOne(
            { _id: user._id },
            {
                $set: { password: hashedPassword },
                $unset: { otp: "", otpExpiry: "", otpAttempts: "" }
            }
        );

        res.json({ message: "Password reset successfully! You can now login with your new password." });
    } catch (error) {
        console.error("Error in resetPassword:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Google sign-in reuses the same session issuer so the response shape and the
// access+refresh cookie behavior match verifyOTP/loginUser exactly.
const issueAuthResponse = (req, res, user, message) => issueSession(req, res, user, message);

// Google Sign-In / Sign-Up
// Verifies the Google ID token server-side, enforces the university email
// domain, logs in existing users, and either creates a new user (when the
// profile fields are supplied) or signals the client to collect them.
exports.googleAuth = async (req, res) => {
    const { credential, profile } = req.body;

    try {
        if (!process.env.GOOGLE_CLIENT_ID) {
            return res.status(503).json({ message: "Google sign-in is not configured on the server" });
        }
        if (!credential) {
            return res.status(400).json({ message: "Missing Google credential" });
        }

        // 1. Verify the ID token with Google (never trust the client).
        let payload;
        try {
            const ticket = await googleClient.verifyIdToken({
                idToken: credential,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            payload = ticket.getPayload();
        } catch (err) {
            return res.status(401).json({ message: "Invalid or expired Google token" });
        }

        const email = (payload.email || "").toLowerCase();
        const emailVerified = payload.email_verified;
        const googleId = payload.sub;
        const googleName = payload.name || "";

        if (!email || !emailVerified) {
            return res.status(400).json({ message: "Google account email is not verified" });
        }

        // 2. Enforce the same university-domain rule as the User model.
        if (!email.endsWith(`@${REQUIRED_EMAIL_DOMAIN}`)) {
            return res.status(403).json({ message: `Please use your @${REQUIRED_EMAIL_DOMAIN} Google account` });
        }

        // 3. Existing user.
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            // 3a. Already verified → log straight in (link Google if needed).
            if (existingUser.isVerified) {
                if (!existingUser.googleId) {
                    await User.updateOne({ _id: existingUser._id }, { $set: { googleId } });
                    existingUser.googleId = googleId;
                }
                return issueAuthResponse(req, res, existingUser, "Login successful");
            }

            // 3b. Exists but NOT verified (a legacy/abandoned signup row) →
            //     (re)send OTP and resume the standard verification step, which
            //     finalizes via the existing /verify-otp endpoint. No pending
            //     token here: the account row already exists.
            const otp = generateOTP();
            const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
            // Store the OTP HASHED (verifyOTP compares with bcrypt) and reset the
            // attempt counter. Storing it raw here made the emailed code never
            // validate, locking the user out of this verification path.
            const otpHash = await bcrypt.hash(otp, 10);
            const updates = { otp: otpHash, otpExpiry, otpAttempts: 0 };
            // Only attach the Google identity to an account that is already a
            // Google account; never silently take over a pending local signup.
            if (!existingUser.googleId && existingUser.authProvider === "google") {
                updates.googleId = googleId;
            }
            await User.updateOne({ _id: existingUser._id }, { $set: updates });
            await sendOTPEmail(email, otp, "verification");

            return res.status(200).json({
                needsOtp: true,
                email,
                message: "Verification code sent to your email.",
            });
        }

        // 4. New user. We need role / gender / phone (not provided by Google).
        //    If the client hasn't collected them yet, ask it to.
        const { username, role, gender, phoneNumber } = profile || {};
        if (!role || !gender || !phoneNumber || !username) {
            return res.status(200).json({
                needsProfile: true,
                message: "Additional details required to complete sign-up",
                prefill: { name: googleName, email },
            });
        }

        // 5. Validate the supplied profile (mirror registerUser rules).
        if (!/^\d{10}$/.test(phoneNumber)) {
            return res.status(400).json({ message: "Phone number must be 10 digits" });
        }
        const usernameTaken = await User.findOne({ username });
        if (usernameTaken) {
            return res.status(400).json({ message: "Username already taken" });
        }

        // 6. Do NOT create the account yet. Email an OTP and hand the client a
        //    short-lived, signed "pending signup" token that carries the verified
        //    Google identity, the chosen profile, and a HASHED OTP. The account
        //    is created only after the OTP is confirmed at /google/verify.
        const otp = generateOTP();
        const otpHash = await bcrypt.hash(otp, 10);
        const OTP_TTL_SEC = 180; // 3 minutes

        const pendingToken = jwt.sign(
            {
                kind: "google_pending_signup",
                googleId,
                email,
                name: googleName || username,
                username,
                phoneNumber,
                role,
                gender,
                otpHash,
            },
            process.env.JWT_SECRET,
            { expiresIn: OTP_TTL_SEC }
        );

        await sendOTPEmail(email, otp, "verification");

        return res.status(200).json({
            needsOtp: true,
            email,
            pendingToken,
            expiresInSec: OTP_TTL_SEC,
            message: "Verification code sent to your email.",
        });
    } catch (error) {
        console.error("Error in googleAuth:", error);
        if (error.name === "ValidationError") {
            const errorMessage = Object.values(error.errors).map((e) => e.message).join(", ");
            return res.status(400).json({ message: errorMessage });
        }
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Verify the OTP for a pending Google signup, then CREATE the account.
// This is the only place a Google account is created — strictly after OTP.
exports.verifyGoogleSignup = async (req, res) => {
    const { pendingToken, otp } = req.body;

    try {
        if (!pendingToken || !otp) {
            return res.status(400).json({ message: "Missing verification details" });
        }

        // 1. Decode + validate the signed pending-signup token.
        let pending;
        try {
            pending = jwt.verify(pendingToken, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(400).json({ message: "Your sign-up session expired. Please start again." });
        }
        if (pending.kind !== "google_pending_signup") {
            return res.status(400).json({ message: "Invalid sign-up session" });
        }

        // 2. Check the OTP against the hash embedded in the token.
        const otpMatches = await bcrypt.compare(String(otp), pending.otpHash);
        if (!otpMatches) {
            return res.status(400).json({ message: "Invalid OTP" });
        }

        // 3. Guard against a race: make sure the account wasn't created meanwhile.
        const existing = await User.findOne({
            $or: [{ email: pending.email }, { username: pending.username }],
        });
        if (existing) {
            if (existing.email === pending.email && existing.isVerified) {
                // Already created & verified → just log them in.
                return issueAuthResponse(req, res, existing, "Login successful");
            }
            if (existing.username === pending.username && existing.email !== pending.email) {
                return res.status(400).json({ message: "Username already taken" });
            }
        }

        // 4. Create the verified Google account now (no password).
        const user = await User.create({
            name: pending.name,
            username: pending.username,
            email: pending.email,
            authProvider: "google",
            googleId: pending.googleId,
            phoneNumber: pending.phoneNumber,
            role: pending.role,
            gender: pending.gender,
            isVerified: true,
        });

        return issueAuthResponse(req, res, user, "Account created successfully");
    } catch (error) {
        console.error("Error in verifyGoogleSignup:", error);
        if (error.name === "ValidationError") {
            const errorMessage = Object.values(error.errors).map((e) => e.message).join(", ");
            return res.status(400).json({ message: errorMessage });
        }
        // Unique-index violation (a concurrent signup created the account first).
        if (error.code === 11000) {
            return res.status(409).json({ message: "An account with these details already exists. Please log in." });
        }
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get current user
// Compute when a verified phone number becomes changeable again (or null if it
// isn't verified / the lock is disabled / already elapsed).
const phoneChangeUnlockAt = (user) => {
    const lockDays = phoneChangeLockDays();
    if (!user.phoneVerified || !user.phoneVerifiedAt || lockDays <= 0) return null;
    const unlock = new Date(new Date(user.phoneVerifiedAt).getTime() + lockDays * 24 * 60 * 60 * 1000);
    return unlock.getTime() > Date.now() ? unlock : null;
};

exports.getCurrentUser = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-password");
        res.json({
            _id: user.id,
            name: user.name,
            username: user.username,
            email: user.email,
            phoneNumber: user.phoneNumber,
            phoneVerified: user.phoneVerified || false,
            phoneVerifiedAt: user.phoneVerifiedAt || null,
            phoneChangeUnlockAt: phoneChangeUnlockAt(user),
            role: user.role,
            gender: user.gender,
            authProvider: user.authProvider,
            profilePicture: user.profilePicture || "",
            notificationPrefs: user.notificationPrefs || { email: true, rideUpdates: true, promotions: false },
            ratings: user.ratings,
            isVerified: user.isVerified || false,
            isAdmin: user.isAdmin || false,
            isDriverVerified: user.isDriverVerified || false,
            adminRole: user.adminRole || "none",
            status: user.status || "active",
            createdAt: user.createdAt,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Public user shape returned after a phone-verify state change.
const publicPhoneUser = (user) => ({
    _id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    phoneNumber: user.phoneNumber,
    phoneVerified: user.phoneVerified || false,
    phoneVerifiedAt: user.phoneVerifiedAt || null,
    phoneChangeUnlockAt: phoneChangeUnlockAt(user),
    role: user.role,
    gender: user.gender,
    authProvider: user.authProvider,
    profilePicture: user.profilePicture || "",
    notificationPrefs: user.notificationPrefs,
    createdAt: user.createdAt,
});

// Step 1: send a phone-verification OTP over SMS. The OTP is NEVER logged or
// returned to the client — only delivered by SMS. Two provider modes:
//   - "messagecentral": the provider generates + delivers the code; we store its
//     verificationId to validate against later.
//   - "apitxt": we generate the code (hashed + short expiry) and APITxT delivers it.
exports.sendPhoneOtp = async (req, res) => {
    const provider = phoneOtpProvider();

    try {
        const enabled = provider === "messagecentral" ? isMessageCentralEnabled() : isApitxtEnabled();
        if (!enabled) {
            return res.status(503).json({ message: "Phone verification is not configured on the server" });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "User not found" });
        if (user.phoneVerified) {
            return res.status(400).json({ message: "Your phone is already verified" });
        }

        const digits = (user.phoneNumber || "").replace(/\D/g, "");
        if (!/^\d{10}$/.test(digits)) {
            return res.status(400).json({ message: "Add a valid 10-digit phone number first." });
        }

        // Per-user resend cap for the current verification cycle (protects SMS
        // credits from abuse; the IP rate limiter is the first layer). Reset on
        // successful verification and on phone-number change.
        const maxSends = phoneOtpMaxSends();
        if ((user.phoneOtpSendCount || 0) >= maxSends) {
            return res.status(429).json({
                message: "You've reached the code request limit. Please try again later.",
                code: "OTP_SEND_LIMIT",
            });
        }

        const expiryMin = Number(process.env.PHONE_OTP_EXPIRY_MINUTES) || 3;
        const expiry = new Date(Date.now() + expiryMin * 60 * 1000);

        // Provider-managed send (Message Central generates + delivers the OTP).
        const sendViaMc = async () => {
            const { verificationId } = await sendMcOtp(digits, "91");
            user.phoneVerificationId = verificationId;
            user.phoneOtp = undefined;           // ensure only one provider's state is set
            user.phoneOtpAttempts = 0;
            user.phoneOtpExpiry = expiry;
            user.phoneOtpSendCount = (user.phoneOtpSendCount || 0) + 1;
            await user.save();
        };
        // Self-managed send (we generate + hash the OTP; APITxT delivers it).
        const sendViaApitxt = async () => {
            const otp = generateOTP();
            const otpHash = await bcrypt.hash(otp, 10);
            user.phoneOtp = otpHash;
            user.phoneVerificationId = undefined; // ensure only one provider's state is set
            user.phoneOtpExpiry = expiry;
            user.phoneOtpAttempts = 0;
            user.phoneOtpSendCount = (user.phoneOtpSendCount || 0) + 1;
            await user.save();
            await sendApitxtOtp(`91${digits}`, otp);
        };

        if (provider === "messagecentral" && isMessageCentralEnabled()) {
            try {
                await sendViaMc();
            } catch (err) {
                console.error("Message Central OTP send failed:", err?.details || err.message);
                // Auto-fallback to APITxT when available (e.g. MC credits exhausted).
                if (isApitxtEnabled()) {
                    try {
                        await sendViaApitxt();
                        console.warn("Phone OTP: fell back to APITxT after Message Central failure.");
                    } catch (err2) {
                        console.error("APITxT fallback send failed:", err2?.details || err2.message);
                        return res.status(502).json({ message: "Couldn't send the code. Please try again." });
                    }
                } else {
                    return res.status(502).json({ message: "Couldn't send the code. Please try again." });
                }
            }
        } else {
            // APITxT primary (or MC not configured).
            try {
                await sendViaApitxt();
            } catch (err) {
                console.error("APITxT OTP send failed:", err?.details || err.message);
                return res.status(502).json({ message: "Couldn't send the code. Please try again." });
            }
        }

        return res.json({
            message: "Verification code sent via SMS.",
            expiresInMin: expiryMin,
            sendsLeft: Math.max(0, maxSends - (user.phoneOtpSendCount || 0)),
        });
    } catch (error) {
        console.error("Error in sendPhoneOtp:", error?.message || error);
        return res.status(502).json({ message: "Couldn't send the code. Please try again." });
    }
};

// Step 2: verify the OTP the user entered and, on success, mark phone verified.
exports.verifyPhone = async (req, res) => {
    const { otp } = req.body;

    try {
        const user = await User.findById(req.user.id).select("-password");
        if (!user) return res.status(404).json({ message: "User not found" });
        if (user.phoneVerified) {
            return res.json({ message: "Your phone is already verified", user: publicPhoneUser(user) });
        }
        if (!/^\d{4,8}$/.test(String(otp || ""))) {
            return res.status(400).json({ message: "Enter the code from the SMS." });
        }

        // Branch on which provider actually sent the current code (robust to the
        // auto-fallback): a stored verificationId → Message Central; otherwise a
        // stored hash → APITxT.
        if (user.phoneVerificationId) {
            // Provider-managed: validate the code against the stored verificationId.
            let result;
            try {
                result = await validateMcOtp(user.phoneVerificationId, otp);
            } catch (err) {
                console.error("Message Central validate failed:", err?.details || err.message);
                return res.status(502).json({ message: "Verification failed. Please try again." });
            }
            if (!result.ok) {
                // Wrong/expired code — let the user retry (or resend).
                return res.status(400).json({ message: "Invalid or expired code. Please try again." });
            }
            user.phoneVerified = true;
            user.phoneVerifiedAt = new Date();
            user.phoneVerificationId = undefined;
            user.phoneOtpExpiry = undefined;
            user.phoneOtpSendCount = 0;
            await user.save();
            return res.json({ message: "Phone number verified successfully!", user: publicPhoneUser(user) });
        }

        // Self-managed (APITxT): compare against our stored hash.
        if (!user.phoneOtp || !user.phoneOtpExpiry) {
            return res.status(400).json({ message: "No code requested. Please request a code first." });
        }
        if (new Date() > user.phoneOtpExpiry) {
            return res.status(400).json({ message: "Code expired. Please resend." });
        }

        const ok = await bcrypt.compare(String(otp || ""), user.phoneOtp);
        if (!ok) {
            const attempts = (user.phoneOtpAttempts || 0) + 1;
            if (attempts >= OTP_MAX_ATTEMPTS) {
                user.phoneOtp = undefined;
                user.phoneOtpExpiry = undefined;
                user.phoneOtpAttempts = 0;
                await user.save();
                return res.status(429).json({ message: "Too many incorrect attempts. Please request a new code." });
            }
            user.phoneOtpAttempts = attempts;
            await user.save();
            return res.status(400).json({ message: "Invalid OTP" });
        }

        user.phoneVerified = true;
        user.phoneVerifiedAt = new Date();
        user.phoneOtp = undefined;
        user.phoneOtpExpiry = undefined;
        user.phoneOtpAttempts = 0;
        user.phoneOtpSendCount = 0;
        await user.save();

        return res.json({ message: "Phone number verified successfully!", user: publicPhoneUser(user) });
    } catch (error) {
        console.error("Error in verifyPhone:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Update profile (name, phoneNumber, gender, profilePicture).
// Email, username, and role are intentionally NOT editable here to preserve
// account identity and the role-based architecture.
exports.updateProfile = async (req, res) => {
    const { name, phoneNumber, gender, profilePicture } = req.body;

    try {
        const updates = {};

        if (name !== undefined) {
            if (!name.trim()) return res.status(400).json({ message: "Name cannot be empty" });
            updates.name = name.trim();
        }
        if (phoneNumber !== undefined) {
            if (!/^\d{10}$/.test(phoneNumber)) {
                return res.status(400).json({ message: "Phone number must be 10 digits" });
            }
            const current = await User.findById(req.user.id).select("phoneNumber phoneVerified phoneVerifiedAt");
            const isChange = current && current.phoneNumber !== phoneNumber;

            if (isChange) {
                // Lock-in: a verified number can't be changed until the lock window
                // has elapsed (anti OTP-spam: stops change→re-verify loops).
                const lockDays = phoneChangeLockDays();
                if (current.phoneVerified && current.phoneVerifiedAt && lockDays > 0) {
                    const unlockAt = new Date(new Date(current.phoneVerifiedAt).getTime() + lockDays * 24 * 60 * 60 * 1000);
                    if (Date.now() < unlockAt.getTime()) {
                        return res.status(403).json({
                            message: `Your verified phone number is locked. You can change it after ${unlockAt.toDateString()}.`,
                            code: "PHONE_CHANGE_LOCKED",
                            unlockAt,
                        });
                    }
                }
                updates.phoneNumber = phoneNumber;
                // New number is unproven — reset verification state + resend counter.
                updates.phoneVerified = false;
                updates.phoneVerifiedAt = null;
                updates.phoneOtpSendCount = 0;
            } else {
                updates.phoneNumber = phoneNumber; // no-op / same value
            }
        }
        if (gender !== undefined) {
            if (!["Male", "Female"].includes(gender)) {
                return res.status(400).json({ message: "Invalid gender" });
            }
            updates.gender = gender;
        }
        if (profilePicture !== undefined) {
            if (profilePicture && !isSafeHttpUrl(profilePicture)) {
                return res.status(400).json({ message: "Invalid profile picture URL" });
            }
            updates.profilePicture = profilePicture || ""; // hosted http(s) URL only
        }

        const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true }).select("-password");

        res.json({
            message: "Profile updated successfully",
            user: {
                _id: user.id,
                name: user.name,
                username: user.username,
                email: user.email,
                phoneNumber: user.phoneNumber,
                phoneVerified: user.phoneVerified || false,
                phoneVerifiedAt: user.phoneVerifiedAt || null,
                phoneChangeUnlockAt: phoneChangeUnlockAt(user),
                role: user.role,
                gender: user.gender,
                authProvider: user.authProvider,
                profilePicture: user.profilePicture || "",
                notificationPrefs: user.notificationPrefs,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        console.error("Error in updateProfile:", error);
        if (error.name === "ValidationError") {
            const msg = Object.values(error.errors).map((e) => e.message).join(", ");
            return res.status(400).json({ message: msg });
        }
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Change password for a logged-in user (local accounts only).
exports.changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        // Google-only accounts have no password to change.
        if (user.authProvider !== "local") {
            return res.status(400).json({ message: "Password change is not available for Google accounts" });
        }

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: "Current and new password are required" });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: "New password must be at least 6 characters" });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Current password is incorrect" });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.json({ message: "Password changed successfully" });
    } catch (error) {
        console.error("Error in changePassword:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Update notification preferences.
exports.updateNotificationPrefs = async (req, res) => {
    const { email, rideUpdates, promotions } = req.body;

    try {
        const prefs = {};
        if (typeof email === "boolean") prefs["notificationPrefs.email"] = email;
        if (typeof rideUpdates === "boolean") prefs["notificationPrefs.rideUpdates"] = rideUpdates;
        if (typeof promotions === "boolean") prefs["notificationPrefs.promotions"] = promotions;

        const user = await User.findByIdAndUpdate(req.user.id, { $set: prefs }, { new: true }).select("-password");

        res.json({
            message: "Preferences updated",
            notificationPrefs: user.notificationPrefs,
        });
    } catch (error) {
        console.error("Error in updateNotificationPrefs:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Logout - revoke the presented refresh token + clear all auth cookies.
exports.logoutUser = async (req, res) => {
    try {
        const presented = readRefreshToken(req);
        if (presented) {
            // Delete just this device's refresh token (other sessions stay alive).
            await RefreshToken.deleteOne({ tokenHash: hashToken(presented) }).catch(() => {});
        }
    } catch { /* non-fatal — still clear cookies below */ }
    clearAuthCookies(res);
    res.json({ message: "Logged out successfully" });
};

/**
 * POST /api/auth/refresh
 * Exchange a valid refresh token for a NEW access token + a NEW refresh token
 * (rotation). The old refresh token is revoked. If a token that was already
 * revoked is presented (replay/theft), the entire token family is revoked.
 */
exports.refreshSession = async (req, res) => {
    const presented = readRefreshToken(req);
    if (!presented) return res.status(401).json({ message: "No active session." });

    try {
        const tokenHash = hashToken(presented);
        const existing = await RefreshToken.findOne({ tokenHash });

        // Unknown token → not a valid session.
        if (!existing) {
            clearAuthCookies(res);
            return res.status(401).json({ message: "Session invalid. Please log in again." });
        }

        // Reuse detection: a revoked token being presented again means it was
        // stolen/replayed. Revoke the whole family and force re-login.
        if (existing.revokedAt) {
            await RefreshToken.updateMany(
                { family: existing.family, revokedAt: null },
                { $set: { revokedAt: new Date() } }
            );
            clearAuthCookies(res);
            return res.status(401).json({ message: "Session expired. Please log in again." });
        }

        if (existing.expiresAt <= new Date()) {
            clearAuthCookies(res);
            return res.status(401).json({ message: "Session expired. Please log in again." });
        }

        // The account must still exist and be allowed on the platform.
        const user = await User.findById(existing.user_id);
        if (!user || !user.isVerified || user.status === "suspended" || user.status === "frozen") {
            await RefreshToken.updateMany({ family: existing.family }, { $set: { revokedAt: new Date() } });
            clearAuthCookies(res);
            return res.status(401).json({ message: "Account unavailable. Please log in again." });
        }

        // Rotate: issue a new refresh token in the SAME family, revoke the old.
        const newRefresh = await issueRefreshToken(user, { family: existing.family, req });
        existing.revokedAt = new Date();
        existing.replacedByHash = hashToken(newRefresh);
        await existing.save();

        const accessToken = signAccessToken(user);
        setAuthCookies(res, accessToken, newRefresh);

        return res.json({
            message: "Session refreshed",
            token: exposeBodyToken() ? accessToken : undefined,
            refreshToken: exposeBodyToken() ? newRefresh : undefined,
            user: publicUser(user),
        });
    } catch (error) {
        console.error("Error in refreshSession:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};
