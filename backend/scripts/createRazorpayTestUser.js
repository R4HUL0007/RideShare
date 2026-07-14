/**
 * Creates (or resets) a TEST USER for Razorpay verification.
 *
 * Razorpay's reviewers log into the live site with these credentials to inspect
 * the checkout flow. The account is a NORMAL user (no admin perms) because
 * payments happen on the passenger booking flow, not the admin panel.
 *
 * We insert via the native driver to bypass the Mongoose @paruluniversity.ac.in
 * email validator (login itself doesn't enforce the domain). The account is
 * pre-verified (isVerified + phoneVerified) so it can log in and book instantly.
 *
 * Usage (from backend/):
 *   node scripts/createRazorpayTestUser.js "<MONGO_URI>"
 * If no URI arg is passed, falls back to process.env.MONGO_URI.
 */
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const MONGO_URI = process.argv[2] || process.env.MONGO_URI;

// ---- Test account details (must match what you give Razorpay) ----
const TEST_EMAIL = "testuser@ridexshare.online";
const TEST_PASSWORD = "Test@1234";
const TEST_NAME = "Razorpay Test User";
const TEST_USERNAME = "razorpay_test";
const TEST_PHONE = "9999999999";

async function main() {
    if (!MONGO_URI) {
        console.error("ERROR: No Mongo URI. Pass it as an argument or set MONGO_URI.");
        process.exit(1);
    }

    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const users = mongoose.connection.collection("users");
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

    const doc = {
        name: TEST_NAME,
        username: TEST_USERNAME,
        email: TEST_EMAIL,
        password: passwordHash,
        authProvider: "local",
        phoneNumber: TEST_PHONE,
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
        role: "Student",
        gender: "Male",
        isVerified: true,
        isAdmin: false,
        adminRole: "none",
        status: "active",
        notificationPrefs: { email: true, rideUpdates: true, promotions: false },
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // Upsert on email so re-running just resets the password/flags.
    const result = await users.updateOne(
        { email: TEST_EMAIL },
        { $set: doc },
        { upsert: true }
    );

    if (result.upsertedCount) {
        console.log(`Created test user: ${TEST_EMAIL}`);
    } else {
        console.log(`Updated existing test user: ${TEST_EMAIL}`);
    }
    console.log(`   Password: ${TEST_PASSWORD}`);
    console.log(`   Role: Student (normal user, NOT admin)`);

    await mongoose.disconnect();
    console.log("Done.");
    process.exit(0);
}

main().catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
});
