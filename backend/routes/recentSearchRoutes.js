const express = require("express");
const {
    list,
    add,
    removeOne,
    clearAll,
} = require("../controllers/recentSearchController");
const { protect } = require("../middleware/authMiddleware");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();

// All recent-search routes require authentication and are scoped per user in
// the controller (req.user._id). A lenient limiter on writes guards against
// abuse from rapid repeated selections.
const writeLimiter = rateLimit({ key: "recent-search-write", windowMs: 60 * 1000, max: 60 });

router.get("/", protect, list);
router.post("/", protect, writeLimiter, add);
router.delete("/:id", protect, writeLimiter, removeOne);
router.delete("/", protect, writeLimiter, clearAll);

module.exports = router;
