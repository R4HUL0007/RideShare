const nodemailer = require("nodemailer");
require("dotenv").config();

// --- Gmail transporter (fallback / legacy default) -------------------------
const gmailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// --- Resend transporter (preferred, sends from the verified domain) --------
// Resend exposes a standard SMTP endpoint, so we reuse nodemailer instead of
// pulling in another dependency. Only created when RESEND_API_KEY is set, so
// the app runs unchanged in environments without it.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resendTransporter = RESEND_API_KEY
    ? nodemailer.createTransport({
          host: "smtp.resend.com",
          port: 465,
          secure: true,
          auth: { user: "resend", pass: RESEND_API_KEY },
      })
    : null;

console.log(`📧 Email provider: ${resendTransporter ? "Resend (verified domain)" : "Gmail"}`);

// Sender identity. With Resend we send from the verified domain (great inbox
// placement); otherwise we fall back to the Gmail account. A named address
// ("RidexShare <addr>") avoids a common spam-filter trigger.
const DOMAIN_FROM = process.env.EMAIL_FROM || "RidexShare <hello@ridexshare.online>";
const GMAIL_FROM = `RidexShare <${process.env.EMAIL_USER}>`;

// Single delivery helper. Tries Resend first (if configured) and transparently
// falls back to Gmail on failure, so a Resend outage never blocks OTPs/alerts.
// The caller's `from` is ignored — we always use the correct identity per path.
const deliver = async (options) => {
    if (resendTransporter) {
        try {
            await resendTransporter.sendMail({ ...options, from: DOMAIN_FROM });
            return true;
        } catch (err) {
            console.error("⚠️ Resend send failed, falling back to Gmail:", err.message);
        }
    }
    await gmailTransporter.sendMail({ ...options, from: GMAIL_FROM });
    return true;
};

const path = require("path");

// Brand logo embedded inline (CID) so it renders in every client without
// depending on an external URL. Generated from frontend/public/icons/icon.svg.
const LOGO_PATH = path.join(__dirname, "..", "assets", "logo-email.png");
const LOGO_CID = "ridexshare-logo";
const logoAttachment = {
    filename: "ridexshare.png",
    path: LOGO_PATH,
    cid: LOGO_CID,
    contentType: "image/png",
};

// Branded, email-client-safe template (table + inline styles) used for OTP
// mails. Dark header with logo, a clean code card, and a muted footer.
const otpEmailTemplate = ({ heading, intro, otp }) => `
<div style="margin:0; padding:0; background:#f2f3f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f3f5; padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
        <tr>
          <td style="background:#0a0a0b; padding:28px 32px;" align="left">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:12px;"><img src="cid:${LOGO_CID}" width="40" height="40" alt="RidexShare" style="display:block; border-radius:10px;" /></td>
              <td style="color:#ffffff; font-size:20px; font-weight:700; letter-spacing:0.2px;">RidexShare</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 8px 32px;">
            <h1 style="margin:0 0 12px 0; font-size:22px; color:#111114;">${heading}</h1>
            <p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#55565b;">${intro}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 8px 32px;" align="center">
            <div style="background:#f2f3f5; border:1px solid #e6e7ea; border-radius:12px; padding:20px; text-align:center;">
              <div style="font-size:12px; letter-spacing:1px; text-transform:uppercase; color:#8a8b90; margin-bottom:8px;">Your code</div>
              <div style="font-size:36px; font-weight:800; letter-spacing:10px; color:#0a0a0b; font-family:'Courier New',monospace;">${otp}</div>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 4px 32px;">
            <p style="margin:0 0 6px 0; font-size:13px; color:#8a8b90;">This code expires in 10 minutes.</p>
            <p style="margin:0; font-size:13px; color:#8a8b90;">If you didn't request this, you can safely ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px; border-top:1px solid #eeeef0; margin-top:16px;">
            <p style="margin:0; font-size:12px; color:#a9aab0;">© RidexShare · University ride sharing</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</div>`;

