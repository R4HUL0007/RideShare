const express = require("express");
const { createRide, findRides, cancelRide, bookRide, completeRide, getRideHistory , getUserRides, deleteRide, getMyBookings, removePassenger} = require("../controllers/rideController");
const { getTracking, startTracking, endTracking, updateLocation, confirmArrival } = require("../controllers/trackingController");
const { getVerification, checkIn, verifyCode, reportNoShow, getTimeline, resendOtp } = require("../controllers/checkinController");
const { protect } = require("../middleware/authMiddleware");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();

// Throttle ride creation (broadcasts to drivers) and search (each search pulls
// up to 300 candidates + runs CPU-bound route scoring) against abuse/floods.
const createLimiter = rateLimit({ key: "ride-create", windowMs: 60 * 1000, max: 20 });
const searchLimiter = rateLimit({ key: "ride-search", windowMs: 60 * 1000, max: 60 });

router.post("/", protect, createLimiter, createRide); // Create a ride (Host)
router.get("/", protect, searchLimiter, findRides); // Find matching rides (Rider)
router.get("/user-rides", protect, getUserRides); // Get rides created by the user (Host)
router.get("/my-bookings", protect, getMyBookings); // Get rides booked by the user (Rider)
// --- Live tracking (participants only; enforced in controller) ---
router.get("/:rideId/tracking", protect, getTracking);
router.post("/:rideId/tracking/start", protect, startTracking);
router.post("/:rideId/tracking/end", protect, endTracking);
router.post("/:rideId/tracking/arrived", protect, confirmArrival); // passenger confirms arrival (GPS fallback)
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
