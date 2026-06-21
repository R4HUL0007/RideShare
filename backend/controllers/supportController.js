// =======================================================
// Live Support — user <-> agent (admin) chat sessions.
// User requests support -> session goes "waiting". An admin claims it ->
// "active" + a system "joined" message. Both sides exchange messages until an
// agent or the user closes it. Polling-based (no socket dependency required),
// with a best-effort socket emit for liveliness.
// =======================================================

const mongoose = require("mongoose");
const SupportSession = require("../models/SupportSession");
const SupportTicket = require("../models/SupportTicket");
const { sendSupportTicketEmail } = require("../utils/emailService");
const { createNotification } = require("../utils/notify");
const { writeAudit } = require("../middleware/adminMiddleware");

const idStr = (v) => (v == null ? null : v._id ? v._id.toString() : v.toString());

// Best-effort socket ping so the other side can refresh promptly.
function ping(req, userId) {
    try {
        const io = req.app.get("io");
        const users = req.app.get("users") || {};
        if (io) io.emit("support:update", { at: Date.now() });
        if (io && userId) io.to(String(userId)).emit("support:update", { at: Date.now() });
    } catch { /* ignore */ }
}

const publicSession = (s) => ({
    _id: s._id,
    userName: s.userName,
    userEmail: s.userEmail,
    topic: s.topic,
    status: s.status,
    agentName: s.agentName,
    messages: s.messages,
    lastMessageAt: s.lastMessageAt,
    unreadForAgent: s.unreadForAgent,
    unreadForUser: s.unreadForUser,
    createdAt: s.createdAt,
});

/* ---------------- User endpoints ---------------- */

