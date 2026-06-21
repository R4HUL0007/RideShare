// =======================================================
// RidexShare Assistant — NLU (entity extraction)
// -------------------------------------------------------
// Pure, dependency-free heuristics that pull ride parameters out of natural
// language (origin, destination, date, time, seats). This is the deterministic
// fallback "understanding" layer; a future LLM provider can replace/augment it
// while keeping the SAME output shape (an `entities` object), so downstream
// slot-filling and tools don't change.
// =======================================================

// Extract seat count: "3 seats", "for 2", "2 people".
function extractSeats(text) {
    const m = text.match(/\b(\d+)\s*(?:seats?|people|persons?|pax|passengers?)\b/i)
        || text.match(/\bfor\s+(\d+)\b/i);
    if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 4) return n;
    }
    return null;
}

// Extract a coarse date. Returns { label, iso? } — iso is a yyyy-mm-dd when we
// can resolve it (today/tomorrow/weekday/explicit date), else just a label.
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
    // Weekday name → next occurrence.
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    for (let i = 0; i < days.length; i++) {
        if (new RegExp(`\\b${days[i]}\\b`).test(t)) {
            const d = new Date(today);
            const delta = (i - d.getDay() + 7) % 7 || 7;
            d.setDate(d.getDate() + delta);
            return { label: days[i][0].toUpperCase() + days[i].slice(1), iso: fmt(d) };
        }
    }
    // Explicit dd/mm or dd-mm[-yyyy].
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

// Extract a time: "8 am", "8:30 pm", "18:00", "morning/evening".
function extractTime(text) {
    const t = text.toLowerCase();
    let m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
    if (m) {
        let h = +m[1] % 12;
        if (m[3] === "pm") h += 12;
        const min = m[2] ? +m[2] : 0;
        return { label: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`, hour: h, minute: min };
    }
    m = t.match(/\b(\d{1,2}):(\d{2})\b/);
    if (m) {
        const h = +m[1], min = +m[2];
        if (h <= 23 && min <= 59) return { label: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`, hour: h, minute: min };
    }
    if (/\bmorning\b/.test(t)) return { label: "Morning (08:00)", hour: 8, minute: 0 };
    if (/\bafternoon\b/.test(t)) return { label: "Afternoon (14:00)", hour: 14, minute: 0 };
    if (/\bevening\b/.test(t)) return { label: "Evening (18:00)", hour: 18, minute: 0 };
    if (/\bnight\b/.test(t)) return { label: "Night (20:00)", hour: 20, minute: 0 };
    return null;
}

// Extract origin/destination from "from X to Y", "X to Y", "to Y".
function extractRoute(text) {
    const cleaned = text.replace(/\s+/g, " ").trim();
    let origin = null, destination = null;

    // "from X to Y"
    let m = cleaned.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?:\s+(?:tomorrow|today|on|at|with|for|by|day|morning|evening|afternoon|night|\d)|[.,!?]|$)/i);
    if (m) { origin = m[1]; destination = m[2]; }

    if (!destination) {
        // "X to Y" (no "from")
        m = cleaned.match(/\b([A-Za-z][\w .'-]+?)\s+to\s+(.+?)(?:\s+(?:tomorrow|today|on|at|with|for|by|day|morning|evening|afternoon|night|\d)|[.,!?]|$)/i);
        if (m) { origin = m[1]; destination = m[2]; }
    }
    if (!destination) {
        // "to Y" only
        m = cleaned.match(/\bto\s+(.+?)(?:\s+(?:tomorrow|today|on|at|with|for|by|day|morning|evening|afternoon|night|\d)|[.,!?]|$)/i);
        if (m) destination = m[1];
    }

    const tidy = (s) => {
        if (!s) return null;
        const v = s.replace(/\b(a|the|ride|rides|trip|travel|go(?:ing)?)\b/gi, "").trim();
        return v.length >= 2 ? v.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
    };
    return { origin: tidy(origin), destination: tidy(destination) };
}

/**
 * Parse a free-text message into ride entities. Output shape is stable so the
 * engine/tools don't care whether it came from heuristics or an LLM.
 */
export function extractEntities(text) {
    const route = extractRoute(text || "");
    return {
        origin: route.origin,
        destination: route.destination,
        date: extractDate(text || ""),
        time: extractTime(text || ""),
        seats: extractSeats(text || ""),
    };
}
