// =======================================================
// RidexShare AI — Agent (orchestrator)
// -------------------------------------------------------
// The central reasoner. For each message it:
//   1. Continues any in-progress slot-filling flow (conversational ride create).
//   2. Detects intent.
//   3. Routes to: greetings/small-talk, tool calls (data + actions), RAG
//      knowledge answers, or a safe fallback.
//   4. Stays role-aware and never fabricates data (hallucination guard).
//
// Returns a stable shape consumed by the controller/frontend:
//   { reply, actions[], cards[], suggestions[], sources[], intent,
//     usedLLM, ragGrounded, toolsUsed[] }
//
// When a real LLM is configured it is used to synthesize RAG answers; the
// deterministic path always works without it.
// =======================================================

const { INTENTS, detectIntent } = require("./intents");
const { extractEntities } = require("./nlu");
const memory = require("./memory");
const tools = require("./tools/registry");
const rag = require("./rag/retriever");
const llm = require("./providers/llm");

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const GREETINGS = [
    "Hi there! 👋 How can I help you with RidexShare today?",
    "Hello! Welcome to RidexShare. Want to create a ride, find one, or check your bookings?",
    "Hey! 👋 I can help with rides, bookings, payments, tracking and more. What do you need?",
];
const FAREWELLS = ["Goodbye! Have a safe journey. 🚗", "Bye! Ride safe and see you soon. 👋", "Take care! Happy travels."];
const THANKS = ["You're welcome! 😊 Anything else?", "Glad I could help! Let me know if you need more.", "Anytime! 🙌"];
const SMALL_TALK = [
    "I'm doing great, thanks! 😊 How can I help you with RidexShare today?",
    "I'm your RidexShare assistant — I can create rides, find rides, manage bookings, track rides, and explain payments & escrow. What would you like to do?",
];
const OUT_OF_SCOPE = [
    "I'm primarily designed to help with RidexShare features, bookings, rides, payments, tracking, and support. Is there something on the platform I can help with?",
    "That's outside what I can help with — but I'm great with rides, bookings, payments, escrow and tracking. What can I do for you?",
];

const SUGGEST_DEFAULT = ["Create a ride", "Find a ride", "My bookings", "How does escrow work?"];

// Role-aware suggestions.
function roleSuggestions(user) {
    if (user?.isAdmin) return ["Platform analytics", "Open disputes", "Find a ride", "How does escrow work?"];
    return ["Create a ride", "Find a ride", "My bookings", "My earnings"];
}

// ---- Slot filling for conversational ride creation ----
const REQUIRED_CREATE = ["destination", "date", "time", "seats"];
const FOLLOWUP = {
    destination: "Where are you heading? (destination)",
    date: "What date would you like to travel?",
    time: "What time should the ride depart?",
    seats: "How many seats are you offering? (1–4)",
};
function missingSlots(slots) { return REQUIRED_CREATE.filter((k) => slots[k] == null); }
function mergeSlots(slots, ents) {
    const n = { ...slots };
    if (ents.origin && !n.source) n.source = ents.origin;
    if (ents.destination) n.destination = ents.destination;
    if (ents.date) n.date = ents.date;
    if (ents.time) n.time = ents.time;
    if (ents.seats != null) n.seats = ents.seats;
    if (ents.vehicle) n.vehicle = ents.vehicle;
    return n;
}
function summarize(slots) {
    const lines = [];
    if (slots.source) lines.push(`• Pickup: ${slots.source}`);
    lines.push(`• Destination: ${slots.destination || "—"}`);
    lines.push(`• Date: ${slots.date?.label || "—"}`);
    lines.push(`• Time: ${slots.time?.label || "—"}`);
    lines.push(`• Seats: ${slots.seats ?? "—"}`);
    if (slots.vehicle) lines.push(`• Vehicle: ${slots.vehicle}`);
    return lines.join("\n");
}

function base(extra = {}) {
    return { reply: "", actions: [], cards: [], suggestions: [], sources: [], usedLLM: false, ragGrounded: false, toolsUsed: [], ...extra };
}

/**
 * Main entry. Pure-ish (only DB reads via tools + optional LLM).
 * @param {string} text
 * @param {object} ctx  { user, sessionId }
 */
