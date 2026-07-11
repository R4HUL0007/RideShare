// =======================================================
// Safety Center & Emergency Response Controller
// -------------------------------------------------------
// Emergency contacts, SOS alerts, trip sharing, and safety reports. All
// user-facing endpoints are hard-scoped to req.user. Admin review lives in the
// admin controller section below (exported for adminRoutes).
// =======================================================

const mongoose = require("mongoose");
const EmergencyContact = require("../models/EmergencyContact");
const SosEvent = require("../models/SosEvent");
const SafetyReport = require("../models/SafetyReport");
const TripShare = require("../models/TripShare");
const Ride = require("../models/Ride");
const User = require("../models/User");
const { createNotification } = require("../utils/notify");
const { sendSosEmail } = require("../utils/emailService");
const { safeUrl } = require("../utils/sanitize");

const idStr = (v) => (v == null ? null : typeof v === "string" ? v : v._id ? v._id.toString() : v.toString());

// Base URL for building public tracking links (frontend origin).
const frontendBase = () => (process.env.FRONTEND_URL || "http://localhost:3000").split(",")[0].trim();

/* =======================================================
   Emergency Contacts
   ======================================================= */
exports.listContacts = async (req, res) => {
    try {
        const contacts = await EmergencyContact.find({ user_id: req.user._id }).sort({ priority: 1, createdAt: 1 }).lean();
        res.status(200).json(contacts);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

exports.addContact = async (req, res) => {
    const { name, phoneNumber, email, relationship, priority } = req.body || {};
    try {
        if (!name || !phoneNumber) return res.status(400).json({ message: "Name and phone number are required." });
        if (!/^\d{10}$/.test(String(phoneNumber).replace(/\D/g, "").slice(-10))) {
            return res.status(400).json({ message: "Enter a valid 10-digit phone number." });
        }
        // Only one primary contact — demote any existing primary.
        if (priority === "primary") {
            await EmergencyContact.updateMany({ user_id: req.user._id, priority: "primary" }, { priority: "secondary" });
        }
        const contact = await EmergencyContact.create({
            user_id: req.user._id,
            name: String(name).trim(),
            phoneNumber: String(phoneNumber).trim(),
            email: String(email || "").trim(),
            relationship: relationship || "Other",
            priority: priority || "other",
        });
        res.status(201).json({ message: "Contact added", contact });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

exports.updateContact = async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    try {
        const contact = await EmergencyContact.findOne({ _id: id, user_id: req.user._id });
        if (!contact) return res.status(404).json({ message: "Contact not found" });
        const { name, phoneNumber, email, relationship, priority } = req.body || {};
        if (priority === "primary" && contact.priority !== "primary") {
            await EmergencyContact.updateMany({ user_id: req.user._id, priority: "primary" }, { priority: "secondary" });
        }
        if (name != null) contact.name = String(name).trim();
        if (phoneNumber != null) contact.phoneNumber = String(phoneNumber).trim();
        if (email != null) contact.email = String(email).trim();
        if (relationship != null) contact.relationship = relationship;
        if (priority != null) contact.priority = priority;
        await contact.save();
        res.status(200).json({ message: "Contact updated", contact });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

exports.deleteContact = async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    try {
        const deleted = await EmergencyContact.findOneAndDelete({ _id: id, user_id: req.user._id });
        if (!deleted) return res.status(404).json({ message: "Contact not found" });
        res.status(200).json({ message: "Contact deleted" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

exports.setPrimaryContact = async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    try {
        const contact = await EmergencyContact.findOne({ _id: id, user_id: req.user._id });
        if (!contact) return res.status(404).json({ message: "Contact not found" });
        await EmergencyContact.updateMany({ user_id: req.user._id, priority: "primary" }, { priority: "secondary" });
        contact.priority = "primary";
        await contact.save();
        res.status(200).json({ message: "Primary contact set", contact });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/* =======================================================
   SOS Emergency
   ======================================================= */
exports.triggerSos = async (req, res) => {
    const { rideId, lat, lng, address } = req.body || {};
    const io = req.app.get("io");
    const users = req.app.get("users") || {};
    try {
        // Dedup: if the user already has an ACTIVE SOS, don't raise a new one and
        // re-spam contacts/admins on every tap — just refresh its location and
        // return the existing alert. A fresh SOS starts only after cancel/resolve.
        const activeSos = await SosEvent.findOne({ user_id: req.user._id, status: "active" }).sort({ createdAt: -1 });
        if (activeSos) {
            if (lat != null || lng != null || address) {
                activeSos.location = {
                    lat: lat ?? activeSos.location?.lat ?? null,
                    lng: lng ?? activeSos.location?.lng ?? null,
                    address: address || activeSos.location?.address || "",
                };
                await activeSos.save();
                if (io) {
                    const admins = await User.find({ isAdmin: true }).select("_id").lean();
                    admins.forEach((a) => io.to(idStr(a._id)).emit("safety:sos", {
                        id: idStr(activeSos._id), user: req.user.name, at: activeSos.createdAt, location: activeSos.location, update: true,
                    }));
                }
            }
            return res.status(200).json({
                message: "An SOS is already active — your location was updated. For immediate danger, call 112.",
                sos: {
                    _id: activeSos._id,
                    trackingLink: activeSos.trackingLink,
                    notifiedCount: (activeSos.notifiedContacts || []).length,
                    alreadyActive: true,
                },
            });
        }

        // Build a ride snapshot if a ride is provided.
        let rideSnapshot = {};
        let trackingLink = "";
        let ride = null;
        if (rideId && mongoose.Types.ObjectId.isValid(rideId)) {
            ride = await Ride.findById(rideId).populate("user_id", "name phoneNumber").populate("vehicle_id", "make model licensePlate").lean();
            if (ride) {
                // Only attach ride context the caller actually belongs to. Otherwise
                // a user could pass any ride id to harvest the driver's phone/plate
                // and mint a public tracking link for a ride they're not on (IDOR).
                // Not a participant → drop the ride context but still raise the SOS.
                const isParticipant =
                    idStr(ride.user_id?._id || ride.user_id) === idStr(req.user._id) ||
                    (ride.passengers || []).some((p) => idStr(p.user_id || p) === idStr(req.user._id));
                if (!isParticipant) {
                    ride = null;
                } else {
                    rideSnapshot = {
                        source: ride.source || "",
                        destination: ride.destination || "",
                        driverName: ride.user_id?.name || "",
                        driverPhone: ride.user_id?.phoneNumber || "",
                        vehicle: ride.vehicle_id ? `${ride.vehicle_id.make || ""} ${ride.vehicle_id.model || ""}`.trim() : "",
                        licensePlate: ride.vehicle_id?.licensePlate || "",
                    };
                    // Reuse an active trip share or create one for the tracking link.
                    const share = await ensureTripShare(req.user._id, ride._id);
                    trackingLink = `${frontendBase()}/track/${share.token}`;
                }
            }
        }

        const contacts = await EmergencyContact.find({ user_id: req.user._id }).sort({ priority: 1 }).lean();

        const sos = await SosEvent.create({
            user_id: req.user._id,
            ride_id: ride?._id || null,
            location: { lat: lat ?? null, lng: lng ?? null, address: address || "" },
            rideSnapshot,
            trackingLink,
            notifiedContacts: contacts.map((c) => ({ name: c.name, phoneNumber: c.phoneNumber, relationship: c.relationship })),
            status: "active",
        });

        // Notify the user (confirmation), their emergency contacts (in-app where
        // they are users), all admins, and emit a real-time admin alert.
        await createNotification({ io, users, userId: req.user._id, type: "system", title: "🚨 SOS activated", message: "Your emergency alert has been sent to your contacts and the RidexShare safety team.", link: { tab: "safety" } });

        // Notify admins in-app + real-time socket broadcast for live monitoring.
        const admins = await User.find({ isAdmin: true }).select("_id").lean();
        for (const a of admins) {
            await createNotification({ io, users, userId: a._id, type: "system", title: "🚨 SOS Emergency", message: `${req.user.name} triggered an SOS${rideSnapshot.destination ? ` during a ride to ${rideSnapshot.destination}` : ""}.`, link: { tab: "admin" } });
        }
        if (io) admins.forEach((a) => io.to(idStr(a._id)).emit("safety:sos", { id: idStr(sos._id), user: req.user.name, at: sos.createdAt, location: sos.location }));

        // Email the emergency contacts that have an email on file + the safety
        // inbox, so the alert reaches people outside the app immediately.
        // Best-effort: email failures never block the SOS response. (SMS via
        // Twilio/MSG91 can be added here later for non-email contacts.)
        const sosPayload = {
            userName: req.user.name,
            userPhone: req.user.phoneNumber,
            location: sos.location,
            rideSnapshot,
            trackingLink,
        };
        const emailJobs = contacts
            .filter((c) => c.email && /\S+@\S+\.\S+/.test(c.email))
            .map((c) => sendSosEmail({ ...sosPayload, to: c.email, contactName: c.name }));
        const safetyInbox = process.env.SUPPORT_EMAIL || process.env.EMAIL_USER;
        if (safetyInbox) emailJobs.push(sendSosEmail({ ...sosPayload, to: safetyInbox, contactName: "RidexShare Safety Team" }));
        const emailResults = await Promise.allSettled(emailJobs);
        const emailedCount = emailResults.filter((r) => r.status === "fulfilled" && r.value).length;

        res.status(201).json({
            message: contacts.length
                ? "SOS triggered. Your contacts and the safety team have been alerted."
                : "SOS triggered — the safety team has been alerted. Add emergency contacts so they're notified too.",
            sos: { _id: sos._id, trackingLink, notifiedCount: contacts.length, emailedCount },
        });
    } catch (err) {
        console.error("triggerSos error:", err.message);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

exports.cancelSos = async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    try {
        const sos = await SosEvent.findOne({ _id: id, user_id: req.user._id });
        if (!sos) return res.status(404).json({ message: "SOS event not found" });
        if (sos.status === "active") {
            sos.status = "false_alarm";
            sos.resolvedAt = new Date();
            await sos.save();
        }
        res.status(200).json({ message: "SOS marked as a false alarm.", sos: { _id: sos._id, status: sos.status } });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/* =======================================================
   Trip Sharing
   ======================================================= */
async function ensureTripShare(userId, rideId) {
    let share = await TripShare.findOne({ user_id: userId, ride_id: rideId, active: true, expiresAt: { $gt: new Date() } });
    if (share) return share;
    share = await TripShare.create({
        user_id: userId,
        ride_id: rideId,
        token: TripShare.makeToken(),
        active: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    });
    return share;
}

exports.shareTrip = async (req, res) => {
    const { rideId } = req.body || {};
    const io = req.app.get("io");
    const users = req.app.get("users") || {};
    if (!rideId || !mongoose.Types.ObjectId.isValid(rideId)) return res.status(400).json({ message: "Valid rideId required" });
    try {
        const ride = await Ride.findById(rideId).lean();
        if (!ride) return res.status(404).json({ message: "Ride not found" });
        // Only a participant can share the trip.
        const isParticipant = idStr(ride.user_id) === idStr(req.user._id) ||
            (ride.passengers || []).some((p) => idStr(p.user_id || p) === idStr(req.user._id));
        if (!isParticipant) return res.status(403).json({ message: "You are not part of this ride." });

        const share = await ensureTripShare(req.user._id, ride._id);
        const link = `${frontendBase()}/track/${share.token}`;

        await createNotification({ io, users, userId: req.user._id, type: "system", title: "Trip shared", message: "A secure tracking link for your trip has been created.", link: { tab: "safety" } });

        res.status(200).json({ message: "Trip share link ready", link, token: share.token, expiresAt: share.expiresAt });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * PUBLIC (no auth): resolve a share token to a read-only tracking snapshot.
 */
exports.viewSharedTrip = async (req, res) => {
    const { token } = req.params;
    try {
        const share = await TripShare.findOne({ token });
        if (!share || !share.active || share.expiresAt < new Date()) {
            return res.status(404).json({ message: "This tracking link is invalid or has expired." });
        }
        share.viewCount += 1;
        await share.save();

        const ride = await Ride.findById(share.ride_id)
            .populate("user_id", "name profilePicture")
            .populate("vehicle_id", "make model licensePlate vehicleType")
            .lean();
        if (!ride) return res.status(404).json({ message: "Ride not found." });

        // Read-only, privacy-limited snapshot (no phone numbers / emails).
        res.status(200).json({
            source: ride.source,
            destination: ride.destination,
            sourceCoords: ride.sourceCoords,
            destinationCoords: ride.destinationCoords,
            driverName: ride.user_id?.name || "Driver",
            vehicle: ride.vehicle_id ? `${ride.vehicle_id.make || ""} ${ride.vehicle_id.model || ""}`.trim() : "",
            licensePlate: ride.vehicle_id?.licensePlate || "",
            tracking: ride.tracking || { state: "scheduled", driverLocation: { lat: null, lng: null } },
            timing: ride.timing,
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/* =======================================================
   Safety Reports
   ======================================================= */
exports.submitReport = async (req, res) => {
    const { reportType, reason, description, rideId, againstId, evidence } = req.body || {};
    const io = req.app.get("io");
    const users = req.app.get("users") || {};
    const VALID = ["driver", "passenger", "ride", "unsafe_driving", "harassment", "vehicle_mismatch", "fake_profile", "payment_issue", "other"];
    try {
        if (!reportType || !VALID.includes(reportType)) return res.status(400).json({ message: "Select a valid report type." });
        if (againstId && mongoose.Types.ObjectId.isValid(againstId) && idStr(againstId) === idStr(req.user._id)) {
            return res.status(400).json({ message: "You can't file a safety report against yourself." });
        }
        const report = await SafetyReport.create({
            reporter_id: req.user._id,
            against_id: againstId && mongoose.Types.ObjectId.isValid(againstId) ? againstId : null,
            ride_id: rideId && mongoose.Types.ObjectId.isValid(rideId) ? rideId : null,
            reportType,
            reason: (reason || "").slice(0, 200),
            description: (description || "").slice(0, 2000),
            evidence: Array.isArray(evidence) ? evidence.map((e) => safeUrl(e)).filter(Boolean).slice(0, 5) : [],
            priority: ["harassment", "unsafe_driving"].includes(reportType) ? "high" : "medium",
        });

        await createNotification({ io, users, userId: req.user._id, type: "system", title: "Report submitted", message: "Thank you. Our safety team will review your report.", link: { tab: "safety" } });

        const admins = await User.find({ isAdmin: true }).select("_id").lean();
        for (const a of admins) {
            await createNotification({ io, users, userId: a._id, type: "system", title: "New safety report", message: `${req.user.name} submitted a ${reportType.replace(/_/g, " ")} report.`, link: { tab: "admin" } });
        }

        res.status(201).json({ message: "Report submitted", report: { _id: report._id, status: report.status } });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/* =======================================================
   Incident History (user's own)
   ======================================================= */
exports.myIncidents = async (req, res) => {
    try {
        const [reports, sosEvents] = await Promise.all([
            SafetyReport.find({ reporter_id: req.user._id }).sort({ createdAt: -1 }).limit(50).lean(),
            SosEvent.find({ user_id: req.user._id }).sort({ createdAt: -1 }).limit(50).lean(),
        ]);
        res.status(200).json({ reports, sosEvents });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/* =======================================================
   Safety overview (verification + counts) for the Safety Center
   ======================================================= */
exports.overview = async (req, res) => {
    try {
        const [contactCount, openReports, user] = await Promise.all([
            EmergencyContact.countDocuments({ user_id: req.user._id }),
            SafetyReport.countDocuments({ reporter_id: req.user._id, status: { $in: ["open", "under_review"] } }),
            User.findById(req.user._id).select("isDriverVerified").lean(),
        ]);
        res.status(200).json({
            emergencyContacts: contactCount,
            openReports,
            isDriverVerified: Boolean(user?.isDriverVerified),
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

// Exported for ride-snapshot reuse elsewhere if needed.
exports._ensureTripShare = ensureTripShare;
