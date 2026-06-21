const jwt = require("jsonwebtoken");
const User = require("../models/User");
require("dotenv").config();

const protect = async (req, res, next) => {
    let token;
    
    // Prefer the new short-lived access cookie; fall back to the legacy single
    // "token" cookie (migration) and finally the Bearer header (dev cross-origin).
    if (req.cookies?.accessToken) {
        token = req.cookies.accessToken;
    } else if (req.cookies?.token) {
        token = req.cookies.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        return res.status(401).json({ message: "Not authorized, no token" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
        const user = await User.findById(decoded.id).select("-password");
        
        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        if (!user.isVerified) {
            return res.status(403).json({ message: "Please verify your email to access this resource" });
        }

        // Suspended or frozen accounts are blocked from the platform (admins can reactivate).
        if (user.status === "suspended" || user.status === "frozen") {
            const word = user.status === "frozen" ? "frozen" : "suspended";
            return res.status(403).json({ message: `Your account has been ${word}. Please contact support.` });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ message: "Not authorized, token failed" });
    }
};

module.exports = { protect };
