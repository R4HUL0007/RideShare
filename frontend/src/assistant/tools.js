// =======================================================
// RidexShare Assistant — Tool registry
// -------------------------------------------------------
// Declarative descriptors for the actions the assistant can take. The shape
// (name + description + JSON-schema-ish parameters) mirrors OpenAI/Gemini/
// Anthropic "tool calling" specs, so a future LLM agent can be handed this
// registry verbatim. The ENGINE only emits `{ tool, args }` action objects —
// the React layer (AssistantContext) binds each tool name to a real runtime
// implementation (navigate, search the rides API, prefill Create Ride, etc.).
// This keeps platform side-effects out of the engine and the UI.
// =======================================================

export const TOOLS = [
    {
        name: "navigate",
        description: "Open a page/tab inside the RidexShare dashboard.",
        parameters: {
            type: "object",
            properties: {
                tab: {
                    type: "string",
                    enum: [
                        "home", "createRide", "findRides", "requestRide", "myBookings", "myRides",
                        "rideHistory", "myVehicle", "chats", "payments", "earnings", "profile",
                    ],
                    description: "The dashboard tab to open.",
                },
            },
            required: ["tab"],
        },
    },
    {
        name: "searchRides",
        description: "Search available rides by destination (and optional date).",
        parameters: {
            type: "object",
            properties: {
                destination: { type: "string", description: "Destination to search for." },
                date: { type: "string", description: "Optional yyyy-mm-dd travel date." },
            },
            required: ["destination"],
        },
    },
    {
        name: "prefillCreateRide",
        description: "Open Create Ride with collected fields pre-filled.",
        parameters: {
            type: "object",
            properties: {
                source: { type: "string" },
                destination: { type: "string" },
                date: { type: "string", description: "yyyy-mm-dd" },
                time: { type: "string", description: "HH:mm (24h)" },
                seats: { type: "number" },
            },
        },
    },
    {
        name: "openTracking",
        description: "Open live tracking for the user's current/active ride.",
        parameters: { type: "object", properties: { rideId: { type: "string" } } },
    },
    {
        name: "requestRide",
        description: "Open Request a Ride to broadcast an on-demand ride request to nearby drivers (used when no rides are found).",
        parameters: {
            type: "object",
            properties: {
                destination: { type: "string", description: "Optional destination to request a ride to." },
            },
        },
    },
];

export const getToolSchemas = () => TOOLS;