// Create (or return an existing open) support session for the current user.
exports.requestSupport = async (req, res) => {
    try {
        const topic = (req.body?.topic || "General help").slice(0, 120);
        let session = await SupportSession.findOne({ user_id: req.user._id, status: { $in: ["waiting", "active"] } });
        if (session) return res.status(200).json(publicSession(session));

        session = await SupportSession.create({
            user_id: req.user._id,
            userName: req.user.name,
            userEmail: req.user.email,
            topic,
            status: "waiting",
            messages: [{ from: "system", text: `Support request created${topic ? ` · ${topic}` : ""}. Waiting for an agent…`, at: new Date() }],
            lastMessageAt: new Date(),
            unreadForAgent: 1,
        });
        ping(req);
        res.status(201).json(publicSession(session));
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Current user's open session (waiting/active), or null.
exports.mySession = async (req, res) => {
    try {
        const session = await SupportSession.findOne({ user_id: req.user._id, status: { $in: ["waiting", "active"] } })
            .sort({ createdAt: -1 });
        if (!session) return res.status(200).json(null);
        // Reading clears the user's unread badge.
        if (session.unreadForUser > 0) { session.unreadForUser = 0; await session.save(); }
        res.status(200).json(publicSession(session));
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// User sends a message in their session.
exports.userMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const text = (req.body?.text || "").trim().slice(0, 2000);
        if (!text) return res.status(400).json({ message: "Message required" });
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const session = await SupportSession.findById(id);
        if (!session) return res.status(404).json({ message: "Session not found" });
        if (idStr(session.user_id) !== idStr(req.user._id)) return res.status(403).json({ message: "Not your session" });
        if (session.status === "closed") return res.status(400).json({ message: "This chat has been closed" });

        // Atomic push + increment so concurrent messages can't lose an unread bump.
        const updated = await SupportSession.findByIdAndUpdate(
            id,
            {
                $push: { messages: { from: "user", senderName: req.user.name, text, at: new Date() } },
                $inc: { unreadForAgent: 1 },
                $set: { lastMessageAt: new Date() },
            },
            { new: true }
        );
        ping(req);
        res.status(200).json(publicSession(updated || session));
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// User ends their own chat.
exports.userClose = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const session = await SupportSession.findById(id);
        if (!session) return res.status(404).json({ message: "Session not found" });
        if (idStr(session.user_id) !== idStr(req.user._id)) return res.status(403).json({ message: "Not your session" });
        session.status = "closed";
        session.closedAt = new Date();
        session.messages.push({ from: "system", text: "Chat ended by the user.", at: new Date() });
        await session.save();
        ping(req);
        res.status(200).json(publicSession(session));
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ---------------- Support tickets ("Email us") ---------------- */

// Create an in-app support ticket (conversation thread). Name/email are taken
// from the account (not typed). The first message seeds the thread. The
// platform emails a notification to the support inbox from its own address, so
// nothing appears in the user's mailbox.
exports.createTicket = async (req, res) => {
    try {
        const topic = (req.body?.topic || "").trim().slice(0, 150);
        const description = (req.body?.description || "").trim().slice(0, 4000);
        if (!topic) return res.status(400).json({ message: "Please add a topic." });
        if (!description) return res.status(400).json({ message: "Please describe your issue." });

        const now = new Date();
        const ticket = await SupportTicket.create({
            user_id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            topic,
            description,
            status: "open",
            messages: [
                { from: "user", senderName: req.user.name, text: description, at: now },
                { from: "system", text: "Request received. Our support team will reply here shortly.", at: now },
            ],
            lastMessageAt: now,
            unreadForAgent: 1,
        });

        // Fire the notification email (best-effort; doesn't block the ticket).
        const sent = await sendSupportTicketEmail({
            ticketId: ticket._id.toString(),
            name: req.user.name,
            email: req.user.email,
            topic,
            description,
        });
        if (sent && !ticket.emailed) { ticket.emailed = true; await ticket.save(); }

        res.status(201).json(ticket);
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Current user's tickets (request history).
exports.myTickets = async (req, res) => {
    try {
        const items = await SupportTicket.find({ user_id: req.user._id })
            .sort({ lastMessageAt: -1, createdAt: -1 })
            .limit(50)
            .lean();
        res.status(200).json(items);
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// A single ticket owned by the current user (reading clears their unread badge).
exports.getMyTicket = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const ticket = await SupportTicket.findById(id);
        if (!ticket) return res.status(404).json({ message: "Ticket not found" });
        if (idStr(ticket.user_id) !== idStr(req.user._id)) return res.status(403).json({ message: "Not your ticket" });
        if (ticket.unreadForUser > 0) { ticket.unreadForUser = 0; await ticket.save(); }
        res.status(200).json(ticket);
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// User replies on their own ticket. Reopens a closed ticket.
exports.userTicketReply = async (req, res) => {
    try {
        const { id } = req.params;
        const text = (req.body?.text || "").trim().slice(0, 4000);
        if (!text) return res.status(400).json({ message: "Message required" });
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const ticket = await SupportTicket.findById(id);
        if (!ticket) return res.status(404).json({ message: "Ticket not found" });
        if (idStr(ticket.user_id) !== idStr(req.user._id)) return res.status(403).json({ message: "Not your ticket" });

        if (ticket.status === "closed") {
            ticket.status = "open";
            ticket.messages.push({ from: "system", text: "Reopened by the user.", at: new Date() });
        }
        ticket.messages.push({ from: "user", senderName: req.user.name, text, at: new Date() });
        ticket.lastMessageAt = new Date();
        ticket.unreadForAgent += 1;
        await ticket.save();
        ping(req);
        res.status(200).json(ticket);
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// User deletes their own ticket (removes it from their history).
exports.deleteMyTicket = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const ticket = await SupportTicket.findById(id);
        if (!ticket) return res.status(404).json({ message: "Ticket not found" });
        if (idStr(ticket.user_id) !== idStr(req.user._id)) return res.status(403).json({ message: "Not your ticket" });
        await ticket.deleteOne();
        res.status(200).json({ message: "Ticket deleted", _id: id });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// List sessions for the agent console (+ counts for the stat cards).
exports.adminList = async (req, res) => {
    try {
        const filter = {};
        if (req.query.status && req.query.status !== "All") filter.status = req.query.status;
        const [items, waiting, active, closed] = await Promise.all([
            SupportSession.find(filter).sort({ status: 1, lastMessageAt: -1 }).limit(100).lean(),
            SupportSession.countDocuments({ status: "waiting" }),
            SupportSession.countDocuments({ status: "active" }),
            SupportSession.countDocuments({ status: "closed" }),
        ]);
        res.status(200).json({ items, stats: { waiting, active, closed, total: waiting + active + closed } });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Single session (agent polls this for new messages); clears agent unread.
exports.adminGet = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const session = await SupportSession.findById(id);
        if (!session) return res.status(404).json({ message: "Session not found" });
        if (session.unreadForAgent > 0) { session.unreadForAgent = 0; await session.save(); }
        res.status(200).json(publicSession(session));
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Agent joins a waiting session.
exports.adminClaim = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const name = req.user.name || "Support";
        // Atomic claim: only the agent that flips waiting -> active wins.
        const claimed = await SupportSession.findOneAndUpdate(
            { _id: id, status: "waiting" },
            {
                $set: { status: "active", agent_id: req.user._id, agentName: name },
                $push: { messages: { from: "system", text: `${name} has joined the chat.`, at: new Date() } },
                $inc: { unreadForUser: 1 },
                $currentDate: { lastMessageAt: true },
            },
            { new: true }
        );
        if (!claimed) {
            const existing = await SupportSession.findById(id);
            if (!existing) return res.status(404).json({ message: "Session not found" });
            if (existing.status === "closed") return res.status(400).json({ message: "Session is closed" });
            // Already claimed by another agent — return current state, no dup join.
            return res.status(200).json(publicSession(existing));
        }
        await writeAudit(req, "support.claim", { targetType: "support", target_id: claimed._id });
        ping(req, idStr(claimed.user_id));
        res.status(200).json(publicSession(claimed));
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Agent sends a message (canned or manual).
exports.adminMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const text = (req.body?.text || "").trim().slice(0, 2000);
        if (!text) return res.status(400).json({ message: "Message required" });
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const session = await SupportSession.findById(id);
        if (!session) return res.status(404).json({ message: "Session not found" });
        if (session.status === "closed") return res.status(400).json({ message: "This chat has been closed" });
        // Auto-claim if an agent replies to a still-waiting session.
        if (session.status === "waiting") {
            session.status = "active";
            session.agent_id = req.user._id;
            session.agentName = req.user.name || "Support";
            session.messages.push({ from: "system", text: `${session.agentName} has joined the chat.`, at: new Date() });
        }
        session.messages.push({ from: "agent", senderName: req.user.name || "Support", text, at: new Date() });
        session.lastMessageAt = new Date();
        session.unreadForUser += 1;
        await session.save();
        ping(req, idStr(session.user_id));
        res.status(200).json(publicSession(session));
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Agent closes the session.
exports.adminClose = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const session = await SupportSession.findById(id);
        if (!session) return res.status(404).json({ message: "Session not found" });
        session.status = "closed";
        session.closedAt = new Date();
        session.messages.push({ from: "system", text: "Chat closed by support.", at: new Date() });
        session.unreadForUser += 1;
        await session.save();
        await writeAudit(req, "support.close", { targetType: "support", target_id: session._id });
        ping(req, idStr(session.user_id));
        res.status(200).json(publicSession(session));
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

/* ---------------- Admin ticket endpoints ---------------- */

// List support tickets for the admin console (+ status counts).
exports.adminTicketList = async (req, res) => {
    try {
        const filter = {};
        if (req.query.status && req.query.status !== "All") filter.status = req.query.status;
        const [items, open, inProgress, closed] = await Promise.all([
            SupportTicket.find(filter).sort({ lastMessageAt: -1, createdAt: -1 }).limit(100).lean(),
            SupportTicket.countDocuments({ status: "open" }),
            SupportTicket.countDocuments({ status: "in_progress" }),
            SupportTicket.countDocuments({ status: "closed" }),
        ]);
        res.status(200).json({ items, stats: { open, inProgress, closed, total: open + inProgress + closed } });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Single ticket for the agent (reading clears the agent unread badge).
exports.adminTicketGet = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const ticket = await SupportTicket.findById(id);
        if (!ticket) return res.status(404).json({ message: "Ticket not found" });
        if (ticket.unreadForAgent > 0) { ticket.unreadForAgent = 0; await ticket.save(); }
        res.status(200).json(ticket);
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Agent replies to a ticket. The first agent to reply is recorded as the
// handler ("X joined the conversation") and the ticket moves to in_progress.
// The user is notified in real time + by email.
exports.adminTicketReply = async (req, res) => {
    try {
        const { id } = req.params;
        const text = (req.body?.text || "").trim().slice(0, 4000);
        if (!text) return res.status(400).json({ message: "Message required" });
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const ticket = await SupportTicket.findById(id);
        if (!ticket) return res.status(404).json({ message: "Ticket not found" });

        const agentName = req.user.name || "Support";
        if (!ticket.agent_id) {
            ticket.agent_id = req.user._id;
            ticket.agentName = agentName;
            ticket.messages.push({ from: "system", text: `${agentName} from Support joined the conversation.`, at: new Date() });
        }
        if (ticket.status !== "closed") ticket.status = "in_progress";
        ticket.messages.push({ from: "agent", senderName: agentName, text, at: new Date() });
        ticket.lastMessageAt = new Date();
        ticket.unreadForUser += 1;
        await ticket.save();
        await writeAudit(req, "support.ticket.reply", { targetType: "support_ticket", target_id: ticket._id });

        // Real-time bell notification to the user (no email — they reply in-app).
        try {
            await createNotification({
                io: req.app.get("io"),
                users: req.app.get("users"),
                userId: idStr(ticket.user_id),
                type: "system",
                title: "Support replied",
                message: `${agentName} replied to your request "${ticket.topic}".`,
                link: { tab: "support" },
            });
        } catch { /* ignore */ }
        ping(req, idStr(ticket.user_id));

        res.status(200).json(ticket);
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Update a ticket's status / admin notes. Status changes are recorded as a
// system message and the user is notified.
exports.adminTicketUpdate = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const ticket = await SupportTicket.findById(id);
        if (!ticket) return res.status(404).json({ message: "Ticket not found" });

        const nextStatus = req.body?.status;
        if (nextStatus && ["open", "in_progress", "closed"].includes(nextStatus) && nextStatus !== ticket.status) {
            ticket.status = nextStatus;
            const label = { open: "reopened", in_progress: "marked in progress", closed: "closed" }[nextStatus];
            ticket.messages.push({ from: "system", text: `Ticket ${label} by support.`, at: new Date() });
            ticket.lastMessageAt = new Date();
            ticket.unreadForUser += 1;
            try {
                await createNotification({
                    io: req.app.get("io"),
                    users: req.app.get("users"),
                    userId: idStr(ticket.user_id),
                    type: "system",
                    title: "Support update",
                    message: `Your request "${ticket.topic}" was ${label}.`,
                    link: { tab: "support" },
                });
            } catch { /* ignore */ }
            ping(req, idStr(ticket.user_id));
        }
        if (typeof req.body?.adminNotes === "string") ticket.adminNotes = req.body.adminNotes.slice(0, 2000);
        await ticket.save();
        await writeAudit(req, "support.ticket.update", { targetType: "support_ticket", target_id: ticket._id });
        res.status(200).json(ticket);
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Clear a ticket's conversation (keeps the ticket, empties the messages).
exports.adminTicketClear = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const ticket = await SupportTicket.findById(id);
        if (!ticket) return res.status(404).json({ message: "Ticket not found" });
        ticket.messages = [{ from: "system", text: "Conversation cleared by support.", at: new Date() }];
        ticket.lastMessageAt = new Date();
        await ticket.save();
        await writeAudit(req, "support.ticket.clear", { targetType: "support_ticket", target_id: ticket._id });
        res.status(200).json(ticket);
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};

// Delete a ticket entirely.
exports.adminTicketDelete = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const ticket = await SupportTicket.findByIdAndDelete(id);
        if (!ticket) return res.status(404).json({ message: "Ticket not found" });
        await writeAudit(req, "support.ticket.delete", { targetType: "support_ticket", target_id: id });
        res.status(200).json({ message: "Ticket deleted", _id: id });
    } catch (e) {
        res.status(500).json({ message: "Server error", error: e.message });
    }
};
