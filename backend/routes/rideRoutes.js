const express = require("express");
const { createRide, findRides, cancelRide, bookRide, completeRide, getRideHistory , getUserRides, deleteRide} = require("../controllers/rideController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createRide); // Create a ride (Host)
router.get("/", protect, findRides); // Find matching rides (Rider)
router.get("/user-rides", protect, getUserRides); // Get rides created by the user (Host)
router.delete("/:rideId", protect, deleteRide); // Delete a ride (Host)
router.post("/book/:rideId", protect, bookRide); // Book a ride (Rider)
router.delete("/cancel/:rideId", protect, cancelRide); // Cancel a ride (Host)
router.patch("/complete/:rideId", protect, completeRide); // Complete a ride (Host)
router.get("/history", protect, getRideHistory); // Get ride history (Host/Rider)

module.exports = router;