async function run(text, ctx = {}) {
    const userId = ctx.user?._id;
    const sessionId = ctx.sessionId || "default";
    const ents = extractEntities(text);

    memory.addTurn(userId, sessionId, "user", text);

    // ---- 1) Continue in-progress ride-creation flow ----
    const flow = memory.getFlow(userId, sessionId);
    if (flow?.type === "create_ride") {
        const t = text.toLowerCase();
        if (/\b(cancel|stop|never ?mind|forget it)\b/.test(t)) {
            memory.clearFlow(userId, sessionId);
            return finalize(ctx, base({ reply: "No problem — cancelled. What else can I help with?", suggestions: roleSuggestions(ctx.user), intent: INTENTS.CREATE_RIDE }));
        }
        const slots = mergeSlots(flow.slots || {}, ents);
        const missing = missingSlots(slots);
        if (missing.length > 0) {
            memory.setFlow(userId, sessionId, { type: "create_ride", slots });
            return finalize(ctx, base({ reply: `${summarize(slots)}\n\n${FOLLOWUP[missing[0]]}`, intent: INTENTS.CREATE_RIDE }));
        }
        memory.clearFlow(userId, sessionId);
        const res = await tools.execute("createRide", {
            source: slots.source, destination: slots.destination,
            date: slots.date?.iso, time: slots.time?.label, seats: slots.seats, vehicle: slots.vehicle,
        }, ctx);
        return finalize(ctx, base({
            reply: `Here's your ride:\n\n${summarize(slots)}\n\nReady to publish? I'll open Create Ride with everything filled in.`,
            actions: res.action ? [{ ...res.action, label: "Open Create Ride (pre-filled)", primary: true }] : [],
            toolsUsed: ["createRide"], intent: INTENTS.CREATE_RIDE,
        }));
    }

    const intent = detectIntent(text);

    switch (intent) {
        case INTENTS.GREETING:
            return finalize(ctx, base({ reply: pick(GREETINGS), suggestions: roleSuggestions(ctx.user), intent }));
        case INTENTS.FAREWELL:
            return finalize(ctx, base({ reply: pick(FAREWELLS), intent }));
        case INTENTS.THANKS:
            return finalize(ctx, base({ reply: pick(THANKS), suggestions: roleSuggestions(ctx.user), intent }));
        case INTENTS.SMALL_TALK:
            return finalize(ctx, base({ reply: pick(SMALL_TALK), suggestions: roleSuggestions(ctx.user), intent }));
        case INTENTS.OUT_OF_SCOPE:
            return finalize(ctx, base({ reply: pick(OUT_OF_SCOPE), suggestions: roleSuggestions(ctx.user), intent }));

        case INTENTS.CREATE_RIDE: {
            const slots = mergeSlots({}, ents);
            const missing = missingSlots(slots);
            if (missing.length === 0) {
                const res = await tools.execute("createRide", {
                    source: slots.source, destination: slots.destination,
                    date: slots.date?.iso, time: slots.time?.label, seats: slots.seats, vehicle: slots.vehicle,
                }, ctx);
                return finalize(ctx, base({
                    reply: `Got it:\n\n${summarize(slots)}\n\nReady to publish?`,
                    actions: res.action ? [{ ...res.action, label: "Open Create Ride (pre-filled)", primary: true }] : [],
                    toolsUsed: ["createRide"], intent,
                }));
            }
            memory.setFlow(userId, sessionId, { type: "create_ride", slots });
            const haveAny = slots.destination || slots.source || slots.date || slots.time || slots.seats;
            const lead = haveAny ? `Let's set up your ride.\n\n${summarize(slots)}\n\n${FOLLOWUP[missing[0]]}` : "I can set up a ride for you! 🚗 " + FOLLOWUP[missing[0]];
            return finalize(ctx, base({ reply: lead, actions: [{ tool: "navigate", args: { tab: "createRide" }, label: "Open Create Ride" }], intent }));
        }

        case INTENTS.FIND_RIDE: {
            if (ents.destination) {
                const res = await tools.execute("searchRides", { destination: ents.destination, afterHour: ents.time?.after ? ents.time?.hour : undefined }, ctx);
                if (!res.ok || res.empty || !Array.isArray(res.items)) {
                    return finalize(ctx, base({
                        reply: `${res.message || `No available rides found to ${ents.destination} right now.`} Want me to broadcast a ride request? Nearby verified drivers get alerted and your ride is created automatically when one accepts.`,
                        actions: [
                            { tool: "navigate", args: { tab: "requestRide" }, label: `Request a ride to ${ents.destination}`, primary: true },
                            { tool: "navigate", args: { tab: "findRides" }, label: "Open Find Rides" },
                        ],
                        toolsUsed: ["searchRides"], intent,
                    }));
                }
                return finalize(ctx, base({
                    reply: `Found ${res.count} ride${res.count > 1 ? "s" : ""} to ${ents.destination}${ents.time?.after ? ` after ${ents.time.label}` : ""}:`,
                    cards: res.items.map((r) => ({ ...r, kind: "ride" })),
                    actions: [{ tool: "navigate", args: { tab: "findRides" }, label: "Open Find Rides" }],
                    toolsUsed: ["searchRides"], intent,
                }));
            }
            return finalize(ctx, base({ reply: "Where do you want to go? Try: \"Find a ride to Ahmedabad tomorrow after 5 PM.\"", actions: [{ tool: "navigate", args: { tab: "findRides" }, label: "Open Find Rides" }], intent }));
        }

        case INTENTS.REQUEST_RIDE: {
            const dest = ents.destination;
            return finalize(ctx, base({
                reply: dest
                    ? `I'll open Request a Ride for ${dest}. We alert online verified drivers nearby and create your ride automatically — at our fair, distance-based price — the moment a driver accepts.`
                    : "I can broadcast a ride request to nearby drivers for you. Pick your pickup and drop on the Request a Ride page — we'll alert online verified drivers and create your ride automatically at our fair price when one accepts.",
                actions: [
                    { tool: "navigate", args: { tab: "requestRide" }, label: dest ? `Request a ride to ${dest}` : "Open Request a Ride", primary: true },
                    { tool: "navigate", args: { tab: "findRides" }, label: "Search rides instead" },
                ],
                intent,
            }));
        }

        case INTENTS.BOOK_RIDE: {
            // Try to resolve which ride from the last search shown in memory.
            const lastSearch = findLastCards(userId, sessionId);
            const ride = pickRideFromText(text, lastSearch);
            if (!ride) {
                return finalize(ctx, base({ reply: "Which ride would you like to book? Search first (e.g. \"Find a ride to Ahmedabad\"), then say \"book the first one\".", actions: [{ tool: "navigate", args: { tab: "findRides" }, label: "Open Find Rides" }], intent }));
            }
            return finalize(ctx, base({
                reply: `Booking ${ride.source} → ${ride.destination} with ${ride.driver}. How many seats? (${ride.seats} available)`,
                actions: [{ tool: "bookRide", args: { rideId: ride.id, seats: 1 }, label: "Book 1 seat", primary: true }, { tool: "navigate", args: { tab: "findRides" }, label: "Open Find Rides" }],
                toolsUsed: ["bookRide"], intent,
            }));
        }

        case INTENTS.RECOMMEND: {
            const res = await tools.execute("recommendRides", {}, ctx);
            if (!res.ok || res.empty || !Array.isArray(res.items) || res.items.length === 0) {
                return finalize(ctx, base({
                    reply: res.message || "I don't have enough of your travel history to personalize yet. Search or book a few rides first!",
                    actions: [{ tool: "navigate", args: { tab: "findRides" }, label: "Find a ride" }],
                    toolsUsed: ["recommendRides"], intent,
                }));
            }
            return finalize(ctx, base({
                reply: `Here ${res.count > 1 ? "are" : "is"} ${res.count} ride${res.count > 1 ? "s" : ""} I'd recommend${res.favoriteRoute ? ` (you often travel to ${res.favoriteRoute})` : ""}:`,
                cards: res.items.map((r) => ({ ...r, kind: "ride" })),
                actions: [{ tool: "navigate", args: { tab: "findRides" }, label: "Open Find Rides" }],
                toolsUsed: ["recommendRides"], intent,
            }));
        }

        case INTENTS.CARBON: {
            const res = await tools.execute("carbonImpact", {}, ctx);
            if (!res.ok || res.empty) {
                return finalize(ctx, base({
                    reply: res.message || "You haven't completed any shared rides yet — share or join rides to start saving CO₂!",
                    actions: [{ tool: "navigate", args: { tab: "sustainability" }, label: "Open Sustainability" }],
                    toolsUsed: ["carbonImpact"], intent,
                }));
            }
            const trees = Math.max(1, Math.round(res.treeEquivalent || 0));
            return finalize(ctx, base({
                reply: `🌱 You've helped avoid about ${res.co2SavedKg} kg of CO₂ and ${res.fuelSavedL} L of fuel across ${res.sharedTrips} shared trip${res.sharedTrips > 1 ? "s" : ""} — equivalent to what ${trees} tree${trees > 1 ? "s" : ""} absorb in a year. 🌳`,
                actions: [{ tool: "navigate", args: { tab: "sustainability" }, label: "View full impact", primary: true }],
                toolsUsed: ["carbonImpact"], intent,
            }));
        }

        case INTENTS.BOOKINGS: {
            const res = await tools.execute("getMyBookings", {}, ctx);
            return finalize(ctx, base({
                reply: res.empty ? res.message : `You have ${res.count} booking${res.count > 1 ? "s" : ""}:`,
                cards: res.items ? res.items.map((b) => ({ ...b, kind: "booking" })) : [],
                actions: [{ tool: "navigate", args: { tab: "myBookings" }, label: "Open My Bookings", primary: true }],
                toolsUsed: ["getMyBookings"], intent,
            }));
        }

        case INTENTS.MY_RIDES: {
            const res = await tools.execute("getMyRides", {}, ctx);
            return finalize(ctx, base({
                reply: res.empty ? res.message : `You've created ${res.count} ride${res.count > 1 ? "s" : ""}:`,
                cards: res.items ? res.items.map((r) => ({ ...r, kind: "myride" })) : [],
                actions: [{ tool: "navigate", args: { tab: "myRides" }, label: "Open My Rides", primary: true }],
                toolsUsed: ["getMyRides"], intent,
            }));
        }

        case INTENTS.PAYMENTS: {
            const res = await tools.execute("getPaymentHistory", {}, ctx);
            return finalize(ctx, base({
                reply: res.empty ? res.message : `You've made ${res.count} payment${res.count > 1 ? "s" : ""}, totaling ${res.totalPaidLabel}:`,
                cards: res.items ? res.items.map((p) => ({ ...p, kind: "payment" })) : [],
                actions: [{ tool: "navigate", args: { tab: "payments" }, label: "Open Payments", primary: true }],
                toolsUsed: ["getPaymentHistory"], intent,
            }));
        }

        case INTENTS.EARNINGS: {
            const thisMonth = /\bthis month\b|\bmonth\b/.test(text.toLowerCase());
            const res = await tools.execute("getEarnings", { thisMonth }, ctx);
            let reply;
            if (!res.ok) reply = res.message || "I couldn't load your earnings right now. Please try the Earnings page.";
            else if (res.empty) reply = res.message;
            else if (thisMonth && res.monthLabel) reply = `You've earned ${res.monthLabel} this month. Your available balance is ${res.availableLabel} (${res.escrowPendingLabel} still in escrow).`;
            else reply = `Your earnings — Available: ${res.availableLabel}, In escrow: ${res.escrowPendingLabel}, Total: ${res.totalLabel}.`;
            return finalize(ctx, base({ reply, actions: [{ tool: "navigate", args: { tab: "earnings" }, label: "Open Earnings", primary: true }], toolsUsed: ["getEarnings"], intent }));
        }

        case INTENTS.ESCROW: {
            // "escrow balance" → data; otherwise explain via RAG.
            if (/\b(balance|how much|my escrow|pending)\b/.test(text.toLowerCase())) {
                const res = await tools.execute("getEscrowBalance", {}, ctx);
                let reply;
                if (!res.ok) reply = res.message || "I couldn't load your escrow balance right now.";
                else if (res.empty) reply = "You don't have any funds in escrow right now.";
                else reply = `You have ${res.escrowBalanceLabel} held in escrow across ${res.count} payment${res.count > 1 ? "s" : ""}.`;
                return finalize(ctx, base({
                    reply,
                    actions: [{ tool: "navigate", args: { tab: "earnings" }, label: "Open Earnings", primary: true }],
                    toolsUsed: ["getEscrowBalance"], intent,
                }));
            }
            return knowledgeAnswer(text, ctx, intent);
        }

        case INTENTS.TRACKING:
            return finalize(ctx, base({
                reply: "I can open live tracking for your active ride. 📍",
                actions: [{ tool: "openTracking", args: {}, label: "Track current ride", primary: true }, { tool: "navigate", args: { tab: "myBookings" }, label: "Open My Bookings" }],
                toolsUsed: ["trackRide"], intent,
            }));

        case INTENTS.VEHICLES:
            return knowledgeAnswerWithNav(text, ctx, intent, "myVehicle", "Open My Vehicle");
        case INTENTS.NOTIFICATIONS:
            return finalize(ctx, base({ reply: "Your notifications are in the bell at the top-right — bookings, ride updates, payments and more, in real time.", intent }));
        case INTENTS.CHAT:
            return knowledgeAnswerWithNav(text, ctx, intent, "chats", "Open Chats");
        case INTENTS.PROFILE:
            return knowledgeAnswerWithNav(text, ctx, intent, "profile", "Open Profile");

        case INTENTS.KNOWLEDGE:
        default:
            return knowledgeAnswer(text, ctx, intent);
    }
}

