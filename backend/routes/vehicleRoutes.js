const express = require("express");
const { 
    getUserVehicle,
    getUserVehicles, 
    createVehicle,
    updateVehicle, 
    deleteVehicle,
    getVehicleById
} = require("../controllers/vehicleController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, getUserVehicles); // Get all user vehicles
router.get("/single", protect, getUserVehicle); // Get single vehicle (backward compatibility)
router.post("/", protect, createVehicle); // Create new vehicle
router.put("/:vehicleId", protect, updateVehicle); // Update specific vehicle
router.delete("/:vehicleId", protect, deleteVehicle); // Delete specific vehicle
router.get("/:vehicleId", protect, getVehicleById); // Get vehicle by ID (auth required)

module.exports = router;

