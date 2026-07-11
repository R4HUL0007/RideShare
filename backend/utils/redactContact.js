// Anti-circumvention: strip phone-number-like sequences from chat text so users
// can't bypass contact masking by simply typing their number to each other.
//
// Matches loose runs of digits (optionally with +, spaces, dashes, parens, dots)
// that contain 8–15 digits total — covering "9876543210", "+91 98765-43210",
// "98765 43210" — while leaving short numbers (prices, seats, times, 4–6 digit
// codes) untouched. Replaces each match with "[number hidden]".

const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;

function redactPhoneNumbers(input) {
    if (!input || typeof input !== "string") return { text: input, redacted: false };
    let redacted = false;
    const text = input.replace(PHONE_RE, (m) => {
        const digitCount = (m.match(/\d/g) || []).length;
        if (digitCount >= 8 && digitCount <= 15) {
            redacted = true;
            return "[number hidden]";
        }
        return m;
    });
    return { text, redacted };
}

module.exports = { redactPhoneNumbers };
