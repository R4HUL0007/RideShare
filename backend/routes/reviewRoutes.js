const express = require("express");
const {
    submitReview,
    getUserReviews,
    getPendingReviews,
} = require("../controllers/reviewController");
const { protect } = require("../middleware/authMiddleware");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();

const reviewLimiter = rateLimit({ key: "review", windowMs: 60 * 1000, max: 20 });

// All review routes require authentication. Server-side checks further ensure a
// user can only review rides they participated in, can't review themselves, and
// can't submit duplicate reviews for the same ride/pair.

// Completed rides where the current user still owes a review.
router.get("/pending", protect, getPendingReviews);

// Reviews received by a given user (+ that user's rating aggregates).
router.get("/user/:userId", protect, getUserReviews);

// Submit a review for a participant of a completed ride.
router.post("/:rideId/:revieweeId", protect, reviewLimiter, submitReview);

module.exports = router;
