// Small input-sanitization helpers shared across controllers.

// Only allow plain http(s) URLs. Blocks javascript:, data:, vbscript: and other
// schemes that become stored XSS when a stored URL is later reflected into an
// href (e.g. evidence links / document URLs rendered in the admin panel).
function isSafeHttpUrl(value) {
    if (typeof value !== "string" || !value.trim()) return false;
    try {
        const u = new URL(value.trim());
        return u.protocol === "http:" || u.protocol === "https:";
    } catch {
        return false;
    }
}

// Return the trimmed URL if it's a safe http(s) URL, otherwise "".
const safeUrl = (value) => (isSafeHttpUrl(value) ? String(value).trim() : "");

module.exports = { isSafeHttpUrl, safeUrl };
