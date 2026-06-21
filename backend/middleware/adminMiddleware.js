const AuditLog = require("../models/AuditLog");
require("dotenv").config();

// Comma-separated allow-list of emails that are treated as admins. Lets you
// bootstrap the very first admin without a DB seed: any logged-in user whose
// email is here is auto-promoted to isAdmin on their first admin request.
const adminEmails = () =>
    (process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

/**
 * requireAdmin — must run AFTER `protect` (so req.user is set). Grants access
 * when the user has isAdmin, OR their email is in ADMIN_EMAILS (auto-promoting
 * them once so the flag persists). Everyone else is blocked with 403. This is
 * the single chokepoint that prevents privilege escalation into admin APIs.
 */
const requireAdmin = async (req, res, next) => {
    const user = req.user;
    if (!user) return res.status(401).json({ message: "Not authorized" });

    const isConfigured = adminEmails().includes((user.email || "").toLowerCase());

    if (!user.isAdmin && !isConfigured) {
        return res.status(403).json({ message: "Admin access required" });
    }

    // Auto-promote a configured admin email on first access (persist the flag).
    if (!user.isAdmin && isConfigured) {
        try {
            user.isAdmin = true;
            if (user.adminRole === "none") user.adminRole = "super_admin";
            await user.save();
        } catch { /* non-fatal: still allow this request */ }
    }

    next();
};

// Optional finer-grained gate for future roles (super_admin / moderator / ...).
const requireAdminRole = (...roles) => (req, res, next) => {
    if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
    if (roles.length && !roles.includes(req.user.adminRole) && req.user.adminRole !== "super_admin") {
        return res.status(403).json({ message: "Insufficient admin role" });
    }
    next();
};

// Append-only audit helper used across admin mutations.
const writeAudit = async (req, action, { targetType, target_id, details } = {}) => {
    try {
        await AuditLog.create({
            admin_id: req.user._id,
            adminName: req.user.name || "",
            action,
            targetType: targetType || "",
            target_id: target_id || null,
            details: details || {},
            ip: req.ip || "",
        });
    } catch (e) {
        console.error("Audit log write failed:", e.message);
    }
};

module.exports = { requireAdmin, requireAdminRole, writeAudit, adminEmails };
