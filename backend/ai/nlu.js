// =======================================================
// RidexShare AI — NLU (entity extraction)
// -------------------------------------------------------
// Pure, dependency-free heuristics that pull ride parameters out of natural
// language (origin, destination, date, time, seats, vehicle). Mirrors the
// frontend extractor so behavior is consistent, and provides the deterministic
// "understanding" layer used when no LLM is configured.
// =======================================================

function extractSeats(text) {
    const m = text.match(/\b(\d+)\s*(?:seats?|people|persons?|pax|passengers?)\b/i)
        || text.match(/\bfor\s+(\d+)\b/i)
        || text.match(/\bwith\s+(\d+)\s*(?:seats?)?\b/i);
    if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 4) return n;
    }
    return null;
}

function extractDate(text) {
    const t = text.toLowerCase();
    const today = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);

    if (/\btoday\b/.test(t)) return { label: "Today", iso: fmt(today) };
    if (/\btomorrow\b|\btmrw\b/.test(t)) {
        const d = new Date(today); d.setDate(d.getDate() + 1);
        return { label: "Tomorrow", iso: fmt(d) };
    }
    if (/\bday after tomorrow\b/.test(t)) {
        const d = new Date(today); d.setDate(d.getDate() + 2);
        return { label: "Day after tomorrow", iso: fmt(d) };
    }
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    for (let i = 0; i < days.length; i++) {
        if (new RegExp(`\\b${days[i]}\\b`).test(t)) {
            const d = new Date(today);
            const delta = (i - d.getDay() + 7) % 7 || 7;
            d.setDate(d.getDate() + delta);
            return { label: days[i][0].toUpperCase() + days[i].slice(1), iso: fmt(d) };
        }
    }
    const m = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
    if (m) {
        const day = +m[1], mon = +m[2] - 1;
        let yr = m[3] ? +m[3] : today.getFullYear();
        if (yr < 100) yr += 2000;
        const d = new Date(yr, mon, day);
        if (!isNaN(d)) return { label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }), iso: fmt(d) };
    }
    return null;
}

function extractTime(text) {
    const t = text.toLowerCase();
    let m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
    if (m) {
        let h = +m[1] % 12;
        if (m[3] === "pm") h += 12;
        const min = m[2] ? +m[2] : 0;
        return { label: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`, hour: h, minute: min, after: /\bafter\b/.test(t) };
    }
    m = t.match(/\b(\d{1,2}):(\d{2})\b/);
    if (m) {
        const h = +m[1], min = +m[2];
        if (h <= 23 && min <= 59) return { label: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`, hour: h, minute: min, after: /\bafter\b/.test(t) };
    }
    if (/\bmorning\b/.test(t)) return { label: "Morning (08:00)", hour: 8, minute: 0 };
    if (/\bafternoon\b/.test(t)) return { label: "Afternoon (14:00)", hour: 14, minute: 0 };
    if (/\bevening\b/.test(t)) return { label: "Evening (18:00)", hour: 18, minute: 0 };
    if (/\bnight\b/.test(t)) return { label: "Night (20:00)", hour: 20, minute: 0 };
    return null;
}

function extractRoute(text) {
    const cleaned = text.replace(/\s+/g, " ").trim();
    let origin = null, destination = null;

    let m = cleaned.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?:\s+(?:tomorrow|today|on|at|with|for|by|day|morning|evening|afternoon|night|using|\d)|[.,!?]|$)/i);
    if (m) { origin = m[1]; destination = m[2]; }

    if (!destination) {
        m = cleaned.match(/\b([A-Za-z][\w .'-]+?)\s+to\s+(.+?)(?:\s+(?:tomorrow|today|on|at|with|for|by|day|morning|evening|afternoon|night|using|\d)|[.,!?]|$)/i);
        if (m) { origin = m[1]; destination = m[2]; }
    }
    if (!destination) {
        m = cleaned.match(/\bto\s+(.+?)(?:\s+(?:tomorrow|today|on|at|with|for|by|day|morning|evening|afternoon|night|using|after|\d)|[.,!?]|$)/i);
        if (m) destination = m[1];
    }

    const tidy = (s) => {
        if (!s) return null;
        const v = s
            .replace(/\b(create|offer|post|publish|host|find|search|book|need|want|looking|please|a|an|the|ride|rides|trip|travel|go(?:ing)?|me|my|for)\b/gi, "")
            .replace(/\s+/g, " ")
            .trim();
        return v.length >= 2 ? v.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
    };
    return { origin: tidy(origin), destination: tidy(destination) };
}

// "using my Honda City", "in my Swift", "with the Activa"
function extractVehicle(text) {
    const m = text.match(/\b(?:using|in|with)\s+(?:my|the)\s+([A-Za-z][\w\s-]{1,30}?)(?:\s+(?:car|bike|scooter)|[.,!?]|$)/i);
    if (m) {
        const v = m[1].trim();
        if (v && !/^\d+$/.test(v) && v.length >= 2) return v.replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return null;
}

function extractEntities(text) {
    const route = extractRoute(text || "");
    return {
        origin: route.origin,
        destination: route.destination,
        date: extractDate(text || ""),
        time: extractTime(text || ""),
        seats: extractSeats(text || ""),
        vehicle: extractVehicle(text || ""),
    };
}

module.exports = { extractEntities };
