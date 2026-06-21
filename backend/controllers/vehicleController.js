const mongoose = require("mongoose");
const Vehicle = require("../models/Vehicle");
const User = require("../models/User");
const { safeUrl } = require("../utils/sanitize");

// Get user's vehicles (all vehicles)
exports.getUserVehicles = async (req, res) => {
    const userId = req.user.id;

    try {
        const vehicles = await Vehicle.find({ user_id: userId }).sort({ createdAt: -1 });

        res.status(200).json(vehicles);
    } catch (error) {
        console.error("Error in getUserVehicles:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get user's vehicle (single - for backward compatibility)
exports.getUserVehicle = async (req, res) => {
    const userId = req.user.id;

    try {
        const vehicle = await Vehicle.findOne({ user_id: userId });

        if (!vehicle) {
            return res.status(404).json({ message: "No vehicle registered" });
        }

        res.status(200).json(vehicle);
    } catch (error) {
        console.error("Error in getUserVehicle:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Create new vehicle
exports.createVehicle = async (req, res) => {
    const userId = req.user.id;
    const vehicleData = { ...(req.body || {}) };

    // Mass-assignment guard: never let a client set server-managed fields. In
    // particular `isVerified` would let a driver self-verify a vehicle and skip
    // the admin verification gate used by createRide / personal-ride matching.
    delete vehicleData.isVerified;
    delete vehicleData.user_id;
    delete vehicleData._id;
    // Only store safe http(s) photo URLs (block javascript:/data: stored XSS).
    if (Array.isArray(vehicleData.photos)) {
        vehicleData.photos = vehicleData.photos.map((p) => safeUrl(p)).filter(Boolean);
    }

    try {
        // Create new vehicle
        const vehicle = await Vehicle.create({
            ...vehicleData,
            user_id: userId
        });
        
        return res.status(201).json({ 
            message: "Vehicle added successfully", 
            vehicle 
        });
    } catch (error) {
        console.error("Error in createVehicle:", error);
        
        if (error.name === "ValidationError") {
            const errorMessage = Object.values(error.errors).map((err) => err.message).join(", ");
            return res.status(400).json({ message: errorMessage });
        }

        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Update vehicle
exports.updateVehicle = async (req, res) => {
    const userId = req.user.id;
    const { vehicleId } = req.params;
    const vehicleData = req.body;

    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
        return res.status(400).json({ message: "Invalid vehicle id" });
    }

    try {
        const vehicle = await Vehicle.findOne({ _id: vehicleId, user_id: userId });

        if (!vehicle) {
            return res.status(404).json({ message: "Vehicle not found" });
        }

        // Never let a client set protected fields directly (privilege escalation).
        delete vehicleData.isVerified;
        delete vehicleData.user_id;
        delete vehicleData._id;
        if (Array.isArray(vehicleData.photos)) {
            vehicleData.photos = vehicleData.photos.map((p) => safeUrl(p)).filter(Boolean);
        }

        // If identity-defining fields change, the vehicle must be re-verified.
        const MATERIAL = ["make", "model", "vehicleType", "licensePlate", "year"];
        const materialChanged = MATERIAL.some(
            (k) => vehicleData[k] !== undefined && String(vehicleData[k]) !== String(vehicle[k] ?? "")
        );

        Object.assign(vehicle, vehicleData);
        if (materialChanged && vehicle.isVerified) {
            vehicle.isVerified = false;
        }
        await vehicle.save();
        
        return res.status(200).json({ 
            message: "Vehicle updated successfully", 
            vehicle 
        });
    } catch (error) {
        console.error("Error in updateVehicle:", error);
        
        if (error.name === "ValidationError") {
            const errorMessage = Object.values(error.errors).map((err) => err.message).join(", ");
            return res.status(400).json({ message: errorMessage });
        }

        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Delete vehicle
exports.deleteVehicle = async (req, res) => {
    const userId = req.user.id;
    const { vehicleId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
        return res.status(400).json({ message: "Invalid vehicle id" });
    }

    try {
        const vehicle = await Vehicle.findOne({ _id: vehicleId, user_id: userId });

        if (!vehicle) {
            return res.status(404).json({ message: "Vehicle not found" });
        }

        await Vehicle.findByIdAndDelete(vehicleId);
        res.status(200).json({ message: "Vehicle deleted successfully" });
    } catch (error) {
        console.error("Error in deleteVehicle:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get vehicle by ID (for displaying in ride details)
exports.getVehicleById = async (req, res) => {
    const { vehicleId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
        return res.status(400).json({ message: "Invalid vehicle id" });
    }

    try {
        // This endpoint is public (used in ride detail views). Do NOT expose the
        // owner's email or other PII — only the fields a rider needs to see.
        const vehicle = await Vehicle.findById(vehicleId).populate('user_id', 'name role isDriverVerified ratings');

        if (!vehicle) {
            return res.status(404).json({ message: "Vehicle not found" });
        }

        res.status(200).json(vehicle);
    } catch (error) {
        console.error("Error in getVehicleById:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

