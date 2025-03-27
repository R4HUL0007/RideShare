const mongoose = require("mongoose");

const RideSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    role: {
        type: String,
        enum: ["Student", "Faculty"],
        required: true
    },
    gender_preference: {
        type: String,
        enum: ["Male", "Female", "Any"], // Fixed inconsistency (capitalized "Any")
        required: true
    },
    destination: {
        type: String,
        required: true
    },
    timing: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ["Available", "Booked", "Completed"],
        default: "Available"
    },
    seatsAvailable: {
        type: Number,
        required: true,
        default: 1  // Default seat count per ride
    },
    passengers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }]
}, { timestamps: true });

module.exports = mongoose.model("Ride", RideSchema);
