const express = require("express");
const { myImpact, platformImpact } = require("../controllers/sustainabilityController");
const { protect } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");

const router = express.Router();

router.get("/me", protect, myImpact);
router.get("/platform", protect, requireAdmin, platformImpact);

module.exports = router;
