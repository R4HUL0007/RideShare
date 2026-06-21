const express = require("express");
const { chat, analytics, reindex } = require("../controllers/aiController");
const { protect } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();

// Throttle the LLM/RAG endpoint to contain compute cost + abuse.
const chatLimiter = rateLimit({ key: "ai-chat", windowMs: 60 * 1000, max: 30 });

// Conversational endpoint — auth required so the agent runs with the user's
// context and all data tools are hard-scoped to that user.
router.post("/chat", protect, chatLimiter, chat);

// AI analytics + knowledge reindex are admin-only.
router.get("/analytics", protect, requireAdmin, analytics);
router.post("/reindex", protect, requireAdmin, reindex);

module.exports = router;
