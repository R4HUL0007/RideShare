const nodemailer = require("nodemailer");
require("dotenv").config();

// Create transporter
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Send OTP email
const sendOTPEmail = async (email, otp, purpose = "verification") => {
    try {
        const subject = purpose === "verification" 
            ? "Verify Your Email - RidexShare" 
            : "Reset Your Password - RidexShare";
        
        const htmlContent = purpose === "verification"
            ? `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Email Verification</h2>
                    <p>Thank you for registering with RidexShare!</p>
                    <p>Your verification code is:</p>
                    <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
                        <h1 style="color: #007bff; font-size: 32px; margin: 0;">${otp}</h1>
                    </div>
                    <p>This code will expire in 10 minutes.</p>
                    <p>If you didn't request this, please ignore this email.</p>
                </div>
            `
            : `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Password Reset</h2>
                    <p>You requested to reset your password for RidexShare.</p>
                    <p>Your verification code is:</p>
                    <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
                        <h1 style="color: #007bff; font-size: 32px; margin: 0;">${otp}</h1>
                    </div>
                    <p>This code will expire in 10 minutes.</p>
                    <p>If you didn't request this, please ignore this email.</p>
                </div>
            `;

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: subject,
            html: htmlContent,
        };

        await transporter.sendMail(mailOptions);
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
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
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
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
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
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
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

module.exports = { sendOTPEmail, sendSupportTicketEmail, sendTicketReplyEmail, sendSosEmail };