// Send OTP email
const sendOTPEmail = async (email, otp, purpose = "verification") => {
    try {
        const subject = purpose === "verification" 
            ? "Your RidexShare verification code" 
            : "Your RidexShare password reset code";

        // Plain-text alternative. HTML-only emails score much higher on spam
        // filters, so we always send a matching text/plain part alongside HTML.
        const textContent = purpose === "verification"
            ? `Your RidexShare verification code is ${otp}\n\nThis code expires in 10 minutes.\nIf you didn't request this, you can safely ignore this email.\n\n— RidexShare`
            : `Your RidexShare password reset code is ${otp}\n\nThis code expires in 10 minutes.\nIf you didn't request this, you can safely ignore this email.\n\n— RidexShare`;

        const heading = purpose === "verification" ? "Verify your email" : "Reset your password";
        const intro = purpose === "verification"
            ? "Welcome to RidexShare! Use the code below to verify your email and finish setting up your account."
            : "We received a request to reset your RidexShare password. Use the code below to continue.";
        const htmlContent = otpEmailTemplate({ heading, intro, otp });

        await deliver({
            to: email,
            replyTo: process.env.EMAIL_USER,
            subject: subject,
            text: textContent,
            html: htmlContent,
            attachments: [logoAttachment],
            headers: {
                // Signals a transactional/automated message and gives clients a
                // no-op unsubscribe target — both improve inbox placement.
                "List-Unsubscribe": `<mailto:${process.env.EMAIL_USER}?subject=unsubscribe>`,
                "X-Entity-Ref-ID": "ridexshare-otp",
            },
        });
        console.log(`✅ OTP email sent to ${email}`);
        return true;
    } catch (error) {
        console.error("❌ Error sending email:", error);
        throw new Error("Failed to send email");
    }
};

// Send a support-ticket notification to the support inbox. Sent FROM the
// platform's own email account (process.env.EMAIL_USER), so the message never
// appears in the requesting user's mailbox. The user's email is set as replyTo
// so support can respond directly. Degrades gracefully: a send failure does not
// block ticket creation (the ticket is still stored in-app).
const sendSupportTicketEmail = async ({ ticketId, name, email, topic, description }) => {
    const to = process.env.SUPPORT_EMAIL || "rmdm283@gmail.com";
    const safe = (s) => String(s || "").replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"));
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
            <h2 style="color: #111;">New Support Ticket</h2>
            <p style="color:#555;">A user submitted a support request from the app.</p>
            <table style="width:100%; border-collapse:collapse; margin:16px 0;">
                <tr><td style="padding:6px 0; color:#888; width:120px;">Ticket ID</td><td style="padding:6px 0;"><b>${safe(ticketId)}</b></td></tr>
                <tr><td style="padding:6px 0; color:#888;">From</td><td style="padding:6px 0;">${safe(name)} &lt;${safe(email)}&gt;</td></tr>
                <tr><td style="padding:6px 0; color:#888;">Topic</td><td style="padding:6px 0;"><b>${safe(topic)}</b></td></tr>
            </table>
            <div style="background:#f4f4f4; padding:16px; border-radius:8px; white-space:pre-wrap; color:#222;">${safe(description)}</div>
            <p style="color:#999; font-size:12px; margin-top:20px;">Reply to this email to respond directly to ${safe(email)}.</p>
        </div>
    `;

    try {
        await deliver({
            to,
            replyTo: email || undefined,
            subject: `[Support] ${topic || "New ticket"}`,
            html: htmlContent,
        });
        console.log(`✅ Support ticket email sent to ${to} (ticket ${ticketId})`);
        return true;
    } catch (error) {
        console.error("❌ Error sending support ticket email:", error.message);
        return false;
    }
};

// Notify a user by email that support replied to their ticket. Sent from the
// platform's account; the support inbox is set as reply-to. Users are guided
// to reply in-app from the Support section.
const sendTicketReplyEmail = async ({ to, name, topic, agentName, text }) => {
    if (!to) return false;
    const safe = (s) => String(s || "").replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"));
    const supportInbox = process.env.SUPPORT_EMAIL || "rmdm283@gmail.com";
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color:#111;">${safe(agentName || "Support")} replied to your request</h2>
            <p style="color:#555;">Hi ${safe(name || "there")}, you have a new reply on your support request${topic ? ` about "<b>${safe(topic)}</b>"` : ""}.</p>
            <div style="background:#f4f4f4; padding:16px; border-radius:8px; white-space:pre-wrap; color:#222; margin:16px 0;">${safe(text)}</div>
            <p style="color:#555;">Open the RidexShare app and go to <b>Support</b> to view the full conversation and reply.</p>
        </div>
    `;
    try {
        await deliver({
            to,
            replyTo: supportInbox,
            subject: `Re: ${topic || "Your support request"}`,
            html: htmlContent,
        });
        console.log(`✅ Support reply email sent to ${to}`);
        return true;
    } catch (error) {
        console.error("❌ Error sending support reply email:", error.message);
        return false;
    }
};

