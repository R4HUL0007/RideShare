const mongoose = require("mongoose");
const User = require("../models/User");
const Ride = require("../models/Ride");
const Payment = require("../models/Payment");
const Dispute = require("../models/Dispute");
const Withdrawal = require("../models/Withdrawal");
const Review = require("../models/Review");
const AuditLog = require("../models/AuditLog");
const Verification = require("../models/Verification");
const { writeAudit } = require("../middleware/adminMiddleware");
const { createNotification } = require("../utils/notify");

const idStr = (v) => (v == null ? null : typeof v === "string" ? v : v._id ? v._id.toString() : v.toString());

// Shared pagination parser (server-side pagination for big tables).
function paging(req, { defLimit = 20, maxLimit = 100 } = {}) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit, 10) || defLimit));
    return { page, limit, skip: (page - 1) * limit };
}
const pageMeta = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) || 1 });

/* =======================================================
   Dashboard overview + analytics
   ======================================================= */
exports.getDashboard = async (req, res) => {
    try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const [
            totalUsers, totalRides, totalBookingsAgg, totalReviews,
            activeDisputes, activeLiveRides,
            revenueAgg, escrowAgg, monthRevenueAgg,
        ] = await Promise.all([
            User.countDocuments({}),
            Ride.countDocuments({}),
            Ride.aggregate([{ $project: { n: { $size: { $ifNull: ["$passengers", []] } } } }, { $group: { _id: null, total: { $sum: "$n" } } }]),
            Review.countDocuments({}),
            Dispute.countDocuments({ status: { $in: ["open", "under_review"] } }),
            Ride.countDocuments({ "tracking.state": "in_progress" }),
            Payment.aggregate([{ $match: { status: "Successful" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
            Payment.aggregate([{ $match: { status: "Successful", escrowStatus: { $in: ["held", "awaiting_completion"] } } }, { $group: { _id: null, total: { $sum: "$driverEarnings" } } }]),
            Payment.aggregate([{ $match: { status: "Successful", paidAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
        ]);

        res.status(200).json({
            cards: {
                totalUsers,
                totalRides,
                totalBookings: totalBookingsAgg[0]?.total || 0,
                totalRevenue: revenueAgg[0]?.total || 0,
                escrowBalance: escrowAgg[0]?.total || 0,
                activeDisputes,
                totalReviews,
                activeLiveRides,
                monthlyRevenue: monthRevenueAgg[0]?.total || 0,
            },
        });
    } catch (e) {
        console.error("admin getDashboard:", e);
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Time-series analytics for charts (last `days` days).
exports.getAnalytics = async (req, res) => {
    try {
        const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));
        const since = new Date(); since.setDate(since.getDate() - days); since.setHours(0, 0, 0, 0);
        const byDay = (dateField) => ([
            { $match: { [dateField]: { $gte: since } } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: `$${dateField}` } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]);

        const [rides, users, payments, disputes] = await Promise.all([
            Ride.aggregate(byDay("createdAt")),
            User.aggregate(byDay("createdAt")),
            Payment.aggregate([
                { $match: { status: "Successful", paidAt: { $gte: since } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt" } }, count: { $sum: 1 }, revenue: { $sum: "$amount" } } },
                { $sort: { _id: 1 } },
            ]),
            Dispute.aggregate(byDay("createdAt")),
        ]);

        // Ratings distribution (1–5).
        const ratingDist = await Review.aggregate([{ $group: { _id: "$rating", count: { $sum: 1 } } }, { $sort: { _id: 1 } }]);

        res.status(200).json({ days, rides, users, payments, disputes, ratingDist });
    } catch (e) {
        console.error("admin getAnalytics:", e);
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Admin notifications feed (derived: new disputes, pending withdrawals).
exports.getAdminNotifications = async (req, res) => {
    try {
        const [disputes, withdrawals] = await Promise.all([
            Dispute.find({ status: "open" }).sort({ createdAt: -1 }).limit(10).populate("raisedBy", "name").lean(),
            Withdrawal.find({ status: "Requested" }).sort({ createdAt: -1 }).limit(10).populate("driver_id", "name").lean(),
        ]);
        const items = [
            ...disputes.map((d) => ({ type: "dispute", id: d._id, title: "New dispute", message: `${d.raisedBy?.name || "A user"} raised a dispute (${d.reason})`, at: d.createdAt })),
            ...withdrawals.map((w) => ({ type: "withdrawal", id: w._id, title: "Withdrawal request", message: `${w.driver_id?.name || "A driver"} requested ₹${w.amount}`, at: w.createdAt })),
        ].sort((a, b) => new Date(b.at) - new Date(a.at));
        res.status(200).json({ count: items.length, items });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Per-section "needs attention" counts for the admin sidebar badges.
exports.getAdminBadges = async (req, res) => {
    try {
        const SupportTicket = require("../models/SupportTicket");
        const SupportSession = require("../models/SupportSession");
        const SafetyReport = require("../models/SafetyReport");
        const SosEvent = require("../models/SosEvent");
        const PersonalRideRequest = require("../models/PersonalRideRequest");

        const [verification, withdrawals, disputes, safetyOpen, sosActive, support, tickets, personalActive] =
            await Promise.all([
                Verification.countDocuments({ status: "pending" }),
                Withdrawal.countDocuments({ status: "Requested" }),
                Dispute.countDocuments({ status: "open" }),
                SafetyReport.countDocuments({ status: { $in: ["open", "under_review"] } }),
                SosEvent.countDocuments({ status: "active" }),
                SupportSession.countDocuments({ $or: [{ status: "waiting" }, { unreadForAgent: { $gt: 0 } }] }),
                SupportTicket.countDocuments({ $or: [{ status: "open" }, { unreadForAgent: { $gt: 0 } }] }),
                PersonalRideRequest.countDocuments({ status: { $in: ["SEARCHING", "DRIVER_ASSIGNED", "RIDE_STARTED"] } }),
            ]);

        res.status(200).json({
            verification,
            withdrawals,
            disputes,
            safety: safetyOpen + sosActive,
            support,
            tickets,
            personalrides: personalActive,
        });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* =======================================================
   User management
   ======================================================= */
exports.listUsers = async (req, res) => {
    try {
        const { page, limit, skip } = paging(req);
        const filter = {};
        if (req.query.q) {
            const rx = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            filter.$or = [{ name: rx }, { email: rx }, { username: rx }];
        }
        if (req.query.status && req.query.status !== "All") filter.status = req.query.status;
        if (req.query.role && req.query.role !== "All") filter.role = req.query.role;

        const [items, total] = await Promise.all([
            User.find(filter).select("name email username role gender status ratings createdAt isAdmin adminRole")
                .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            User.countDocuments(filter),
        ]);

        // Platform-wide stat cards (independent of the current filter/page).
        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const [stTotal, stActive, stBlocked, stNew, stPending] = await Promise.all([
            User.countDocuments({}),
            User.countDocuments({ status: "active" }),
            User.countDocuments({ status: "suspended" }),
            User.countDocuments({ createdAt: { $gte: monthStart } }),
            Verification.countDocuments({ status: "pending" }),
        ]);

        res.status(200).json({
            items,
            meta: pageMeta(page, limit, total),
            stats: {
                total: stTotal,
                active: stActive,
                blocked: stBlocked,
                newThisMonth: stNew,
                pendingVerification: stPending,
            },
        });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

exports.getUserDetail = async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    try {
        const user = await User.findById(id).select("-password -otp -otpExpiry").lean();
        if (!user) return res.status(404).json({ message: "User not found" });
        const [ridesCreated, bookings, payments] = await Promise.all([
            Ride.find({ user_id: id }).select("source destination timing status").sort({ createdAt: -1 }).limit(20).lean(),
            Ride.find({ "passengers.user_id": id }).select("source destination timing status user_id").sort({ createdAt: -1 }).limit(20).lean(),
            Payment.find({ $or: [{ user_id: id }, { driver_id: id }] }).select("amount status escrowStatus createdAt").sort({ createdAt: -1 }).limit(20).lean(),
        ]);
        res.status(200).json({ user, ridesCreated, bookings, payments });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Suspend / reactivate / flag / freeze a user.
exports.updateUserStatus = async (req, res) => {
    const { id } = req.params;
    const { status, reason } = req.body || {};
    if (!["active", "suspended", "flagged", "frozen"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
    }
    if (status !== "active" && (!reason || reason.trim().length < 5)) {
        return res.status(400).json({ message: "Please add a reason (at least 5 characters)." });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    try {
        const target = await User.findById(id);
        if (!target) return res.status(404).json({ message: "User not found" });
        // An admin can't change their OWN status (prevents self-lockout / mistakes).
        if (idStr(target._id) === idStr(req.user._id)) {
            return res.status(403).json({ message: "You can't change your own account status." });
        }
        // Guard: an admin can't suspend another admin (prevents lockout/escalation games).
        if (target.isAdmin && idStr(target._id) !== idStr(req.user._id)) {
            return res.status(403).json({ message: "You can't change another admin's status." });
        }
        target.status = status;
        target.statusReason = (reason || "").slice(0, 300);
        await target.save();
        await writeAudit(req, `user.${status}`, { targetType: "user", target_id: target._id, details: { reason } });
        res.status(200).json({ message: `User ${status}`, user: { _id: target._id, status: target.status } });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Permanently delete a user account (admin only). Destructive — also removes the
// user's verification record. Guards against deleting other admins.
exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    if (!reason || reason.trim().length < 5) return res.status(400).json({ message: "Please add a reason for deletion (at least 5 characters)." });
    try {
        const target = await User.findById(id);
        if (!target) return res.status(404).json({ message: "User not found" });
        if (target.isAdmin) {
            return res.status(403).json({ message: "Admin accounts can't be deleted." });
        }
        await User.deleteOne({ _id: id });
        await Verification.deleteOne({ user_id: id }).catch(() => {});
        await writeAudit(req, "user.deleted", { targetType: "user", target_id: id, details: { name: target.name, email: target.email, reason } });
        res.status(200).json({ message: "User deleted", id });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Grant/revoke admin access and assign an admin role. When isAdmin is false the
// role is reset to "none". Guards against an admin demoting themselves (lockout).
exports.updateUserRole = async (req, res) => {
    const { id } = req.params;
    let { isAdmin, adminRole, reason } = req.body || {};
    const ROLES = ["none", "super_admin", "moderator", "support"];
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    if (adminRole && !ROLES.includes(adminRole)) return res.status(400).json({ message: "Invalid admin role" });
    if (!reason || reason.trim().length < 5) return res.status(400).json({ message: "Please add a reason for this role change (at least 5 characters)." });
    try {
        const target = await User.findById(id);
        if (!target) return res.status(404).json({ message: "User not found" });
        isAdmin = !!isAdmin;
        // Prevent self-demotion, which could lock the last admin out.
        if (!isAdmin && idStr(target._id) === idStr(req.user._id)) {
            return res.status(403).json({ message: "You can't remove your own admin access." });
        }
        target.isAdmin = isAdmin;
        target.adminRole = isAdmin ? (adminRole && adminRole !== "none" ? adminRole : "moderator") : "none";
        await target.save();
        await writeAudit(req, "user.role_updated", { targetType: "user", target_id: target._id, details: { isAdmin: target.isAdmin, adminRole: target.adminRole, reason } });
        res.status(200).json({ message: "Role updated", user: { _id: target._id, isAdmin: target.isAdmin, adminRole: target.adminRole } });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* =======================================================
   Ride management
   ======================================================= */
exports.listRides = async (req, res) => {
    try {
        const { page, limit, skip } = paging(req);
        const filter = {};
        if (req.query.status && req.query.status !== "All") filter.status = req.query.status;
        if (req.query.q) {
            const rx = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            filter.$or = [{ source: rx }, { destination: rx }];
        }
        const [items, total] = await Promise.all([
            Ride.find(filter).select("source destination timing status seatsAvailable passengers user_id vehicle_id pricePerPerson tracking.state")
                .populate("user_id", "name email").populate("vehicle_id", "make model")
                .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Ride.countDocuments(filter),
        ]);

        // Platform-wide stat cards (independent of the current filter/page).
        const [stTotal, stCompleted, stOngoing, stCancelled, ratingAgg] = await Promise.all([
            Ride.countDocuments({}),
            Ride.countDocuments({ status: "Completed" }),
            Ride.countDocuments({ "tracking.state": "in_progress" }),
            Ride.countDocuments({ status: "Cancelled" }),
            Review.aggregate([{ $group: { _id: null, avg: { $avg: "$rating" } } }]),
        ]);

        res.status(200).json({
            items: items.map((r) => ({ ...r, passengerCount: (r.passengers || []).length, passengers: undefined })),
            meta: pageMeta(page, limit, total),
            stats: {
                total: stTotal,
                completed: stCompleted,
                ongoing: stOngoing,
                cancelled: stCancelled,
                avgRating: ratingAgg[0]?.avg || 0,
            },
        });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Admin cancels a ride (soft-cancel + notify participants).
exports.cancelRide = async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body || {};
    const io = req.app.get("io"); const users = req.app.get("users") || {};
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    if (!reason || reason.trim().length < 5) return res.status(400).json({ message: "Please add a reason for cancellation (at least 5 characters)." });
    try {
        const ride = await Ride.findById(id);
        if (!ride) return res.status(404).json({ message: "Ride not found" });
        if (ride.status === "Cancelled") return res.status(400).json({ message: "Already cancelled" });
        const pax = (ride.passengers || []).map((p) => idStr(p.user_id || p)).filter(Boolean);

        // Refund any escrow still held for this ride BEFORE cancelling. Otherwise
        // paid passengers are left out of pocket and the held funds could later
        // auto-release to the driver for a ride that never happened.
        let refunded = 0;
        try {
            const Payment = require("../models/Payment");
            const { _refundPayment } = require("./paymentController");
            const held = await Payment.find({
                ride_id: ride._id,
                status: "Successful",
                escrowStatus: { $in: ["held", "awaiting_completion"] },
            });
            for (const p of held) {
                const { gatewayError } = await _refundPayment(p, { reason: "admin_ride_cancel" });
                if (!gatewayError) refunded += 1;
                await createNotification({
                    io, users, userId: idStr(p.user_id), type: "system",
                    title: "Refund issued",
                    message: `Your payment of ₹${p.amount} for the cancelled ride to ${ride.destination} is being refunded.`,
                    rideId: ride._id, link: { tab: "payments" },
                });
            }
        } catch (e) {
            console.error("admin cancelRide refund error:", e.message);
        }

        ride.status = "Cancelled";
        ride.cancelledAt = new Date();
        ride.passengers = [];
        await ride.save();
        for (const pid of [idStr(ride.user_id), ...pax]) {
            await createNotification({ io, users, userId: pid, type: "ride", title: "Ride cancelled by admin", message: `The ride to ${ride.destination} was cancelled by the platform.`, rideId: ride._id, link: { tab: "myBookings" } });
        }
        await writeAudit(req, "ride.cancel", { targetType: "ride", target_id: ride._id, details: { reason, refunded } });
        res.status(200).json({ message: "Ride cancelled", refunded, ride: { _id: ride._id, status: ride.status } });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* =======================================================
   Bookings (passenger seats across rides)
   ======================================================= */
exports.listBookings = async (req, res) => {
    try {
        const { page, limit, skip } = paging(req);
        const match = { "passengers.0": { $exists: true } };
        if (req.query.status && req.query.status !== "All") match.status = req.query.status;

        // Paginate at the BOOKING level (one row per passenger) by unwinding the
        // passengers array up front. This keeps page size, meta.total, and the
        // per-passenger stat cards in the same unit (bookings). Previously the
        // page limited RIDES while the UI flattened to passenger rows, so a page
        // could show more rows than `limit` and meta.total (rides) disagreed with
        // stats.total (bookings).
        const rx = req.query.q
            ? new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
            : null;
        const base = [
            { $match: match },
            { $unwind: "$passengers" },
            { $lookup: { from: "users", localField: "user_id", foreignField: "_id", as: "driver" } },
            { $lookup: { from: "users", localField: "passengers.user_id", foreignField: "_id", as: "pax" } },
        ];
        if (rx) {
            base.push({ $match: { $or: [
                { source: rx }, { destination: rx },
                { "driver.name": rx }, { "pax.name": rx }, { "pax.email": rx }, { "pax.phoneNumber": rx },
            ] } });
        }

        const [bookings, totalAgg] = await Promise.all([
            Ride.aggregate([...base, { $sort: { "passengers.bookedAt": -1, createdAt: -1 } }, { $skip: skip }, { $limit: limit }]),
            Ride.aggregate([...base, { $count: "n" }]),
        ]);
        const total = totalAgg[0]?.n || 0;

        // Stat cards — per-passenger bookings across the whole platform.
        const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
        const statsAgg = await Ride.aggregate([
            { $match: { "passengers.0": { $exists: true } } },
            { $unwind: "$passengers" },
            { $group: {
                _id: null,
                total: { $sum: 1 },
                confirmed: { $sum: { $cond: [{ $in: ["$status", ["Booked", "Completed"]] }, 1, 0] } },
                pending: { $sum: { $cond: [{ $eq: ["$status", "Available"] }, 1, 0] } },
                cancelled: { $sum: { $cond: [{ $eq: ["$status", "Cancelled"] }, 1, 0] } },
                today: { $sum: { $cond: [{ $gte: ["$passengers.bookedAt", startToday] }, 1, 0] } },
            } },
        ]);
        const s = statsAgg[0] || {};

        const rows = bookings.map((r) => {
            const driver = r.driver?.[0];
            const u = r.pax?.[0];
            return {
                rideId: r._id, route: `${r.source} → ${r.destination}`, timing: r.timing,
                driver: driver?.name || "—", passenger: u?.name || "—",
                seats: r.passengers?.seats || 1, rideStatus: r.status,
            };
        });
        res.status(200).json({
            items: rows,
            meta: pageMeta(page, limit, total),
            stats: {
                total: s.total || 0,
                confirmed: s.confirmed || 0,
                pending: s.pending || 0,
                cancelled: s.cancelled || 0,
                today: s.today || 0,
            },
        });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* =======================================================
   Payments + escrow management
   ======================================================= */
exports.listPayments = async (req, res) => {
    try {
        const { page, limit, skip } = paging(req);
        const pre = {};
        if (req.query.status && req.query.status !== "All") pre.status = req.query.status;
        if (req.query.escrow && req.query.escrow !== "All") pre.escrowStatus = req.query.escrow;

        const lookups = [
            { $lookup: { from: "users", localField: "user_id", foreignField: "_id", as: "u" } },
            { $lookup: { from: "users", localField: "driver_id", foreignField: "_id", as: "d" } },
        ];
        const post = [];
        if (req.query.q) {
            const rx = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            const or = [
                { order_id: rx }, { payment_id: rx },
                { "u.name": rx }, { "u.email": rx }, { "u.phoneNumber": rx },
                { "d.name": rx }, { "d.email": rx }, { "d.phoneNumber": rx },
            ];
            const num = Number(req.query.q);
            if (!Number.isNaN(num)) or.push({ amount: num });
            post.push({ $match: { $or: or } });
        }

        const raw = await Payment.aggregate([
            { $match: pre }, ...lookups, ...post,
            { $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit },
        ]);
        const items = raw.map((p) => ({
            ...p,
            user_id: p.u?.[0] ? { _id: p.u[0]._id, name: p.u[0].name, email: p.u[0].email } : p.user_id,
            driver_id: p.d?.[0] ? { _id: p.d[0]._id, name: p.d[0].name, email: p.d[0].email } : p.driver_id,
            u: undefined, d: undefined, signature: undefined,
        }));
        const totalAgg = await Payment.aggregate([{ $match: pre }, ...lookups, ...post, { $count: "n" }]);
        const total = totalAgg[0]?.n || 0;

        // Stat cards (platform-wide).
        const [stTotal, stCompleted, stPending, stFailed, escrowAgg, amountAgg] = await Promise.all([
            Payment.countDocuments({}),
            Payment.countDocuments({ status: "Successful" }),
            Payment.countDocuments({ status: "Pending" }),
            Payment.countDocuments({ status: { $in: ["Failed", "Cancelled"] } }),
            Payment.aggregate([{ $match: { status: "Successful", escrowStatus: { $in: ["held", "awaiting_completion"] } } }, { $group: { _id: null, total: { $sum: "$driverEarnings" } } }]),
            Payment.aggregate([{ $match: { status: "Successful" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
        ]);

        res.status(200).json({
            items,
            meta: pageMeta(page, limit, total),
            stats: {
                total: stTotal,
                completed: stCompleted,
                pending: stPending,
                failedCancelled: stFailed,
                escrowHeld: escrowAgg[0]?.total || 0,
                totalAmount: amountAgg[0]?.total || 0,
            },
        });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

exports.escrowOverview = async (req, res) => {
    try {
        const agg = await Payment.aggregate([
            { $match: { status: "Successful" } },
            { $group: { _id: "$escrowStatus", total: { $sum: "$driverEarnings" }, count: { $sum: 1 } } },
        ]);
        const buckets = { held: 0, awaiting_completion: 0, released: 0, disputed: 0, refunded: 0 };
        agg.forEach((a) => { if (a._id in buckets) buckets[a._id] = a.total; });
        res.status(200).json({ buckets });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Admin: release escrow to the driver, or refund the passenger, directly on a
// payment (without a dispute). Mirrors the dispute-resolution escrow logic.
exports.paymentEscrowAction = async (req, res) => {
    const { id } = req.params;
    const { action, note } = req.body || {}; // "release" | "refund"
    const io = req.app.get("io"); const users = req.app.get("users") || {};
    if (!["release", "refund"].includes(action)) return res.status(400).json({ message: "Invalid action" });
    if (!note || note.trim().length < 5) return res.status(400).json({ message: "Please add a note explaining this action (at least 5 characters)." });
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    try {
        const payment = await Payment.findById(id);
        if (!payment) return res.status(404).json({ message: "Payment not found" });
        if (payment.status !== "Successful") return res.status(400).json({ message: "Only successful payments have escrow to act on." });

        if (action === "release") {
            if (!["held", "awaiting_completion"].includes(payment.escrowStatus)) {
                return res.status(400).json({ message: `Cannot release escrow in '${payment.escrowStatus}' state.` });
            }
            const { _releaseEscrow } = require("./paymentController");
            await _releaseEscrow(payment, "admin", { io, users });
        } else {
            if (!["held", "awaiting_completion", "disputed"].includes(payment.escrowStatus)) {
                return res.status(400).json({ message: `Cannot refund escrow in '${payment.escrowStatus}' state.` });
            }
            const { _refundPayment } = require("./paymentController");
            await _refundPayment(payment, { reason: note || "admin_refund" });
            await createNotification({ io, users, userId: idStr(payment.user_id), type: "system", title: "Refund processed", message: `₹${payment.amount} will be refunded for your ride.`, rideId: payment.ride_id, link: { tab: "payments" } });
        }

        await writeAudit(req, action === "release" ? "escrow.release" : "escrow.refund", { targetType: "payment", target_id: payment._id, details: { action, note: (note || "").slice(0, 200) } });
        res.status(200).json({ message: action === "release" ? "Escrow released to driver" : "Payment refunded", payment: { _id: payment._id, status: payment.status, escrowStatus: payment.escrowStatus } });
    } catch (e) {
        console.error("admin paymentEscrowAction:", e);
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* =======================================================
   Dispute center
   ======================================================= */
exports.listDisputes = async (req, res) => {
    try {
        const { page, limit, skip } = paging(req);
        const pre = {};
        if (req.query.status && req.query.status !== "All") pre.status = req.query.status;
        if (req.query.reason && req.query.reason !== "All") pre.reason = req.query.reason;

        const lookups = [
            { $lookup: { from: "users", localField: "raisedBy", foreignField: "_id", as: "rb" } },
            { $lookup: { from: "users", localField: "against", foreignField: "_id", as: "ag" } },
            { $lookup: { from: "rides", localField: "ride_id", foreignField: "_id", as: "rd" } },
            { $lookup: { from: "payments", localField: "payment_id", foreignField: "_id", as: "pm" } },
        ];
        const post = [];
        if (req.query.q) {
            const rx = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            post.push({ $match: { $or: [
                { reason: rx },
                { "rb.name": rx }, { "rb.email": rx },
                { "ag.name": rx }, { "ag.email": rx },
                { "rd.source": rx }, { "rd.destination": rx },
                { $expr: { $regexMatch: { input: { $toString: "$_id" }, regex: rx } } },
                { $expr: { $regexMatch: { input: { $toString: "$ride_id" }, regex: rx } } },
            ] } });
        }

        const raw = await Dispute.aggregate([
            { $match: pre }, ...lookups, ...post,
            { $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit },
        ]);
        const shape = (u) => (u ? { _id: u._id, name: u.name, email: u.email } : null);
        const items = raw.map((d) => ({
            ...d,
            raisedBy: shape(d.rb?.[0]),
            against: shape(d.ag?.[0]),
            ride_id: d.rd?.[0] ? { _id: d.rd[0]._id, source: d.rd[0].source, destination: d.rd[0].destination, timing: d.rd[0].timing } : null,
            payment_id: d.pm?.[0] ? { _id: d.pm[0]._id, amount: d.pm[0].amount, driverEarnings: d.pm[0].driverEarnings, escrowStatus: d.pm[0].escrowStatus } : null,
            rb: undefined, ag: undefined, rd: undefined, pm: undefined,
        }));
        const totalAgg = await Dispute.aggregate([{ $match: pre }, ...lookups, ...post, { $count: "n" }]);
        const total = totalAgg[0]?.n || 0;

        // Stat cards (platform-wide). The schema has no cancelled/closed states,
        // so those buckets are reported as 0.
        const [stTotal, stOpen, stResolved] = await Promise.all([
            Dispute.countDocuments({}),
            Dispute.countDocuments({ status: { $in: ["open", "under_review"] } }),
            Dispute.countDocuments({ status: "resolved" }),
        ]);

        res.status(200).json({
            items,
            meta: pageMeta(page, limit, total),
            stats: { total: stTotal, open: stOpen, resolved: stResolved, cancelled: 0, closed: 0 },
        });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Resolve a dispute → release funds to driver OR refund passenger.
exports.resolveDispute = async (req, res) => {
    const { id } = req.params;
    const { outcome, note } = req.body || {}; // "released" | "refunded"
    const io = req.app.get("io"); const users = req.app.get("users") || {};
    if (!["released", "refunded"].includes(outcome)) return res.status(400).json({ message: "Invalid outcome" });
    if (!note || note.trim().length < 5) return res.status(400).json({ message: "Please add a resolution note (at least 5 characters)." });
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    try {
        const dispute = await Dispute.findById(id);
        if (!dispute) return res.status(404).json({ message: "Dispute not found" });
        if (dispute.status === "resolved") return res.status(400).json({ message: "Already resolved" });

        const payment = await Payment.findById(dispute.payment_id);
        if (payment) {
            if (outcome === "released") {
                const { _releaseEscrow } = require("./paymentController");
                await _releaseEscrow(payment, "admin", { io, users });
            } else {
                const { _refundPayment } = require("./paymentController");
                await _refundPayment(payment, { reason: "dispute_upheld" });
                await createNotification({ io, users, userId: idStr(dispute.raisedBy), type: "system", title: "Refund processed", message: `Your dispute was upheld — ₹${payment.amount} will be refunded.`, rideId: dispute.ride_id, link: { tab: "payments" } });
                // A rejected driver payout is implicit; count a false dispute only when REJECTED (released), not here.
            }
        }

        dispute.status = "resolved";
        dispute.outcome = outcome;
        dispute.resolutionNote = (note || "").slice(0, 500);
        dispute.resolvedBy = req.user._id;
        dispute.resolvedAt = new Date();
        await dispute.save();

        // Update dispute stats: resolved++, and if the dispute was rejected
        // (funds released to driver), count it as a "false" dispute by the raiser.
        const inc = { "disputeStats.resolved": 1 };
        if (outcome === "released") inc["disputeStats.false"] = 1;
        await User.updateOne({ _id: dispute.raisedBy }, { $inc: inc });
        // Flag the raiser for manual review after repeated false disputes (never auto-ban).
        const raiser = await User.findById(dispute.raisedBy).select("disputeStats status").lean();
        if (raiser && (raiser.disputeStats?.false || 0) >= 3 && raiser.status === "active") {
            await User.updateOne({ _id: dispute.raisedBy }, { $set: { "disputeStats.flagged": true, status: "flagged", statusReason: "Repeated false disputes — manual review" } });
        }

        await writeAudit(req, "dispute.resolve", { targetType: "dispute", target_id: dispute._id, details: { outcome, note } });
        res.status(200).json({ message: `Dispute ${outcome}`, dispute: { _id: dispute._id, status: dispute.status, outcome } });
    } catch (e) {
        console.error("admin resolveDispute:", e);
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* =======================================================
   Withdrawal management
   ======================================================= */
exports.listWithdrawals = async (req, res) => {
    try {
        const { page, limit, skip } = paging(req);
        const pre = {};
        if (req.query.status && req.query.status !== "All") pre.status = req.query.status;
        if (req.query.method && req.query.method !== "All") pre.method = req.query.method;

        const lookups = [{ $lookup: { from: "users", localField: "driver_id", foreignField: "_id", as: "drv" } }];
        const post = [];
        if (req.query.q) {
            const rx = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            const or = [
                { "drv.name": rx }, { "drv.email": rx }, { upiId: rx }, { adminNote: rx },
                { $expr: { $regexMatch: { input: { $toString: "$_id" }, regex: rx } } },
            ];
            const num = Number(req.query.q);
            if (!Number.isNaN(num)) or.push({ amount: num });
            post.push({ $match: { $or: or } });
        }

        const raw = await Withdrawal.aggregate([
            { $match: pre }, ...lookups, ...post,
            { $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit },
        ]);
        const items = raw.map((w) => ({
            ...w,
            driver_id: w.drv?.[0] ? { _id: w.drv[0]._id, name: w.drv[0].name, email: w.drv[0].email } : w.driver_id,
            drv: undefined,
        }));
        const totalAgg = await Withdrawal.aggregate([{ $match: pre }, ...lookups, ...post, { $count: "n" }]);
        const total = totalAgg[0]?.n || 0;

        // Stat cards (platform-wide).
        const [stTotal, stPending, stApproved, stRejected, stCompleted] = await Promise.all([
            Withdrawal.countDocuments({}),
            Withdrawal.countDocuments({ status: "Requested" }),
            Withdrawal.countDocuments({ status: "Approved" }),
            Withdrawal.countDocuments({ status: "Rejected" }),
            Withdrawal.countDocuments({ status: "Processed" }),
        ]);

        res.status(200).json({
            items,
            meta: pageMeta(page, limit, total),
            stats: { total: stTotal, pending: stPending, approved: stApproved, rejected: stRejected, completed: stCompleted },
        });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

exports.decideWithdrawal = async (req, res) => {
    const { id } = req.params;
    const { decision, note } = req.body || {}; // "approve" | "reject"
    const io = req.app.get("io"); const users = req.app.get("users") || {};
    if (!["approve", "reject"].includes(decision)) return res.status(400).json({ message: "Invalid decision" });
    if (!note || note.trim().length < 5) return res.status(400).json({ message: "Please add a note explaining this decision (at least 5 characters)." });
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    try {
        const w = await Withdrawal.findById(id);
        if (!w) return res.status(404).json({ message: "Withdrawal not found" });
        if (w.status !== "Requested" && w.status !== "Approved") return res.status(400).json({ message: "Already finalized" });

        if (decision === "approve") {
            w.status = "Processed";
            w.processedAt = new Date();
            w.processedBy = req.user._id;
            w.adminNote = (note || "").slice(0, 300);
            await w.save();
            await createNotification({ io, users, userId: idStr(w.driver_id), type: "system", title: "Withdrawal approved", message: `Your withdrawal of ₹${w.amount} to ${w.upiId} has been processed.`, link: { tab: "earnings" } });
        } else {
            w.status = "Rejected";
            w.processedAt = new Date();
            w.processedBy = req.user._id;
            w.adminNote = (note || "").slice(0, 300);
            await w.save();
            // Release the funding payments back so the driver can re-withdraw.
            if (Array.isArray(w.payment_ids) && w.payment_ids.length) {
                await Payment.updateMany({ _id: { $in: w.payment_ids } }, { $set: { withdrawal_id: null } });
            }
            await createNotification({ io, users, userId: idStr(w.driver_id), type: "system", title: "Withdrawal rejected", message: `Your withdrawal request was rejected.${note ? " " + note : ""} The funds remain in your available balance.`, link: { tab: "earnings" } });
        }
        await writeAudit(req, `withdrawal.${decision}`, { targetType: "withdrawal", target_id: w._id, details: { amount: w.amount, note } });
        res.status(200).json({ message: `Withdrawal ${decision}d`, withdrawal: { _id: w._id, status: w.status } });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* =======================================================
   Reviews moderation
   ======================================================= */
exports.listReviews = async (req, res) => {
    try {
        const { page, limit, skip } = paging(req);
        const pre = {};
        if (req.query.rating && req.query.rating !== "All") pre.rating = parseInt(req.query.rating, 10);
        if (req.query.maxRating) pre.rating = { $lte: parseInt(req.query.maxRating, 10) };

        const lookups = [
            { $lookup: { from: "users", localField: "reviewer", foreignField: "_id", as: "rv" } },
            { $lookup: { from: "users", localField: "reviewee", foreignField: "_id", as: "re" } },
            { $lookup: { from: "rides", localField: "ride", foreignField: "_id", as: "rd" } },
        ];
        const post = [];
        if (req.query.q) {
            const rx = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            post.push({ $match: { $or: [
                { comment: rx },
                { "rv.name": rx }, { "re.name": rx },
                { "rd.source": rx }, { "rd.destination": rx },
            ] } });
        }

        const raw = await Review.aggregate([
            { $match: pre }, ...lookups, ...post,
            { $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit },
        ]);
        const items = raw.map((r) => ({
            ...r,
            reviewer: r.rv?.[0] ? { _id: r.rv[0]._id, name: r.rv[0].name } : null,
            reviewee: r.re?.[0] ? { _id: r.re[0]._id, name: r.re[0].name } : null,
            ride: r.rd?.[0] ? { _id: r.rd[0]._id, source: r.rd[0].source, destination: r.rd[0].destination } : null,
            rv: undefined, re: undefined, rd: undefined,
        }));
        const totalAgg = await Review.aggregate([{ $match: pre }, ...lookups, ...post, { $count: "n" }]);
        const total = totalAgg[0]?.n || 0;

        // Stat cards. Reviews are auto-published (no moderation queue), so all
        // existing reviews count as "approved"; pending/rejected/reported have
        // no backing state and report 0.
        const totalAll = await Review.countDocuments({});
        res.status(200).json({
            items,
            meta: pageMeta(page, limit, total),
            stats: { total: totalAll, approved: totalAll, pending: 0, rejected: 0, reported: 0 },
        });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

exports.removeReview = async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    if (!reason || reason.trim().length < 5) return res.status(400).json({ message: "Please add a reason for removal (at least 5 characters)." });
    try {
        const review = await Review.findById(id);
        if (!review) return res.status(404).json({ message: "Review not found" });
        const reviewee = review.reviewee;
        await Review.deleteOne({ _id: id });
        // Recompute the reviewee's aggregates after removal.
        try {
            const { recomputeUserRatings } = require("./reviewController");
            if (typeof recomputeUserRatings === "function") await recomputeUserRatings(reviewee);
        } catch { /* best-effort */ }
        await writeAudit(req, "review.remove", { targetType: "review", target_id: id, details: { reviewee: idStr(reviewee), reason } });
        res.status(200).json({ message: "Review removed" });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* =======================================================
   Live monitoring + audit logs
   ======================================================= */
exports.liveMonitoring = async (req, res) => {
    try {
        const { getOnlineIds } = require("../utils/presence");
        const onlineUsers = (await getOnlineIds()).length;
        const [activeRides, liveTracking] = await Promise.all([
            Ride.countDocuments({ status: { $in: ["Available", "Booked"] } }),
            Ride.countDocuments({ "tracking.state": "in_progress" }),
        ]);
        const activeRideList = await Ride.find({ "tracking.state": "in_progress" })
            .select("source destination user_id tracking.state").populate("user_id", "name").limit(20).lean();
        res.status(200).json({ onlineUsers, activeRides, liveTracking, activeRideList });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

exports.listAuditLogs = async (req, res) => {
    try {
        const { page, limit, skip } = paging(req);
        const pre = {};
        if (req.query.action && req.query.action !== "All") pre.action = req.query.action;
        if (req.query.admin && req.query.admin !== "All" && mongoose.Types.ObjectId.isValid(req.query.admin)) pre.admin_id = req.query.admin;
        if (req.query.q) {
            const rx = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            pre.$or = [{ action: rx }, { adminName: rx }, { ip: rx }, { targetType: rx }];
        }

        const [items, total, actions, admins] = await Promise.all([
            AuditLog.find(pre).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            AuditLog.countDocuments(pre),
            AuditLog.distinct("action"),
            AuditLog.aggregate([{ $group: { _id: "$admin_id", name: { $first: "$adminName" } } }, { $sort: { name: 1 } }]),
        ]);
        res.status(200).json({
            items,
            meta: pageMeta(page, limit, total),
            filters: {
                actions: (actions || []).sort(),
                admins: (admins || []).filter((a) => a._id).map((a) => ({ id: String(a._id), name: a.name || "Admin" })),
            },
        });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* =======================================================
   Safety Management (admin) — reports, SOS events, incidents
   ======================================================= */
const SafetyReport = require("../models/SafetyReport");
const SosEvent = require("../models/SosEvent");

// List safety reports (paginated + status filter).
exports.listSafetyReports = async (req, res) => {
    try {
        const { page, limit, skip } = paging(req);
        const pre = {};
        if (req.query.status && req.query.status !== "All") pre.status = req.query.status;
        if (req.query.type && req.query.type !== "All") pre.reportType = req.query.type;

        const lookups = [
            { $lookup: { from: "users", localField: "reporter_id", foreignField: "_id", as: "rp" } },
            { $lookup: { from: "users", localField: "against_id", foreignField: "_id", as: "ag" } },
            { $lookup: { from: "rides", localField: "ride_id", foreignField: "_id", as: "rd" } },
        ];
        const post = [];
        if (req.query.q) {
            const rx = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            post.push({ $match: { $or: [
                { reportType: rx }, { reason: rx }, { description: rx },
                { "rp.name": rx }, { "rp.email": rx }, { "ag.name": rx },
                { "rd.source": rx }, { "rd.destination": rx },
                { $expr: { $regexMatch: { input: { $toString: "$_id" }, regex: rx } } },
            ] } });
        }

        const ids = await SafetyReport.aggregate([
            { $match: pre }, ...lookups, ...post,
            { $sort: { priority: -1, createdAt: -1 } }, { $skip: skip }, { $limit: limit },
            { $project: { _id: 1 } },
        ]);
        const items = await SafetyReport.find({ _id: { $in: ids.map((x) => x._id) } })
            .populate("reporter_id", "name email")
            .populate("against_id", "name email status")
            .populate("ride_id", "source destination timing")
            .sort({ priority: -1, createdAt: -1 }).lean();
        const totalAgg = await SafetyReport.aggregate([{ $match: pre }, ...lookups, ...post, { $count: "n" }]);
        const total = totalAgg[0]?.n || 0;

        // Stat cards (platform-wide, across reports + SOS).
        const [stTotal, stOpen, stReview, stResolved, stSos] = await Promise.all([
            SafetyReport.countDocuments({}),
            SafetyReport.countDocuments({ status: "open" }),
            SafetyReport.countDocuments({ status: "under_review" }),
            SafetyReport.countDocuments({ status: "resolved" }),
            SosEvent.countDocuments({ status: "active" }),
        ]);

        res.status(200).json({
            items,
            meta: pageMeta(page, limit, total),
            stats: { total: stTotal, open: stOpen, underReview: stReview, resolved: stResolved, sosActive: stSos },
        });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Resolve / dismiss a safety report.
exports.resolveSafetyReport = async (req, res) => {
    const { id } = req.params;
    const { status, resolution } = req.body || {}; // resolved | dismissed | under_review
    const io = req.app.get("io"); const users = req.app.get("users") || {};
    if (!["resolved", "dismissed", "under_review"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
    }
    if ((status === "resolved" || status === "dismissed") && (!resolution || resolution.trim().length < 5)) {
        return res.status(400).json({ message: "Please add a resolution note (at least 5 characters)." });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    try {
        const report = await SafetyReport.findById(id);
        if (!report) return res.status(404).json({ message: "Report not found" });
        if (report.status === status) return res.status(400).json({ message: `Report is already ${status.replace(/_/g, " ")}.` });
        report.status = status;
        report.resolution = (resolution || "").slice(0, 500);
        if (status === "resolved" || status === "dismissed") {
            report.resolvedBy = req.user._id;
            report.resolvedAt = new Date();
        }
        await report.save();
        await createNotification({ io, users, userId: idStr(report.reporter_id), type: "system", title: `Report ${status}`, message: `Your safety report has been ${status}.${resolution ? " " + resolution : ""}`, link: { tab: "safety" } });
        await writeAudit(req, `safety.report.${status}`, { targetType: "safety_report", target_id: report._id, details: { resolution } });
        res.status(200).json({ message: `Report ${status}`, report: { _id: report._id, status: report.status } });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// List SOS events (paginated + status filter).
exports.listSosEvents = async (req, res) => {
    try {
        const { page, limit, skip } = paging(req);
        const filter = {};
        if (req.query.status && req.query.status !== "All") filter.status = req.query.status;
        const [items, total] = await Promise.all([
            SosEvent.find(filter)
                .populate("user_id", "name email phoneNumber")
                .populate("ride_id", "source destination")
                .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            SosEvent.countDocuments(filter),
        ]);
        res.status(200).json({ items, meta: pageMeta(page, limit, total) });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Update an SOS event (acknowledge / resolve) with notes.
exports.updateSosEvent = async (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body || {}; // acknowledged | resolved | false_alarm
    const io = req.app.get("io"); const users = req.app.get("users") || {};
    if (!["acknowledged", "resolved", "false_alarm"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
    }
    if ((status === "resolved" || status === "false_alarm") && (!notes || notes.trim().length < 5)) {
        return res.status(400).json({ message: "Please add a note (at least 5 characters)." });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    try {
        const sos = await SosEvent.findById(id);
        if (!sos) return res.status(404).json({ message: "SOS event not found" });
        if (sos.status === status) return res.status(400).json({ message: `SOS is already ${status.replace(/_/g, " ")}.` });
        sos.status = status;
        sos.adminNotes = (notes || "").slice(0, 500);
        if (status === "resolved" || status === "false_alarm") {
            sos.resolvedBy = req.user._id;
            sos.resolvedAt = new Date();
        }
        await sos.save();
        await createNotification({ io, users, userId: idStr(sos.user_id), type: "system", title: "SOS update", message: `Your SOS alert has been ${status.replace(/_/g, " ")} by the safety team.`, link: { tab: "safety" } });
        await writeAudit(req, `safety.sos.${status}`, { targetType: "sos_event", target_id: sos._id, details: { notes } });
        res.status(200).json({ message: `SOS ${status}`, sos: { _id: sos._id, status: sos.status } });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* =======================================================
   Smart Route Matching analytics (admin)
   ======================================================= */
exports.routeMatchAnalytics = async (req, res) => {
    try {
        const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));
        const { summary } = require("../utils/routeMatchAnalytics");
        const data = await summary(days);
        res.status(200).json(data);
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* =======================================================
   Ride Verification (admin) — logs + analytics
   ======================================================= */
const VerificationLog = require("../models/VerificationLog");

// Per-ride verification timeline (admin review).
exports.rideVerificationTimeline = async (req, res) => {
    const { rideId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(rideId)) return res.status(400).json({ message: "Invalid id" });
    try {
        const events = await VerificationLog.find({ ride_id: rideId })
            .populate("actor_id", "name").populate("passenger_id", "name")
            .sort({ createdAt: 1 }).lean();
        const ride = await Ride.findById(rideId)
            .select("source destination timing status tracking passengers user_id")
            .populate("user_id", "name").populate("passengers.user_id", "name").lean();
        res.status(200).json({ ride, events });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Recent verification events feed (admin).
exports.listVerificationLogs = async (req, res) => {
    try {
        const { page, limit, skip } = paging(req);
        const filter = {};
        if (req.query.event && req.query.event !== "All") filter.event = req.query.event;
        const [items, total] = await Promise.all([
            VerificationLog.find(filter)
                .populate("actor_id", "name").populate("passenger_id", "name").populate("ride_id", "source destination")
                .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            VerificationLog.countDocuments(filter),
        ]);
        res.status(200).json({ items, meta: pageMeta(page, limit, total) });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Verification analytics (admin): check-in success rate, no-show rate, etc.
exports.verificationAnalytics = async (req, res) => {
    try {
        const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));
        const since = new Date(); since.setDate(since.getDate() - days);
        const agg = await VerificationLog.aggregate([
            { $match: { createdAt: { $gte: since } } },
            { $group: { _id: "$event", count: { $sum: 1 } } },
        ]);
        const c = {};
        agg.forEach((a) => { c[a._id] = a.count; });
        const checkedIn = c.checked_in || 0;
        const verified = c.boarding_verified || 0;
        const starts = c.ride_started || 0;
        const noShows = (c.passenger_no_show || 0) + (c.driver_no_show || 0);
        res.status(200).json({
            days,
            counts: c,
            checkInSuccessRate: checkedIn ? Math.round((verified / checkedIn) * 100) : 0,
            verificationFailures: c.verification_failed || 0,
            completionConfirmations: c.dropoff_confirmed || 0,
            noShows,
            noShowRate: starts ? Math.round((noShows / (starts + noShows)) * 100) : 0,
        });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};
