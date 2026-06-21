// =======================================================
// RidexShare AI — Intent detection
// -------------------------------------------------------
// Deterministic, rule-based intent classifier. Used directly when no LLM is
// configured, and as a fast pre-router / safety net even when one is. Returns
// a stable intent string consumed by the agent.
// =======================================================

const INTENTS = {
    GREETING: "greeting",
    SMALL_TALK: "small_talk",
    FAREWELL: "farewell",
    THANKS: "thanks",
    OUT_OF_SCOPE: "out_of_scope",
    CREATE_RIDE: "create_ride",
    FIND_RIDE: "find_ride",
    REQUEST_RIDE: "request_ride",
    BOOK_RIDE: "book_ride",
    BOOKINGS: "bookings",
    MY_RIDES: "my_rides",
    PAYMENTS: "payments",
    EARNINGS: "earnings",
    ESCROW: "escrow",
    TRACKING: "tracking",
    VEHICLES: "vehicles",
    PROFILE: "profile",
    NOTIFICATIONS: "notifications",
    CHAT: "chat",
    RECOMMEND: "recommend",
    CARBON: "carbon",
    KNOWLEDGE: "knowledge",
    FALLBACK: "fallback",
};

const has = (t, ...words) => words.some((w) => t.includes(w));

function detectIntent(text) {
    const t = (text || "").toLowerCase().trim();
    if (!t) return INTENTS.FALLBACK;

    if (/^(hi+|hey+|hello+|yo+|hola|namaste|sup|what'?s up|howdy|good\s*(morning|evening|afternoon|night))\b/.test(t)) return INTENTS.GREETING;
    if (/^(bye+|goodbye|see you|take care|good night|cya|later|ttyl)\b/.test(t)) return INTENTS.FAREWELL;
    if (/^(thanks?|thank\s*you|thx|ty|appreciate)\b/.test(t) || /\b(thanks?|thank\s*you)\s*[.!]?$/.test(t)) return INTENTS.THANKS;
    if (/^(how are you|how'?s it going|who are you|what are you|what can you do|what do you do)\b/.test(t)) return INTENTS.SMALL_TALK;
    if (/^(i'?m\s*(good|fine|great|okay|ok|doing well|also good|algo good|alright))\b/.test(t)) return INTENTS.SMALL_TALK;

    // Out-of-scope
    if (/\b(ipl|cricket|football|soccer|match|score|who won|world cup)\b/.test(t)) return INTENTS.OUT_OF_SCOPE;
    if (/\b(weather|temperature|forecast)\b/.test(t)) return INTENTS.OUT_OF_SCOPE;
    if (/\b(joke|funny|meme|riddle)\b/.test(t)) return INTENTS.OUT_OF_SCOPE;
    if (/\b(leetcode|hackerrank|algorithm)\b/.test(t)) return INTENTS.OUT_OF_SCOPE;
    if (/\b(movie|song|singer|actor|bollywood|netflix|anime)\b/.test(t)) return INTENTS.OUT_OF_SCOPE;
    if (/\b(politics|election|president|minister|stock|bitcoin|crypto)\b/.test(t)) return INTENTS.OUT_OF_SCOPE;

    // Action / data intents
    if (has(t, "book the", "book first", "book this", "book that", "book ride", "book it")) return INTENTS.BOOK_RIDE;

    // Request a Ride (broadcast to nearby drivers) — check before create/find so
    // "request a ride to X" isn't swallowed by the "ride to" find pattern.
    if (has(t, "request a ride", "request ride", "broadcast", "ask nearby drivers", "alert nearby drivers", "no rides found", "no ride found", "can't find a ride", "cant find a ride", "nobody is going")) return INTENTS.REQUEST_RIDE;

    // Recommendations ("recommend rides for me", "suggest a ride", "what should I book").
    if (has(t, "recommend", "suggest", "recommendation", "rides for me", "what should i book")) return INTENTS.RECOMMEND;

    // Sustainability / carbon ("how much carbon have I saved", "my environmental impact").
    if (has(t, "carbon", "co2", "emission", "environmental impact", "sustainability", "fuel saved", "trees", "eco")) return INTENTS.CARBON;

    // Create vs Find — check CREATE first so "create a ride to X" isn't caught
    // by the "ride to" find pattern.
    const wantsCreate =
        has(t, "create ride", "create a ride", "offer a ride", "offer ride", "post a ride", "publish ride", "i want to drive", "host a ride")
        || (has(t, "create", "offer", "post", "publish", "host") && has(t, " to ", "from "));
    if (wantsCreate) return INTENTS.CREATE_RIDE;

    const wantsFind =
        has(t, "find ride", "find a ride", "find me a ride", "search ride", "need a ride", "looking for a ride", "rides to", "ride to")
        || (has(t, "find", "search") && has(t, " to "));
    if (wantsFind) return INTENTS.FIND_RIDE;

    // "How does X work / how are X handled / explain X" → KNOWLEDGE, even when X
    // is a concept that also has a data intent (withdrawals, payments, escrow).
    // Personal phrasing ("my balance", "did I earn") keeps the data intent.
    const isHowItWorks = /\b(how\s+(do|does|are|can|is)|what\s+(is|are)|why|explain|tell me about)\b/.test(t);
    const isPersonal = /\b(my|mine|did i|do i have|i have|i'?ve|i earned)\b/.test(t);
    if (isHowItWorks && !isPersonal &&
        has(t, "escrow", "withdraw", "payment", "pay", "dispute", "rating", "review", "track", "cancel", "refund", "commission", "safety", "verify", "otp", "book", "vehicle", "work")) {
        return INTENTS.KNOWLEDGE;
    }

    if (has(t, "my booking", "bookings", "my trips", "upcoming ride")) return INTENTS.BOOKINGS;
    if (has(t, "my rides", "rides i created", "rides i offered")) return INTENTS.MY_RIDES;
    if (has(t, "escrow")) return INTENTS.ESCROW;
    if (has(t, "earning", "withdraw", "payout", "how much did i earn", "my balance")) return INTENTS.EARNINGS;
    if (has(t, "payment", "transaction", "receipt", "how much did i pay", "payment history")) return INTENTS.PAYMENTS;
    if (has(t, "track", "where is my driver", "where's my driver", "live location", "eta")) return INTENTS.TRACKING;
    if (has(t, "vehicle", "my car", "add car", "add vehicle")) return INTENTS.VEHICLES;
    if (has(t, "notification", "alerts")) return INTENTS.NOTIFICATIONS;
    if (has(t, "chat", "message")) return INTENTS.CHAT;
    if (has(t, "profile", "my account", "my rating", "my reviews")) return INTENTS.PROFILE;

    // Knowledge questions ("how does X work", "what is", "how do I")
    if (/\b(how|what|why|when|explain|tell me about|does|do i|can i)\b/.test(t)) return INTENTS.KNOWLEDGE;

    return INTENTS.KNOWLEDGE;
}

module.exports = { INTENTS, detectIntent };
