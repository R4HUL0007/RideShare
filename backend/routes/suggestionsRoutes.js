const express = require("express");
const {
    get,
    record,
    removeSearch,
    clearSearches,
} = require("../controllers/suggestionsController");
const { protect } = require("../middleware/authMiddleware");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();

// All suggestion data is per-user (scoped to req.user._id in the controller).
const writeLimiter = rateLimit({ key: "suggestions-write", windowMs: 60 * 1000, max: 60 });

router.get("/", protect, get);
router.post("/record", protect, writeLimiter, record);
router.delete("/searches/:id", protect, writeLimiter, removeSearch);
router.delete("/searches", protect, writeLimiter, clearSearches);

module.exports = router;
