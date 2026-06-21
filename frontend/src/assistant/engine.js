// =======================================================
// RidexShare Assistant — Engine (the "brain")
// -------------------------------------------------------
// A PURE, framework-free orchestrator. Given a user message + a small context
// object ({ page, session }), it returns a structured response:
//   { reply, actions[], suggestions[], cards[], session, intent }
//
// It currently uses deterministic intent detection + slot-filling + the
// keyword knowledge base. The whole thing sits behind `processMessage`, which
// is the single seam to swap for an LLM/LangChain/RAG provider later — the
// return shape stays identical, so the UI never changes.
//
// No React, no network, no DOM here. Side effects are expressed as `actions`
// (see tools.js) that the React layer executes.
// =======================================================

import { searchKnowledge, getKnowledgeById } from "./knowledgeBase";
import { extractEntities } from "./nlu";

export const INTENTS = {
    GREETING: "greeting",
    SMALL_TALK: "small_talk",
    FAREWELL: "farewell",
    THANKS: "thanks",
    OUT_OF_SCOPE: "out_of_scope",
    CREATE_RIDE: "create_ride",
    FIND_RIDE: "find_ride",
    REQUEST_RIDE: "request_ride",
    BOOKINGS: "bookings",
    PAYMENTS: "payments",
    EARNINGS: "earnings",
    TRACKING: "tracking",
    VEHICLES: "vehicles",
    PROFILE: "profile",
    FAQ: "faq",
    NAVIGATE: "navigate",
    FALLBACK: "fallback",
};

const has = (t, ...words) => words.some((w) => t.includes(w));

