const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, match: [/^.+@paruluniversity\.ac\.in$/, "Invalid email domain"] },
    password: { type: String, required: true },
    role: { type: String, enum: ["Student", "Faculty"], required: true },
    gender: { type: String, enum: ["Male", "Female"], required: true },
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);
