const express = require("express");
const { createRide, findRides, cancelRide, bookRide, completeRide, getRideHistory , getUserRides, deleteRide, getMyBookings, removePassenger} = require("../controllers/rideController");
const { getTracking, startTracking, endTracking, updateLocation } = require("../controllers/trackingController");
const { getVerification, checkIn, verifyCode, reportNoShow, getTimeline, resendOtp } = require("../controllers/checkinController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createRide); // Create a ride (Host)
router.get("/", protect, findRides); // Find matching rides (Rider)
router.get("/user-rides", protect, getUserRides); // Get rides created by the user (Host)
router.get("/my-bookings", protect, getMyBookings); // Get rides booked by the user (Rider)
// --- Live tracking (participants only; enforced in controller) ---
router.get("/:rideId/tracking", protect, getTracking);
router.post("/:rideId/tracking/start", protect, startTracking);
router.post("/:rideId/tracking/end", protect, endTracking);
router.post("/:rideId/tracking/location", protect, updateLocation);
// --- Ride Check-In & Verification (participants only; enforced in controller) ---
router.get("/:rideId/verification", protect, getVerification);
router.post("/:rideId/checkin", protect, checkIn);
router.post("/:rideId/verify", protect, verifyCode);
router.post("/:rideId/otp/resend", protect, resendOtp);
router.post("/:rideId/no-show", protect, reportNoShow);
router.get("/:rideId/timeline", protect, getTimeline);
router.delete("/:rideId", protect, deleteRide); // Delete a ride (Host)
router.post("/book/:rideId", protect, bookRide); // Book a ride (Rider)
router.delete("/cancel/:rideId", protect, cancelRide); // Cancel a ride (Host)
router.patch("/complete/:rideId", protect, completeRide); // Complete a ride (Host)
router.delete("/:rideId/passenger/:passengerId", protect, removePassenger); // Remove a passenger (Captain only)
router.get("/history", protect, getRideHistory); // Get ride history (Host/Rider)

module.exports = router;
