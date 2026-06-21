const mongoose = require("mongoose");

const VehicleSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    vehicleType: {
        type: String,
        enum: ["Car", "Motorcycle", "Scooter", "Auto-rickshaw"],
        required: true
    },
    make: {
        type: String,
        required: true
    },
    model: {
        type: String,
        required: true
    },
    year: {
        type: Number,
        min: 1900,
        max: new Date().getFullYear() + 1
    },
    color: {
        type: String
    },
    licensePlate: {
        type: String
    },
    totalSeats: {
        type: Number,
        required: true,
        min: 1,
        max: 20
    },
    photos: [{
        type: String // URLs to images
    }],
    amenities: [{
        type: String,
        enum: ["AC Available", "Music System", "Charging Port", "Spacious", "Clean & Well Maintained"]
    }],
    drivingLicense: {
        type: String,
        required: true
    },
    experience: {
        type: Number,
        min: 0
    },
    preferredCommunication: {
        type: String,
        enum: ["WhatsApp", "Phone", "In-app"],
        default: "In-app"
    },
    isVerified: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model("Vehicle", VehicleSchema);

