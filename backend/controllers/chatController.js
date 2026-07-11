const mongoose = require("mongoose");
const Message = require("../models/Message");
const Ride = require("../models/Ride");
const User = require("../models/User");
const { createNotification } = require("../utils/notify");
const { moderateMessage } = require("../utils/moderation");

// Normalize an id-ish value (ObjectId | populated doc | string) to a string.
const idStr = (v) => {
    if (!v) return null;
    if (typeof v === "string") return v;
    if (v._id) return v._id.toString();
    return v.toString();
};

// Extract the passenger user ids from a ride (handles old/new passenger shapes).
const passengerIds = (ride) =>
    (ride.passengers || [])
        .map((p) => (p && typeof p === "object" && p.user_id ? idStr(p.user_id) : idStr(p)))
        .filter(Boolean);

// A user participates in a ride if they are the driver or a booked passenger.
const isParticipant = (ride, userId) =>
    idStr(ride.user_id) === userId || passengerIds(ride).includes(userId);

// Do two users share at least one ride (driver↔passenger, either direction)?
// Conversations are keyed by the user pair, so this is the authorization gate
// for fetching/sending across the merged (cross-ride) thread.
const shareARide = (userA, userB) =>
    Ride.exists({
        $or: [
            { user_id: userA, "passengers.user_id": userB },
            { user_id: userB, "passengers.user_id": userA },
        ],
    });

// Resolve the "other party" for a one-to-one ride conversation from `userId`'s
// perspective. The driver may chat with any passenger (counterpartId required);
// a passenger always chats with the driver.
const resolveCounterpart = (ride, userId, counterpartId) => {
    const driverId = idStr(ride.user_id);
    if (userId === driverId) {
        // Driver: the counterpart must be a passenger on this ride.
        if (counterpartId && passengerIds(ride).includes(counterpartId)) return counterpartId;
        return null;
    }
    // Passenger: counterpart is always the driver.
    return driverId;
};

/**
 * GET /api/chat/conversations
 * List the current user's conversations, keyed by the OTHER user (merged across
 * every ride they've shared). If the same two people get matched again on a new
 * ride, it continues the existing conversation instead of creating a new one.
 * Each conversation carries the most-recent shared ride as context.
 */