// RAG-grounded knowledge answer (no fabrication).
async function knowledgeAnswer(text, ctx, intent) {
    const { answer, grounded, sources } = await rag.answer(text);
    if (grounded && answer) {
        return finalize(ctx, base({ reply: answer, sources, ragGrounded: true, usedLLM: llm.isEnabled(), suggestions: roleSuggestions(ctx.user), intent: INTENTS.KNOWLEDGE }));
    }
    // Hallucination guard: nothing retrieved → say so, don't invent.
    return finalize(ctx, base({
        reply: "I couldn't find information for that request. I can help with rides, bookings, payments, escrow, tracking, vehicles, and support — what would you like to do?",
        suggestions: roleSuggestions(ctx.user), intent: INTENTS.FALLBACK,
    }));
}

async function knowledgeAnswerWithNav(text, ctx, intent, tab, label) {
    const { answer, grounded, sources } = await rag.answer(text);
    const reply = grounded && answer ? answer : null;
    return finalize(ctx, base({
        reply: reply || `Opening ${label.replace("Open ", "")} for you.`,
        sources: grounded ? sources : [],
        ragGrounded: grounded,
        usedLLM: grounded && llm.isEnabled(),
        actions: [{ tool: "navigate", args: { tab }, label, primary: true }],
        intent,
    }));
}

// Resolve a ride from "book the first/second" + last shown search cards.
function findLastCards(userId, sessionId) {
    const history = memory.getHistory(userId, sessionId);
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i]._cards) return history[i]._cards;
    }
    return null;
}
function pickRideFromText(text, cards) {
    if (!cards || cards.length === 0) return null;
    const t = text.toLowerCase();
    if (/\b(first|1st|one)\b/.test(t)) return cards[0];
    if (/\b(second|2nd|two)\b/.test(t)) return cards[1] || null;
    if (/\b(third|3rd|three)\b/.test(t)) return cards[2] || null;
    return cards[0];
}

// Attach assistant turn to memory (incl. any ride cards for follow-up booking).
function finalize(ctx, result) {
    const userId = ctx.user?._id;
    const sessionId = ctx.sessionId || "default";
    memory.addTurn(userId, sessionId, "assistant", result.reply);
    // Stash ride cards so "book the first one" can resolve later.
    const rideCards = (result.cards || []).filter((c) => c.kind === "ride");
    if (rideCards.length) {
        const turns = memory.getHistory(userId, sessionId);
        if (turns.length) turns[turns.length - 1]._cards = rideCards;
    }
    return result;
}

module.exports = { run };
