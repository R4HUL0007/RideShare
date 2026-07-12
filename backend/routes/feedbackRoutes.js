const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { submitFeedback } = require("../controllers/feedbackController");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();

// Best-effort auth: if a valid session is present, attach req.user for context.
// Never blocks — the feedback form is public (works logged-out too).
const optionalAuth = async (req, _res, next) => {
    try {
        let token;
        if (req.cookies?.accessToken) token = req.cookies.accessToken;
        else if (req.cookies?.token) token = req.cookies.token;
        else if (req.headers.authorization?.startsWith("Bearer")) token = req.headers.authorization.split(" ")[1];
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
            const user = await User.findById(decoded.id).select("email _id");
            if (user) req.user = user;
        }
    } catch { /* ignore — treat as anonymous */ }
    next();
};

// Throttle: 5 submissions per 10 minutes per IP (feedback fans out an email).
const feedbackLimiter = rateLimit({ key: "feedback", windowMs: 10 * 60 * 1000, max: 5 });

router.post("/", feedbackLimiter, optionalAuth, submitFeedback);

module.exports = router;