exports.getConversations = async (req, res) => {
    const userId = req.user.id;
    try {
        // Rides the user is connected to (as driver or passenger), newest first.
        const rides = await Ride.find({
            $or: [{ user_id: userId }, { "passengers.user_id": userId }],
        })
            .populate("user_id", "name email profilePicture role")
            .populate("passengers.user_id", "name email profilePicture role")
            .sort({ updatedAt: -1 })
            .lean();

        // Group by counterpart. Because rides are sorted newest-first, the first
        // time we see a counterpart is their most-recent shared ride → use it as
        // the representative ride for context + send routing.
        const byCp = new Map(); // cpId -> { counterpart, rideId, ride, rideUpdatedAt }
        for (const ride of rides) {
            const driverId = idStr(ride.user_id);
            const isDriver = driverId === userId;

            let counterparts = [];
            if (isDriver) {
                counterparts = (ride.passengers || []).map((p) => p.user_id).filter(Boolean);
            } else if (ride.user_id) {
                counterparts = [ride.user_id];
            }

            for (const cp of counterparts) {
                const cpId = idStr(cp);
                if (!cpId || cpId === userId || byCp.has(cpId)) continue;
                byCp.set(cpId, {
                    counterpart: { _id: cpId, name: cp.name, profilePicture: cp.profilePicture || "", role: cp.role },
                    rideId: ride._id,
                    ride: { source: ride.source, destination: ride.destination, timing: ride.timing, status: ride.status },
                    rideUpdatedAt: ride.updatedAt,
                });
            }
        }

        // Which conversations has this user archived?
        const me = await User.findById(userId).select("archivedChats").lean();
        const archivedSet = new Set((me?.archivedChats || []).map((a) => idStr(a)));

        const conversations = [];
        for (const [cpId, info] of byCp) {
            const pair = [userId, cpId];

            // Last message + unread are computed across ALL rides between the
            // pair (the merged thread), excluding messages this user cleared.
            const last = await Message.findOne({
                sender: { $in: pair },
                receiver: { $in: pair },
                clearedBy: { $ne: userId },
            })
                .sort({ createdAt: -1 })
                .lean();

            const unread = await Message.countDocuments({
                sender: cpId,
                receiver: userId,
                read: false,
                clearedBy: { $ne: userId },
            });

            conversations.push({
                rideId: info.rideId,
                counterpart: info.counterpart,
                ride: info.ride,
                lastMessage: last
                    ? { text: last.text, type: last.type || "text", createdAt: last.createdAt, sender: idStr(last.sender) }
                    : null,
                unread,
                archived: archivedSet.has(cpId),
                updatedAt: last ? last.createdAt : info.rideUpdatedAt,
            });
        }

        // Newest activity first.
        conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        res.status(200).json(conversations);
    } catch (error) {
        console.error("Error in getConversations:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * GET /api/chat/:rideId/:counterpartId
 * Fetch the FULL message thread between the current user and the counterpart,
 * merged across every ride they've shared (so re-matching continues the same
 * conversation). `rideId` is kept for routing/context only. Marks the
 * counterpart's messages as read.
 */
exports.getMessages = async (req, res) => {
    const userId = req.user.id;
    const { counterpartId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(counterpartId)) {
        return res.status(400).json({ message: "Invalid user id" });
    }

    try {
        // Authorization: the two users must share at least one ride.
        if (!(await shareARide(userId, counterpartId))) {
            return res.status(403).json({ message: "Invalid conversation participant" });
        }

        const pair = [userId, counterpartId];
        const messages = await Message.find({
            sender: { $in: pair },
            receiver: { $in: pair },
            clearedBy: { $ne: userId },
        })
            .sort({ createdAt: 1 })
            .lean();

        // Mark the counterpart's messages to me as read (across all rides).
        await Message.updateMany(
            { sender: counterpartId, receiver: userId, read: false },
            { $set: { read: true, readAt: new Date() } }
        );

        // Emit the read receipt so the sender's tick updates immediately (the
        // explicit PATCH isn't always called when opening via GET).
        const io = req.app.get("io");
        if (io) io.to(String(counterpartId)).emit("chat:read", { by: userId });

        res.status(200).json(messages);
    } catch (error) {
        console.error("Error in getMessages:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * POST /api/chat/:rideId/:counterpartId
 * Send a message to the counterpart within a ride. Emits a real-time event to
 * the receiver (and an echo to the sender's other sessions) via Socket.io.
 */
exports.sendMessage = async (req, res) => {
    const userId = req.user.id;
    const { rideId, counterpartId } = req.params;
    const { text, type, location } = req.body || {};
    const io = req.app.get("io");
    const users = req.app.get("users") || {};

    const isLocation = type === "location";

    // Validate by message kind. Text messages need non-empty text; location
    // messages need finite coordinates (text is optional and defaults to a label).
    if (isLocation) {
        const lat = Number(location?.lat);
        const lng = Number(location?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).json({ message: "Valid location coordinates are required" });
        }
    } else if (!text || !text.trim()) {
        return res.status(400).json({ message: "Message text is required" });
    }

    // Moderate text messages: strip phone numbers (anti-circumvention of contact
    // masking) and mask abuse/violence. Location labels are provider-geocoded.
    const moderated = isLocation
        ? { text: null, redactedPhone: false, profane: false }
        : moderateMessage(text.trim());
    const safeText = moderated.text;
    const contactRedacted = moderated.redactedPhone;
    const profane = moderated.profane;

    if (!mongoose.Types.ObjectId.isValid(rideId) || !mongoose.Types.ObjectId.isValid(counterpartId)) {
        return res.status(400).json({ message: "Invalid ride or user id" });
    }

    try {
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });

        if (!isParticipant(ride, userId)) {
            return res.status(403).json({ message: "You are not part of this ride" });
        }
        const expected = resolveCounterpart(ride, userId, counterpartId);
        if (!expected || expected !== counterpartId) {
            return res.status(403).json({ message: "Invalid conversation participant" });
        }

        const doc = {
            ride_id: rideId,
            sender: userId,
            receiver: counterpartId,
            type: isLocation ? "location" : "text",
            text: isLocation ? (location?.address?.trim() || "📍 Shared location") : safeText,
        };
        if (isLocation) {
            doc.location = {
                lat: Number(location.lat),
                lng: Number(location.lng),
                address: location?.address?.trim() || "",
            };
        }

        const message = await Message.create(doc);

        const payload = message.toObject();

        // Real-time delivery to ALL of the receiver's devices, and an echo to
        // the sender's other sessions (rooms are keyed by user id).
        if (io) {
            io.to(String(counterpartId)).emit("chat:message", payload);
            io.to(String(userId)).emit("chat:message", payload);
        }

        // Persisted, user-scoped notification for the receiver (bell + history).
        const preview = isLocation ? "📍 Shared a location" : doc.text;
        await createNotification({
            io, users,
            userId: counterpartId,
            type: "chat",
            title: `New message from ${req.user.name?.split(" ")[0] || "your co-traveller"}`,
            message: preview.length > 80 ? `${preview.slice(0, 80)}…` : preview,
            rideId,
            link: { tab: "chats" },
        });

        res.status(201).json({ ...payload, contactRedacted, profane });
    } catch (error) {
        console.error("Error in sendMessage:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * PATCH /api/chat/:rideId/:counterpartId/read
 * Mark the counterpart's messages as read (across the merged thread).
 */
exports.markRead = async (req, res) => {
    const userId = req.user.id;
    const { rideId, counterpartId } = req.params;
    const io = req.app.get("io");
    const users = req.app.get("users") || {};

    if (!mongoose.Types.ObjectId.isValid(counterpartId)) {
        return res.status(400).json({ message: "Invalid user id" });
    }

    try {
        if (!(await shareARide(userId, counterpartId))) {
            return res.status(403).json({ message: "Invalid conversation participant" });
        }

        await Message.updateMany(
            { sender: counterpartId, receiver: userId, read: false },
            { $set: { read: true, readAt: new Date() } }
        );

        // Notify the counterpart that their messages were read (read receipts).
        if (io) {
            io.to(String(counterpartId)).emit("chat:read", { rideId, by: userId });
        }

        res.status(200).json({ message: "Marked as read" });
    } catch (error) {
        console.error("Error in markRead:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * GET /api/chat/unread-count
 * Total unread messages addressed to the current user (for the nav badge).
 */
exports.getUnreadCount = async (req, res) => {
    const userId = req.user.id;
    try {
        const count = await Message.countDocuments({ receiver: userId, read: false, clearedBy: { $ne: userId } });
        res.status(200).json({ count });
    } catch (error) {
        console.error("Error in getUnreadCount:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * DELETE /api/chat/:rideId/:counterpartId
 * Clear the conversation for the CURRENT user only — across the whole merged
 * thread with the counterpart. Marks each message with the user's id in
 * `clearedBy` so it's hidden from their view while intact for the counterpart.
 */
exports.clearChat = async (req, res) => {
    const userId = req.user.id;
    const { counterpartId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(counterpartId)) {
        return res.status(400).json({ message: "Invalid user id" });
    }

    try {
        if (!(await shareARide(userId, counterpartId))) {
            return res.status(403).json({ message: "Invalid conversation participant" });
        }

        const pair = [userId, counterpartId];
        await Message.updateMany(
            {
                sender: { $in: pair },
                receiver: { $in: pair },
                clearedBy: { $ne: userId },
            },
            { $addToSet: { clearedBy: userId } }
        );

        res.status(200).json({ message: "Chat cleared" });
    } catch (error) {
        console.error("Error in clearChat:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * PATCH /api/chat/archive/:counterpartId
 * Archive the conversation with the counterpart (for the current user only).
 */
exports.archiveChat = async (req, res) => {
    const userId = req.user.id;
    const { counterpartId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(counterpartId)) {
        return res.status(400).json({ message: "Invalid user id" });
    }
    try {
        if (!(await shareARide(userId, counterpartId))) {
            return res.status(403).json({ message: "Invalid conversation participant" });
        }
        await User.findByIdAndUpdate(userId, { $addToSet: { archivedChats: counterpartId } });
        res.status(200).json({ message: "Conversation archived" });
    } catch (error) {
        console.error("Error in archiveChat:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * PATCH /api/chat/unarchive/:counterpartId
 * Move the conversation back out of the archive (for the current user only).
 */
exports.unarchiveChat = async (req, res) => {
    const userId = req.user.id;
    const { counterpartId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(counterpartId)) {
        return res.status(400).json({ message: "Invalid user id" });
    }
    try {
        await User.findByIdAndUpdate(userId, { $pull: { archivedChats: counterpartId } });
        res.status(200).json({ message: "Conversation unarchived" });
    } catch (error) {
        console.error("Error in unarchiveChat:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
