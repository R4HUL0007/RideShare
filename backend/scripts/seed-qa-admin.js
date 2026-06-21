// Ensure a known-password QA super_admin exists so the E2E admin tests can
// authenticate. Idempotent (upsert). Targets the Dockerized Mongo by default.
//
//   node scripts/seed-qa-admin.js                 (from the backend folder)
//   QA_MONGO_URI=mongodb://localhost:27018/RIDESHARE node scripts/seed-qa-admin.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const URI = process.env.QA_MONGO_URI || "mongodb://localhost:27018/RIDESHARE";

(async () => {
    await mongoose.connect(URI);
    const email = "qa.admin@paruluniversity.ac.in";
    await User.findOneAndUpdate(
        { email },
        {
            $set: {
                name: "QA Admin", username: "qa_admin", email,
                password: await bcrypt.hash("Test@1234", 10),
                phoneNumber: "9000000000", role: "Faculty", gender: "Male",
                isVerified: true, authProvider: "local",
                isAdmin: true, adminRole: "super_admin", status: "active",
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log("QA admin ready:", email);
    await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
