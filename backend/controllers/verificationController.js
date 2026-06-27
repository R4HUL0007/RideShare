// =======================================================
// Driver & Vehicle Verification Controller
// -------------------------------------------------------
// Handles the driver-side submission and admin-side review workflow. Document
// URLs are expected to be Cloudinary URLs uploaded from the frontend (same
// pattern as profile pictures). No file upload handling on this server.
// =======================================================

const Verification = require("../models/Verification");
const User = require("../models/User");
const Vehicle = require("../models/Vehicle");
const mongoose = require("mongoose");
const { createNotification } = require("../utils/notify");
const { writeAudit } = require("../middleware/adminMiddleware");
const { isSafeHttpUrl, safeUrl } = require("../utils/sanitize");

// ---- Driver endpoints ----

/**
 * GET /api/verification/status — get current user's verification status + docs.
 */
exports.getMyVerification = async (req, res) => {
    try {
        let doc = await Verification.findOne({ user_id: req.user._id }).populate("vehicles.vehicle_id", "make model vehicleType licensePlate");
        if (!doc) {
            doc = { status: "not_submitted", vehicles: [], drivingLicense: {} };
        }
        res.status(200).json(doc);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * POST /api/verification/submit — submit (or resubmit) verification documents.
 * body: { drivingLicense: { url, fileName }, vehicles: [{ vehicle_id, rc: { url, fileName }, photos: { front, side, rear } }] }
 */
exports.submitVerification = async (req, res) => {
    const { drivingLicense, vehicles } = req.body;
    const userId = req.user._id;

    try {
        // Validate: DL required.
        if (!drivingLicense?.url || !isSafeHttpUrl(drivingLicense.url)) {
            return res.status(400).json({ message: "A valid Driving License document URL is required." });
        }
        // Validate: at least one vehicle with RC required.
        if (!vehicles || vehicles.length === 0) {
            return res.status(400).json({ message: "At least one vehicle with RC document is required." });
        }
        for (const v of vehicles) {
            if (!v.vehicle_id) return res.status(400).json({ message: "Vehicle ID is required for each entry." });
            if (!mongoose.Types.ObjectId.isValid(v.vehicle_id)) return res.status(400).json({ message: "Invalid vehicle id." });
            if (!v.rc?.url || !isSafeHttpUrl(v.rc.url)) return res.status(400).json({ message: `A valid RC document URL is required for vehicle ${v.vehicle_id}.` });
            // Validate ownership.
            const owned = await Vehicle.findOne({ _id: v.vehicle_id, user_id: userId });
            if (!owned) return res.status(403).json({ message: `Vehicle ${v.vehicle_id} not found or doesn't belong to you.` });
        }

        const now = new Date();
        let doc = await Verification.findOne({ user_id: userId });
        if (!doc) {
            doc = new Verification({ user_id: userId });
        }

        doc.drivingLicense = { url: safeUrl(drivingLicense.url), fileName: drivingLicense.fileName || "", uploadedAt: now };
        doc.vehicles = vehicles.map((v) => ({
            vehicle_id: v.vehicle_id,
            rc: { url: safeUrl(v.rc.url), fileName: v.rc.fileName || "", uploadedAt: now },
            photos: {
                front: { url: safeUrl(v.photos?.front), uploadedAt: now },
                side: { url: safeUrl(v.photos?.side), uploadedAt: now },
                rear: { url: safeUrl(v.photos?.rear), uploadedAt: now },
            },
        }));
        doc.status = "pending";
        doc.submittedAt = now;
        doc.adminRemarks = "";
        await doc.save();

        res.status(200).json({ message: "Verification submitted for review.", verification: doc });
    } catch (err) {
        console.error("submitVerification error:", err.message);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ---- Admin endpoints ----

/**
 * GET /api/verification/admin/list — paginated list of verifications.
 */
exports.listVerifications = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;
        const pre = {};
        if (req.query.status && req.query.status !== "All") pre.status = req.query.status;

        const lookups = [{ $lookup: { from: "users", localField: "user_id", foreignField: "_id", as: "u" } }];
        const post = [];
        if (req.query.q) {
            const rx = new RegExp(String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            post.push({ $match: { $or: [
                { "u.name": rx }, { "u.email": rx }, { "ocrData.dlNumber": rx },
                { $expr: { $regexMatch: { input: { $toString: "$_id" }, regex: rx } } },
            ] } });
        }

        const ids = await Verification.aggregate([
            { $match: pre }, ...lookups, ...post,
            { $sort: { submittedAt: -1 } }, { $skip: skip }, { $limit: limit },
            { $project: { _id: 1 } },
        ]);
        const items = await Verification.find({ _id: { $in: ids.map((x) => x._id) } })
            .populate("user_id", "name email phoneNumber role gender isDriverVerified")
            .populate("vehicles.vehicle_id", "make model vehicleType licensePlate")
            .sort({ submittedAt: -1 }).lean();
        const totalAgg = await Verification.aggregate([{ $match: pre }, ...lookups, ...post, { $count: "n" }]);
        const total = totalAgg[0]?.n || 0;

        // Stat cards. The schema has no "expired" state, so it reports 0.
        const [stTotal, stPending, stApproved, stRejected] = await Promise.all([
            Verification.countDocuments({ status: { $ne: "not_submitted" } }),
            Verification.countDocuments({ status: "pending" }),
            Verification.countDocuments({ status: "approved" }),
            Verification.countDocuments({ status: "rejected" }),
        ]);

        res.status(200).json({
            items,
            meta: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
            stats: { total: stTotal, pending: stPending, approved: stApproved, rejected: stRejected, expired: 0 },
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * GET /api/verification/admin/:id — single verification details.
 */
exports.getVerificationDetail = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid verification id." });
        const doc = await Verification.findById(req.params.id)
            .populate("user_id", "name email phoneNumber role gender isDriverVerified ratings createdAt")
            .populate("vehicles.vehicle_id", "make model vehicleType licensePlate totalSeats year color")
            .populate("reviewedBy", "name email");
        if (!doc) return res.status(404).json({ message: "Verification not found." });
        res.status(200).json(doc);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * POST /api/verification/admin/:id/decision — approve / reject.
 * body: { decision: "approved" | "rejected", remarks?: string }
 */
exports.decideVerification = async (req, res) => {
    const { decision, remarks } = req.body || {};
    if (!["approved", "rejected"].includes(decision)) {
        return res.status(400).json({ message: "Decision must be 'approved' or 'rejected'." });
    }
    if (decision === "rejected" && (!remarks || remarks.trim().length < 5)) {
        return res.status(400).json({ message: "Please add remarks explaining the rejection (at least 5 characters)." });
    }
    if (decision === "approved" && (!remarks || remarks.trim().length < 5)) {
        return res.status(400).json({ message: "Please add remarks for this approval (at least 5 characters)." });
    }
    const io = req.app.get("io");
    const users = req.app.get("users") || {};

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid verification id." });
        const doc = await Verification.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: "Verification not found." });
        if (doc.status === decision) return res.status(400).json({ message: `Already ${decision}.` });

        doc.status = decision;
        doc.reviewedAt = new Date();
        doc.reviewedBy = req.user._id;
        doc.adminRemarks = (remarks || "").slice(0, 500);
        await doc.save();

        // Mark linked vehicles first, THEN flip the user flag last, so a partial
        // failure never leaves a user "verified" with unverified vehicles.
        if (doc.vehicles?.length) {
            const vehicleIds = doc.vehicles.map((v) => v.vehicle_id);
            await Vehicle.updateMany({ _id: { $in: vehicleIds } }, { isVerified: decision === "approved" });
        }

        // Update user's isDriverVerified flag (the user-visible gate) last.
        const userUpd = await User.updateOne(
            { _id: doc.user_id },
            { $set: { isDriverVerified: decision === "approved" } }
        );
        if (!userUpd.matchedCount) {
            return res.status(404).json({ message: "The driver account no longer exists." });
        }

        // Notify the driver.
        const notifTitle = decision === "approved" ? "Verification approved ✅" : "Verification rejected";
        const notifMsg = decision === "approved"
            ? "Your driver verification has been approved! You can now create rides."
            : `Your verification was rejected.${remarks ? " Reason: " + remarks : ""} You may resubmit with corrected documents.`;
        await createNotification({ io, users, userId: doc.user_id, type: "system", title: notifTitle, message: notifMsg, link: { tab: "myVehicle" } });

        // Audit log.
        await writeAudit(req, `verification.${decision}`, { targetType: "verification", target_id: doc._id, details: { userId: doc.user_id, remarks } });

        res.status(200).json({ message: `Verification ${decision}.`, verification: { _id: doc._id, status: doc.status } });
    } catch (err) {
        console.error("decideVerification error:", err.message);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};