// Emergency SOS alert email. Sent to a user's emergency contacts (and the
// safety inbox) when they trigger SOS. Includes a live tracking link and a
// Google Maps location link so responders can act immediately.
const sendSosEmail = async ({ to, contactName, userName, userPhone, location, rideSnapshot, trackingLink }) => {
    if (!to) return false;
    const safe = (s) => String(s || "").replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"));
    const hasLoc = location && location.lat != null && location.lng != null;
    const mapsLink = hasLoc ? `https://www.google.com/maps?q=${location.lat},${location.lng}` : "";
    const rs = rideSnapshot || {};
    const rideBlock = (rs.driverName || rs.destination)
        ? `<table style="width:100%; border-collapse:collapse; margin:12px 0; font-size:14px;">
              ${rs.destination ? `<tr><td style="padding:4px 0; color:#888; width:130px;">Trip</td><td style="padding:4px 0;">${safe(rs.source)} &rarr; ${safe(rs.destination)}</td></tr>` : ""}
              ${rs.driverName ? `<tr><td style="padding:4px 0; color:#888;">Driver</td><td style="padding:4px 0;">${safe(rs.driverName)} ${rs.driverPhone ? `(${safe(rs.driverPhone)})` : ""}</td></tr>` : ""}
              ${rs.vehicle ? `<tr><td style="padding:4px 0; color:#888;">Vehicle</td><td style="padding:4px 0;">${safe(rs.vehicle)} ${safe(rs.licensePlate)}</td></tr>` : ""}
           </table>` : "";
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border:2px solid #dc2626; border-radius:10px; overflow:hidden;">
            <div style="background:#dc2626; color:#fff; padding:16px 20px;">
                <h2 style="margin:0; font-size:20px;">SOS Emergency Alert</h2>
            </div>
            <div style="padding:20px;">
                <p style="font-size:15px; color:#222;">Hi ${safe(contactName || "there")},</p>
                <p style="font-size:15px; color:#222;"><b>${safe(userName)}</b> has triggered an emergency SOS on RidexShare and listed you as an emergency contact. Please try to reach them immediately.</p>
                ${userPhone ? `<p style="font-size:15px;">Their phone: <b>${safe(userPhone)}</b></p>` : ""}
                ${hasLoc ? `<p style="font-size:15px;">Last known location: <a href="${mapsLink}" style="color:#2563eb;">View on Google Maps</a>${location.address ? ` (${safe(location.address)})` : ""}</p>` : ""}
                ${rideBlock}
                ${trackingLink ? `<p style="margin:16px 0;"><a href="${safe(trackingLink)}" style="background:#dc2626; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none; font-weight:bold;">Track their live location</a></p>` : ""}
                <p style="font-size:13px; color:#666; margin-top:18px;">If they're in immediate danger, call local emergency services (112 in India) right away. &mdash; RidexShare Safety</p>
            </div>
        </div>
    `;
    try {
        await deliver({
            to,
            subject: `SOS Alert: ${userName} needs help`,
            html: htmlContent,
        });
        console.log(`✅ SOS email sent to ${to}`);
        return true;
    } catch (error) {
        console.error("❌ Error sending SOS email:", error.message);
        return false;
    }
};

// Site feedback / suggestions. Delivered to the platform inbox (SUPPORT_EMAIL).
// The recipient address lives only here on the server — it is never sent to or
// exposed on the client. Degrades gracefully: a send failure is surfaced to the
// caller so it can decide how to respond (but the address is never leaked).
const sendFeedbackEmail = async ({ message, fromName, fromEmail, meta }) => {
    const to = process.env.SUPPORT_EMAIL || process.env.EMAIL_USER;
    if (!to) return false;
    const safe = (s) => String(s || "").replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"));
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
            <h2 style="color:#111;">New feedback from RidexShare</h2>
            <table style="width:100%; border-collapse:collapse; margin:12px 0; font-size:14px;">
                <tr><td style="padding:6px 0; color:#888; width:120px;">From</td><td style="padding:6px 0;">${safe(fromName) || "Anonymous"}${fromEmail ? ` &lt;${safe(fromEmail)}&gt;` : ""}</td></tr>
                ${meta ? `<tr><td style="padding:6px 0; color:#888;">Context</td><td style="padding:6px 0;">${safe(meta)}</td></tr>` : ""}
            </table>
            <div style="background:#f4f4f4; padding:16px; border-radius:8px; white-space:pre-wrap; color:#222;">${safe(message)}</div>
        </div>
    `;
    await deliver({
        to,
        replyTo: fromEmail || undefined,
        subject: "RidexShare feedback",
        text: `Feedback from ${fromName || "Anonymous"}${fromEmail ? ` <${fromEmail}>` : ""}:\n\n${message}`,
        html: htmlContent,
    });
    return true;
};

module.exports = { sendOTPEmail, sendSupportTicketEmail, sendTicketReplyEmail, sendSosEmail, sendFeedbackEmail };

