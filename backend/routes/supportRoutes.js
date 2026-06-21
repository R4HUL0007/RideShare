const express = require("express");
const support = require("../controllers/supportController");
const { protect } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");

const router = express.Router();

// ---- User endpoints (auth) ----
router.post("/request", protect, support.requestSupport);
router.get("/my-session", protect, support.mySession);
router.post("/:id/message", protect, support.userMessage);
router.post("/:id/close", protect, support.userClose);

// ---- Support tickets ("Email us") (auth) ----
router.post("/ticket", protect, support.createTicket);
router.get("/my-tickets", protect, support.myTickets);
router.get("/my-tickets/:id", protect, support.getMyTicket);
router.post("/ticket/:id/reply", protect, support.userTicketReply);
router.delete("/ticket/:id", protect, support.deleteMyTicket);

// ---- Agent endpoints (auth + admin) ----
router.get("/admin/list", protect, requireAdmin, support.adminList);
router.get("/admin/tickets", protect, requireAdmin, support.adminTicketList);
router.get("/admin/tickets/:id", protect, requireAdmin, support.adminTicketGet);
router.post("/admin/tickets/:id/reply", protect, requireAdmin, support.adminTicketReply);
router.post("/admin/tickets/:id/clear", protect, requireAdmin, support.adminTicketClear);
router.patch("/admin/tickets/:id", protect, requireAdmin, support.adminTicketUpdate);
router.delete("/admin/tickets/:id", protect, requireAdmin, support.adminTicketDelete);
router.get("/admin/:id", protect, requireAdmin, support.adminGet);
router.post("/admin/:id/claim", protect, requireAdmin, support.adminClaim);
router.post("/admin/:id/message", protect, requireAdmin, support.adminMessage);
router.post("/admin/:id/close", protect, requireAdmin, support.adminClose);

module.exports = router;
