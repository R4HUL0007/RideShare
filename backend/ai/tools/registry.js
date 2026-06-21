// =======================================================
// RidexShare AI — Tool Registry
// -------------------------------------------------------
// Declarative tool descriptors (OpenAI/Anthropic/Gemini "tool calling" shape)
// plus their runtime implementations. Two kinds of tools:
//
//   - DATA tools   : run server-side, fetch real user-scoped data, return it.
//   - ACTION tools : return a UI "action" directive the frontend executes
//                    (navigate, prefill Create Ride, open tracking, book).
//                    This keeps write-side effects on the existing, audited
//                    frontend flows while the agent orchestrates them.
//
// `execute(name, args, ctx)` runs a tool by name. The same descriptor array is
// what a LangChain agent would be handed for function calling.
// =======================================================

const data = require("./dataTools");

// Frontend tab keys (must match the dashboard router/tabs).
const TAB = {
    home: "home", createRide: "createRide", findRides: "findRides",
    requestRide: "requestRide",
    myBookings: "myBookings", myRides: "myRides", rideHistory: "rideHistory",
    myVehicle: "myVehicle", chats: "chats", payments: "payments",
    earnings: "earnings", profile: "profile",
};

// ---- Tool descriptors (for LLM function calling) ----
const TOOL_SCHEMAS = [
    { name: "navigate", description: "Open a page/tab in the RidexShare dashboard.", parameters: { type: "object", properties: { tab: { type: "string", enum: Object.values(TAB) } }, required: ["tab"] } },
    { name: "createRide", description: "Open Create Ride pre-filled with collected fields.", parameters: { type: "object", properties: { source: { type: "string" }, destination: { type: "string" }, date: { type: "string" }, time: { type: "string" }, seats: { type: "number" }, vehicle: { type: "string" } } } },
    { name: "searchRides", description: "Search available rides by destination/time.", parameters: { type: "object", properties: { destination: { type: "string" }, afterHour: { type: "number" } }, required: ["destination"] } },
    { name: "bookRide", description: "Begin booking a specific ride by id.", parameters: { type: "object", properties: { rideId: { type: "string" }, seats: { type: "number" } }, required: ["rideId"] } },
    { name: "getMyBookings", description: "List the user's bookings (rides they joined).", parameters: { type: "object", properties: {} } },
    { name: "getMyRides", description: "List rides the user created/offered.", parameters: { type: "object", properties: {} } },
    { name: "getPaymentHistory", description: "Show the user's payment history and total paid.", parameters: { type: "object", properties: {} } },
    { name: "getEarnings", description: "Show the driver's earnings (available, escrow pending, total, optional this month).", parameters: { type: "object", properties: { thisMonth: { type: "boolean" } } } },
    { name: "getEscrowBalance", description: "Show the driver's escrow balance (held + awaiting completion).", parameters: { type: "object", properties: {} } },
    { name: "recommendRides", description: "Recommend rides personalized to the user's travel history and favorite routes.", parameters: { type: "object", properties: {} } },
    { name: "carbonImpact", description: "Show the user's environmental impact: CO2 saved, fuel saved, trees equivalent.", parameters: { type: "object", properties: {} } },
    { name: "trackRide", description: "Open live tracking for the user's active ride.", parameters: { type: "object", properties: { rideId: { type: "string" } } } },
];

// ---- Action-tool implementations (return UI directives) ----
const actionTools = {
    navigate: (args) => ({ ok: true, action: { tool: "navigate", args: { tab: args.tab || "home" } } }),
    createRide: (args) => ({ ok: true, action: { tool: "prefillCreateRide", args: {
        source: args.source, destination: args.destination, date: args.date, time: args.time, seats: args.seats, vehicle: args.vehicle,
    } } }),
    bookRide: (args) => ({ ok: true, action: { tool: "bookRide", args: { rideId: args.rideId, seats: args.seats || 1 } } }),
    trackRide: (args) => ({ ok: true, action: { tool: "openTracking", args: { rideId: args.rideId } } }),
};

// ---- Data-tool implementations (server-side) ----
const dataToolImpls = {
    getMyBookings: data.getMyBookings,
    getMyRides: data.getMyRides,
    getPaymentHistory: data.getPaymentHistory,
    getEarnings: data.getEarnings,
    getEscrowBalance: data.getEscrowBalance,
    searchRides: data.searchRides,
    recommendRides: data.recommendRides,
    carbonImpact: data.carbonImpact,
};

/**
 * Execute a tool by name. Returns a normalized result object. Never throws.
 * @param {string} name
 * @param {object} args
 * @param {object} ctx  { user }
 */
async function execute(name, args = {}, ctx = {}) {
    try {
        if (dataToolImpls[name]) {
            return await dataToolImpls[name](args, ctx);
        }
        if (actionTools[name]) {
            return actionTools[name](args, ctx);
        }
        return { ok: false, message: `Unknown tool: ${name}` };
    } catch (err) {
        console.error(`[AI] Tool '${name}' failed:`, err.message);
        return { ok: false, message: "That action couldn't be completed right now." };
    }
}

module.exports = { TOOL_SCHEMAS, TAB, execute };