// Rule-based intent detection. (A future LLM classifier can replace this.)
function detectIntent(text) {
    const t = (text || "").toLowerCase().trim();
    if (!t) return INTENTS.FALLBACK;

    // Greetings
    if (/^(hi+|hey+|hello+|yo+|hola|namaste|sup|what'?s up|howdy|good\s*(morning|evening|afternoon|night))\b/.test(t)) return INTENTS.GREETING;

    // Farewells
    if (/^(bye+|goodbye|see you|take care|good night|cya|later|peace out|ttyl)\b/.test(t)) return INTENTS.FAREWELL;
    if (/\b(bye+|goodbye|see you later|take care)\s*[.!]?$/.test(t)) return INTENTS.FAREWELL;

    // Thanks
    if (/^(thanks?|thank\s*you|thx|ty|appreciate|much appreciated)\b/.test(t)) return INTENTS.THANKS;
    if (/\b(thanks?|thank\s*you)\s*[.!]?$/.test(t)) return INTENTS.THANKS;

    // Small talk
    if (/^(how are you|how'?s it going|what'?s good|how do you do|you good|how have you been|what'?s new)\b/.test(t)) return INTENTS.SMALL_TALK;
    if (/^(who are you|what are you|what can you do|what do you do|tell me about yourself)\b/.test(t)) return INTENTS.SMALL_TALK;
    if (/^(i'?m\s*(good|fine|great|okay|ok|doing well|doing good|also good|algo good|alright))\b/.test(t)) return INTENTS.SMALL_TALK;
    if (/^(good|fine|great|okay|ok|alright|not bad|pretty good|all good|i'?m okay)\s*[.!]?\s*$/.test(t)) return INTENTS.SMALL_TALK;

    // Out-of-scope detection
    if (/\b(ipl|cricket|football|soccer|basketball|tennis|match|score|who won|world cup)\b/.test(t)) return INTENTS.OUT_OF_SCOPE;
    if (/\b(weather|temperature|forecast|rain|sunny)\b/.test(t)) return INTENTS.OUT_OF_SCOPE;
    if (/\b(joke|funny|meme|riddle|puzzle)\b/.test(t)) return INTENTS.OUT_OF_SCOPE;
    if (/\b(code|coding|programming|python|java|javascript|algorithm|leetcode|hackerrank)\b/.test(t)) return INTENTS.OUT_OF_SCOPE;
    if (/\b(movie|song|music|singer|actor|bollywood|hollywood|netflix|anime)\b/.test(t)) return INTENTS.OUT_OF_SCOPE;
    if (/\b(news|politics|election|government|modi|trump|president|minister)\b/.test(t)) return INTENTS.OUT_OF_SCOPE;
    if (/\b(recipe|cook|food|restaurant|zomato|swiggy)\b/.test(t) && !has(t, "ride")) return INTENTS.OUT_OF_SCOPE;
    if (/\b(stock|bitcoin|crypto|invest|trading|nifty|sensex)\b/.test(t)) return INTENTS.OUT_OF_SCOPE;
    if (/\b(girlfriend|boyfriend|dating|love|relationship)\b/.test(t)) return INTENTS.OUT_OF_SCOPE;
    if (/\b(exam|syllabus|assignment|homework|cgpa|grade)\b/.test(t) && !has(t, "ride", "book")) return INTENTS.OUT_OF_SCOPE;

    // RidexShare intents
    if (has(t, "create ride", "offer a ride", "offer ride", "post a ride", "publish ride", "give a ride", "i want to drive", "host a ride")) return INTENTS.CREATE_RIDE;
    // Request a Ride (broadcast) — before find, so "request a ride to X" isn't caught as find.
    if (has(t, "request a ride", "request ride", "broadcast", "ask nearby drivers", "alert nearby drivers", "no rides found", "no ride found", "can't find a ride", "cant find a ride")) return INTENTS.REQUEST_RIDE;
    if (has(t, "find ride", "find a ride", "search ride", "book a ride", "need a ride", "looking for a ride", "rides to", "ride to")) return INTENTS.FIND_RIDE;
    if (has(t, "my booking", "bookings", "upcoming ride", "my trips", "cancel my booking")) return INTENTS.BOOKINGS;
    if (has(t, "earning", "withdraw", "payout", "balance")) return INTENTS.EARNINGS;
    if (has(t, "payment", "pay ", "escrow", "refund", "receipt", "transaction", "dispute")) return INTENTS.PAYMENTS;
    if (has(t, "track", "where is my driver", "where's my driver", "live location", "eta")) return INTENTS.TRACKING;
    if (has(t, "vehicle", "my car", "add car", "add vehicle")) return INTENTS.VEHICLES;
    if (has(t, "profile", "my account", "my rating", "my reviews")) return INTENTS.PROFILE;

    // "create" / "find" verbs with a route hint.
    if (has(t, "create", "offer") && has(t, " to ", "from ")) return INTENTS.CREATE_RIDE;
    if (has(t, "find", "search", "book") && has(t, " to ")) return INTENTS.FIND_RIDE;

    return INTENTS.FAQ;
}

const niceDate = (d) => (d ? d.label : null);
const niceTime = (t) => (t ? t.label : null);

// Build the "what's still missing" prompt for conversational ride creation.
const REQUIRED_CREATE = ["destination", "date", "time", "seats"];
function missingCreateSlots(slots) {
    return REQUIRED_CREATE.filter((k) => slots[k] == null);
}

function summarizeRide(slots) {
    const lines = [];
    if (slots.source) lines.push(`• Pickup: ${slots.source}`);
    lines.push(`• Destination: ${slots.destination || "—"}`);
    lines.push(`• Date: ${niceDate(slots.date) || "—"}`);
    lines.push(`• Time: ${niceTime(slots.time) || "—"}`);
    lines.push(`• Seats: ${slots.seats ?? "—"}`);
    return lines.join("\n");
}

const FOLLOWUP = {
    destination: "Where are you heading? (destination)",
    date: "What date would you like to travel?",
    time: "What time should the ride depart?",
    seats: "How many seats are you offering? (1–4)",
};

// Merge freshly-extracted entities into a slot object.
function mergeSlots(slots, ents) {
    const next = { ...slots };
    if (ents.origin && !next.source) next.source = ents.origin;
    if (ents.destination) next.destination = ents.destination;
    if (ents.date) next.date = ents.date;
    if (ents.time) next.time = ents.time;
    if (ents.seats != null) next.seats = ents.seats;
    return next;
}

// ---- Varied response pools for natural conversation ----
const GREETINGS = [
    "Hi there! 👋 Hope you're doing well. How can I help you with RidexShare today?",
    "Hello! Welcome to RidexShare Assistant. What would you like to do today?",
    "Hey! 👋 Good to see you. I can help with rides, bookings, payments, tracking, and more. What's on your mind?",
    "Hi! 😊 I'm your RidexShare assistant. Need to create a ride, find one, or something else?",
    "Hello there! Ready to help you get moving. What can I do for you?",
    "Hey hey! 👋 I'm here to help with anything RidexShare. What do you need?",
];

const MORNING_GREETINGS = [
    "Good morning! ☀️ Hope you have a great day ahead. How can I help you with RidexShare?",
    "Good morning! Ready to start the day with a ride? What can I do for you?",
];

const EVENING_GREETINGS = [
    "Good evening! 🌆 How can I help you with RidexShare tonight?",
    "Good evening! Looking for a ride or need help with something? I'm here.",
];

const AFTERNOON_GREETINGS = [
    "Good afternoon! ☀️ How can I help you today?",
    "Good afternoon! What can I do for you on RidexShare?",
];

const FAREWELL_RESPONSES = [
    "Goodbye! Have a safe journey. See you again soon! 🚗",
    "Bye! Take care and ride safe. I'm always here when you need me. 👋",
    "See you later! Have a great day ahead. 🙌",
    "Take care! Happy travels. Come back anytime you need help.",
    "Bye bye! 👋 Wishing you safe rides. See you next time!",
];

const THANKS_RESPONSES = [
    "You're welcome! 😊 Happy to help. Let me know if you need anything else.",
    "Glad I could help! Feel free to ask anytime. 🙌",
    "Anytime! That's what I'm here for. Need anything else?",
    "You're welcome! Have a great experience on RidexShare. Let me know if anything comes up.",
    "No problem at all! I'm always here if you need me.",
];

const SMALL_TALK_RESPONSES = {
    how_are_you: [
        "I'm doing great, thanks for asking! 😊 How can I help you with RidexShare today?",
        "I'm good! Always ready to help. What can I do for you on RidexShare?",
        "Doing well, thanks! Hope you're having a good day too. Need help with a ride or anything else?",
    ],
    who_are_you: [
        "I'm your RidexShare assistant! 🚗 I can help you create rides, find rides, manage bookings, track your ride, handle payments, and more. What would you like to do?",
        "I'm the RidexShare AI assistant — here to help you with rides, bookings, payments, tracking, vehicles, and support. Ask me anything related to RidexShare!",
    ],
    im_good: [
        "That's great to hear! 😊 Let me know if you need help with anything on RidexShare.",
        "Glad you're doing well! Is there anything I can help you with today?",
    ],
};

const OUT_OF_SCOPE_RESPONSES = [
    "I appreciate the curiosity! 😊 But I'm designed specifically to help with RidexShare — rides, bookings, payments, tracking, vehicles, and support. Is there anything I can help you with on the platform?",
    "That's an interesting question, but it's outside my area! I'm your RidexShare assistant and can help with creating rides, finding rides, payments, escrow, tracking, and more. What can I do for you?",
    "I'd love to help, but that's not something I'm able to assist with. I'm focused on RidexShare features like rides, bookings, payments, and tracking. Want to try one of these?",
    "I'm built to be your RidexShare helper! I can't answer unrelated questions, but I'm great at helping with rides, bookings, payments, and everything platform-related. How can I help?",
];

const FALLBACK_RESPONSES = [
    "I'm not sure I understood that. I can help with rides, bookings, payments, tracking, vehicles, and other RidexShare features. What would you like to do?",
    "Hmm, I didn't quite catch that. Could you rephrase? I'm best at helping with ride creation, bookings, payments, escrow, tracking, and profile management.",
    "I'm not sure about that one. Here's what I can help with — rides, bookings, payments, tracking, vehicles, reviews, and more. Try asking about one of those!",
];

// Pick a random response from a pool
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Main entry point. Pure function.
 * @param {string} text       user message
 * @param {object} ctx        { page?: string, session?: object }
 * @returns {{reply, actions, suggestions, cards, session, intent}}
 */
export function processMessage(text, ctx = {}) {
    const session = ctx.session || {};
    const ents = extractEntities(text);

    // ---- Continue an in-progress flow (slot filling) ----
    if (session.flow === "create_ride") {
        const t = (text || "").toLowerCase();
        if (/\b(cancel|stop|never ?mind|forget it)\b/.test(t)) {
            return { reply: "No problem — cancelled. What else can I help with?", actions: [], suggestions: defaultSuggestions(), cards: [], session: {}, intent: INTENTS.CREATE_RIDE };
        }
        const slots = mergeSlots(session.slots || {}, ents);
        const missing = missingCreateSlots(slots);
        if (missing.length > 0) {
            return {
                reply: `${summarizeRide(slots)}\n\n${FOLLOWUP[missing[0]]}`,
                actions: [],
                suggestions: [],
                cards: [],
                session: { flow: "create_ride", slots },
                intent: INTENTS.CREATE_RIDE,
            };
        }
        // All slots present → confirm + offer the prefilled page.
        return {
            reply: `Here's your ride:\n\n${summarizeRide(slots)}\n\nReady to set it up?`,
            actions: [
                { label: "Open Create Ride (pre-filled)", tool: "prefillCreateRide", args: {
                    source: slots.source, destination: slots.destination,
                    date: slots.date?.iso, time: slots.time?.label, seats: slots.seats,
                }, primary: true },
            ],
            suggestions: ["Change the date", "Cancel"],
            cards: [],
            session: {},
            intent: INTENTS.CREATE_RIDE,
        };
    }

    const intent = detectIntent(text);

    switch (intent) {
        case INTENTS.GREETING: {
            const t = (text || "").toLowerCase();
            let reply;
            if (/good\s*morning/.test(t)) reply = pick(MORNING_GREETINGS);
            else if (/good\s*afternoon/.test(t)) reply = pick(AFTERNOON_GREETINGS);
            else if (/good\s*(evening|night)/.test(t)) reply = pick(EVENING_GREETINGS);
            else reply = pick(GREETINGS);

            return {
                reply,
                actions: [],
                suggestions: ["🚗 Create a ride", "🔍 Find a ride", "📖 My Bookings", "💳 Payments"],
                cards: [],
                session: {},
                intent,
            };
        }

        case INTENTS.FAREWELL:
            return {
                reply: pick(FAREWELL_RESPONSES),
                actions: [],
                suggestions: [],
                cards: [],
                session: {},
                intent,
            };

        case INTENTS.THANKS:
            return {
                reply: pick(THANKS_RESPONSES),
                actions: [],
                suggestions: ["🚗 Create a ride", "🔍 Find a ride", "📖 My Bookings", "📍 Track Ride"],
                cards: [],
                session: {},
                intent,
            };

        case INTENTS.SMALL_TALK: {
            const t = (text || "").toLowerCase();
            let reply;
            if (/who are you|what are you|what can you do|what do you do|tell me about yourself/.test(t)) {
                reply = pick(SMALL_TALK_RESPONSES.who_are_you);
            } else if (/i'?m\s*(good|fine|great|okay|ok|doing well|doing good|also good|algo good|alright)|^(good|fine|great|okay|ok|alright|not bad|pretty good|all good)/.test(t)) {
                reply = pick(SMALL_TALK_RESPONSES.im_good);
            } else {
                reply = pick(SMALL_TALK_RESPONSES.how_are_you);
            }
            return {
                reply,
                actions: [],
                suggestions: ["🚗 Create a ride", "🔍 Find a ride", "📖 My Bookings", "🚘 My Vehicles"],
                cards: [],
                session: {},
                intent,
            };
        }

        case INTENTS.OUT_OF_SCOPE:
            return {
                reply: pick(OUT_OF_SCOPE_RESPONSES),
                actions: [],
                suggestions: ["🚗 Create a ride", "🔍 Find a ride", "📖 My Bookings", "💳 Payments", "📍 Track Ride", "🚘 My Vehicles"],
                cards: [],
                session: {},
                intent,
            };

        case INTENTS.CREATE_RIDE: {
            const slots = mergeSlots({}, ents);
            const missing = missingCreateSlots(slots);
            if (missing.length === 0) {
                return {
                    reply: `Got it:\n\n${summarizeRide(slots)}\n\nReady to set it up?`,
                    actions: [{ label: "Open Create Ride (pre-filled)", tool: "prefillCreateRide", args: {
                        source: slots.source, destination: slots.destination,
                        date: slots.date?.iso, time: slots.time?.label, seats: slots.seats,
                    }, primary: true }],
                    suggestions: ["Cancel"],
                    cards: [],
                    session: {},
                    intent,
                };
            }
            // Begin slot filling.
            const haveAny = slots.destination || slots.source || slots.date || slots.time || slots.seats;
            const lead = haveAny
                ? `Let's set up your ride.\n\n${summarizeRide(slots)}\n\n${FOLLOWUP[missing[0]]}`
                : "I can set up a ride for you! 🚗 " + FOLLOWUP[missing[0]];
            return {
                reply: lead,
                actions: [{ label: "Open Create Ride page", tool: "navigate", args: { tab: "createRide" } }],
                suggestions: [],
                cards: [],
                session: { flow: "create_ride", slots },
                intent,
            };
        }

        case INTENTS.FIND_RIDE: {
            if (ents.destination) {
                return {
                    reply: `Searching rides to ${ents.destination}${ents.date ? " for " + ents.date.label : ""}… 🔍`,
                    actions: [{ label: "Search", tool: "searchRides", args: { destination: ents.destination, date: ents.date?.iso }, primary: true, auto: true }],
                    suggestions: [],
                    cards: [],
                    session: {},
                    intent,
                };
            }
            return {
                reply: "I can find rides for you! 🔍 Where do you want to go? Try something like: \"Find a ride to Ahmedabad tomorrow morning.\"",
                actions: [{ label: "Open Find Rides", tool: "navigate", args: { tab: "findRides" } }],
                suggestions: ["Find a ride to Ahmedabad", "Find a ride to Vadodara"],
                cards: [],
                session: {},
                intent,
            };
        }

        case INTENTS.REQUEST_RIDE: {
            const dest = ents.destination;
            return {
                reply: dest
                    ? `No luck finding a ride to ${dest}? I'll open Request a Ride — we alert online verified drivers nearby and create your ride automatically at our fair price the moment a driver accepts. 🚗`
                    : "I can broadcast a ride request to nearby drivers. On the Request a Ride page, set your pickup and drop and pick a vehicle — we'll alert online verified drivers and create your ride automatically at our fair price when one accepts. 🚗",
                actions: [
                    { label: dest ? `Request a ride to ${dest}` : "Open Request a Ride", tool: "navigate", args: { tab: "requestRide" }, primary: true },
                    { label: "Search rides instead", tool: "navigate", args: { tab: "findRides" } },
                ],
                suggestions: [],
                cards: [],
                session: {},
                intent,
            };
        }

        case INTENTS.BOOKINGS:
            return kbReply("kb_bookings", "Here's how bookings work — let me open My Bookings for you. 📖", [{ label: "Open My Bookings", tool: "navigate", args: { tab: "myBookings" }, primary: true }], intent);

        case INTENTS.PAYMENTS: {
            const docs = searchKnowledge(text, { limit: 1 });
            const doc = docs[0];
            return {
                reply: doc ? doc.content : "Payments are charged securely via Razorpay and held in escrow until the ride completes. 💳",
                actions: [{ label: "Open Payments", tool: "navigate", args: { tab: "payments" }, primary: true }],
                suggestions: ["How does escrow work?", "How do withdrawals work?"],
                cards: [],
                session: {},
                intent,
            };
        }

        case INTENTS.EARNINGS:
            return kbReply("kb_earnings", null, [{ label: "Open Earnings", tool: "navigate", args: { tab: "earnings" }, primary: true }], intent);

        case INTENTS.TRACKING:
            return {
                reply: "I can open live tracking for your active ride. 📍 You can also start tracking from a confirmed booking in My Bookings.",
                actions: [
                    { label: "Track current ride", tool: "openTracking", args: {}, primary: true },
                    { label: "Open My Bookings", tool: "navigate", args: { tab: "myBookings" } },
                ],
                suggestions: [],
                cards: [],
                session: {},
                intent,
            };

        case INTENTS.VEHICLES:
            return kbReply("kb_vehicles", null, [{ label: "Open My Vehicle", tool: "navigate", args: { tab: "myVehicle" }, primary: true }], intent);

        case INTENTS.PROFILE:
            return kbReply("kb_ratings", "Opening your profile — you'll find your ratings and reviews there. ⭐", [{ label: "Open Profile", tool: "navigate", args: { tab: "profile" }, primary: true }], intent);

        case INTENTS.FAQ:
        default: {
            const docs = searchKnowledge(text, { limit: 2 });
            if (docs.length > 0) {
                const top = docs[0];
                const actions = (top.actions || []).map((a) => ({ label: a.label, tool: a.tool, args: a.args, primary: true }));
                return {
                    reply: top.content,
                    actions,
                    suggestions: docs.slice(1).map((d) => d.title),
                    cards: [],
                    session: {},
                    intent: INTENTS.FAQ,
                };
            }
            return {
                reply: pick(FALLBACK_RESPONSES),
                actions: [],
                suggestions: defaultSuggestions(),
                cards: [],
                session: {},
                intent: INTENTS.FALLBACK,
            };
        }
    }
}

function kbReply(id, overrideReply, actions, intent) {
    const doc = getKnowledgeById(id);
    const content = overrideReply || (doc ? doc.content : "Here you go.");
    return { reply: content, actions: actions || [], suggestions: [], cards: [], session: {}, intent };
}

export function defaultSuggestions() {
    return ["🚗 Create a ride", "🔍 Find a ride", "📖 My Bookings", "💳 Payments"];
}
