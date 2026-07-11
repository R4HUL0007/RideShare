// Message moderation for chat + AI assistant.
//
// Combines two guards:
//   1. Phone-number redaction (anti-circumvention of contact masking).
//   2. Profanity / abuse / violence masking — a pragmatic word-boundary filter
//      (English + a few common Hindi terms). Not exhaustive; extendable.
//
// Matched abuse is masked (first letter kept, rest asterisked) rather than
// rejected, so the message still sends but the offensive content is neutralised,
// and callers get a `profane` flag to warn/flag the sender.

const { redactPhoneNumbers } = require("./redactContact");

// Compact abuse/violence list. Kept intentionally moderate to limit false
// positives; add terms as needed. Matched case-insensitively on word boundaries.
const BAD_WORDS = [
    // English profanity
    "fuck", "fucker", "fucking", "shit", "bitch", "bastard", "asshole", "dick",
    "cunt", "slut", "whore", "motherfucker", "bullshit", "prick", "wanker",
    // Hindi / Hinglish abuse (romanised)
    "chutiya", "chutiyaa", "bhosdike", "bhosdi", "madarchod", "madarchode",
    "behenchod", "bhenchod", "gaandu", "gandu", "randi", "harami", "kutta",
    "kamina", "kamine", "lund", "loda", "lauda",
    // Violence / threats
    "kill you", "kill u", "murder you", "rape", "stab", "shoot you", "beat you up",
];

// Escape regex-special chars, then join. Multi-word phrases keep their spaces.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BAD_RE = new RegExp(`\\b(${BAD_WORDS.map(escapeRe).join("|")})\\b`, "gi");

function maskProfanity(input) {
    if (!input || typeof input !== "string") return { text: input, profane: false };
    let profane = false;
    const text = input.replace(BAD_RE, (m) => {
        profane = true;
        // Preserve word length feel: keep first char, asterisk the rest (per token).
        return m.replace(/\S/g, (c, i) => (i === 0 ? c : "*"));
    });
    return { text, profane };
}

// Full moderation pass: redact phone numbers, then mask abuse.
function moderateMessage(input) {
    const phone = redactPhoneNumbers(input);
    const prof = maskProfanity(phone.text);
    return {
        text: prof.text,
        redactedPhone: phone.redacted,
        profane: prof.profane,
        changed: phone.redacted || prof.profane,
    };
}

// Lightweight check (no mutation) — used to gate AI input.
// (BAD_RE is global, so reset lastIndex to avoid stateful test() results.)
function containsAbuse(input) {
    if (!input || typeof input !== "string") return false;
    BAD_RE.lastIndex = 0;
    return BAD_RE.test(input);
}

module.exports = { moderateMessage, maskProfanity, containsAbuse };
