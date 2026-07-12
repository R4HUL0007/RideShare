const { sendFeedbackEmail } = require("../utils/emailService");

// POST /api/feedback  (public — no auth required)
// Accepts a suggestion/feedback message and emails it to the platform inbox.
// The destination address is resolved server-side (SUPPORT_EMAIL) and is NEVER
// returned to the client, so it can't leak via the response or the console.
//
// Spam protections:
//   • Rate limiting (applied in the route).
//   • Honeypot field ("company") — bots fill it; humans never see it. If set,
//     we pretend success and drop the message.
//   • Length bounds on the message.
exports.submitFeedback = async (req, res) => {
    try {
        const body = req.body || {};

        // Honeypot: a hidden field real users never fill. If populated, silently
        // accept (return success) but do nothing — starves bots of feedback.
        if (body.company && String(body.company).trim() !== "") {
            return res.json({ message: "Thanks for your feedback!" });
        }

        const message = String(body.message == null ? "" : body.message).trim();
        const name = String(body.name == null ? "" : body.name).trim().slice(0, 80);
        const email = String(body.email == null ? "" : body.email).trim().slice(0, 120);

        if (message.length < 3) {
            return res.status(400).json({ message: "Please enter a bit more detail." });
        }
        if (message.length > 4000) {
            return res.status(400).json({ message: "That's too long — please keep it under 4000 characters." });
        }
        // Basic email shape check only when one was provided (it's optional).
        if (email && !/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ message: "Please enter a valid email, or leave it blank." });
        }

        // If a logged-in user submitted, attach their identity for context.
        let meta = "";
        if (req.user) {
            meta = `User: ${req.user.email || req.user._id}`;
        }

        await sendFeedbackEmail({
            message,
            fromName: name,
            fromEmail: email,
            meta,
        });

        return res.json({ message: "Thanks for your feedback!" });
    } catch (err) {
        // Never echo internal details (including the target address) to the client.
        console.error("Error in submitFeedback:", err.message);
        return res.status(500).json({ message: "Couldn't send your feedback right now. Please try again later." });
    }
};
