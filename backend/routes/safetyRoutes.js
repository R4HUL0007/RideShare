const express = require("express");
const {
    listContacts, addContact, updateContact, deleteContact, setPrimaryContact,
    triggerSos, cancelSos,
    shareTrip, viewSharedTrip,
    submitReport, myIncidents, overview,
} = require("../controllers/safetyController");
const { protect } = require("../middleware/authMiddleware");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();

// Abuse guards: SOS triggers fan-out emails; reports notify all admins. Generous
// enough not to block a real emergency, tight enough to stop a flood.
const sosLimiter = rateLimit({ key: "sos", windowMs: 60 * 1000, max: 10 });
const reportLimiter = rateLimit({ key: "safety-report", windowMs: 60 * 1000, max: 10 });

// ---- PUBLIC: shared trip view (no auth — secured by unguessable token) ----
router.get("/trip/:token", viewSharedTrip);

// ---- Everything below requires auth, hard-scoped to req.user ----
router.get("/overview", protect, overview);

// Emergency contacts
router.get("/contacts", protect, listContacts);
router.post("/contacts", protect, addContact);
router.put("/contacts/:id", protect, updateContact);
router.delete("/contacts/:id", protect, deleteContact);
router.patch("/contacts/:id/primary", protect, setPrimaryContact);

// SOS
router.post("/sos", protect, sosLimiter, triggerSos);
router.post("/sos/:id/cancel", protect, cancelSos);

// Trip sharing
router.post("/share", protect, shareTrip);

// Reports
router.post("/report", protect, reportLimiter, submitReport);

// Incident history (own)
router.get("/incidents", protect, myIncidents);

module.exports = router;
