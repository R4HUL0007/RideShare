const express = require("express");
const admin = require("../controllers/adminController");
const { protect } = require("../middleware/authMiddleware");
const { requireAdmin, requireAdminRole } = require("../middleware/adminMiddleware");

const router = express.Router();

// EVERY admin route is gated by protect (valid JWT) + requireAdmin (admin role).
// This is the security boundary that keeps admin APIs off-limits to users.
router.use(protect, requireAdmin);

// Financial / destructive actions are restricted to super_admins only.
const superOnly = requireAdminRole("super_admin");

// Dashboard / analytics / notifications
router.get("/dashboard", admin.getDashboard);
router.get("/analytics", admin.getAnalytics);
router.get("/notifications", admin.getAdminNotifications);
router.get("/badges", admin.getAdminBadges);
router.get("/live", admin.liveMonitoring);
router.get("/rides/:rideId/live", admin.liveRideDetail);
router.get("/audit-logs", admin.listAuditLogs);

// Users
router.get("/users", admin.listUsers);
router.get("/users/:id", admin.getUserDetail);
router.patch("/users/:id/status", admin.updateUserStatus);
router.patch("/users/:id/role", superOnly, admin.updateUserRole);
router.delete("/users/:id", superOnly, admin.deleteUser);

// Rides + bookings
router.get("/rides", admin.listRides);
router.get("/rides/unpaid", admin.listUnpaidRides);
router.post("/rides/:id/cancel", admin.cancelRide);
router.get("/bookings", admin.listBookings);

// Payments + escrow
router.get("/payments", admin.listPayments);
router.get("/escrow", admin.escrowOverview);
router.post("/payments/:id/escrow", superOnly, admin.paymentEscrowAction);

// Disputes
router.get("/disputes", admin.listDisputes);
router.post("/disputes/:id/resolve", superOnly, admin.resolveDispute);

// Withdrawals
router.get("/withdrawals", admin.listWithdrawals);
router.post("/withdrawals/:id/decision", superOnly, admin.decideWithdrawal);

// Reviews moderation
router.get("/reviews", admin.listReviews);
router.delete("/reviews/:id", admin.removeReview);

// Safety management (reports, SOS events)
router.get("/safety/reports", admin.listSafetyReports);
router.post("/safety/reports/:id/resolve", admin.resolveSafetyReport);
router.get("/safety/sos", admin.listSosEvents);
router.post("/safety/sos/:id/update", admin.updateSosEvent);

// Smart route matching analytics
router.get("/route-analytics", admin.routeMatchAnalytics);

// Ride verification (logs + per-ride timeline + analytics)
router.get("/verification/logs", admin.listVerificationLogs);
router.get("/verification/analytics", admin.verificationAnalytics);
router.get("/verification/ride/:rideId", admin.rideVerificationTimeline);

module.exports = router;
