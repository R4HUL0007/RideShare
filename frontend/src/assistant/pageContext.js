// =======================================================
// RidexShare Assistant — Page context
// -------------------------------------------------------
// Maps the current dashboard tab to a friendly label + context-aware suggested
// prompts the assistant offers. Pure data; the widget reads this to tailor the
// welcome screen and quick suggestions to where the user currently is.
// =======================================================

export const PAGE_CONTEXT = {
    home: {
        label: "Home",
        hint: "Welcome! How can I help you get moving today?",
        suggestions: ["Create a ride", "Find a ride", "How does escrow work?", "Show my bookings"],
    },
    createRide: {
        label: "Create Ride",
        hint: "Offering a ride? I can walk you through it or set it up for you.",
        suggestions: ["Help me select pickup & destination", "How do I set the price?", "Create a ride to Ahmedabad tomorrow 8 AM with 3 seats"],
    },
    findRides: {
        label: "Find Rides",
        hint: "Looking for a ride? Tell me where you're headed.",
        suggestions: ["Find a ride to Ahmedabad tomorrow", "How do I filter rides?", "How do I book a ride?"],
    },
    searchResults: {
        label: "Search Results",
        hint: "Need help booking one of these?",
        suggestions: ["How do I book a ride?", "How does payment work?"],
    },
    myBookings: {
        label: "My Bookings",
        hint: "Managing your trips — I can explain or navigate.",
        suggestions: ["Show my upcoming rides", "How do I cancel a booking?", "Track my ride"],
    },
    myRides: {
        label: "My Rides",
        hint: "Your offered rides. Need a hand?",
        suggestions: ["How do I complete a ride?", "How do passengers pay me?", "Open my earnings"],
    },
    rideHistory: {
        label: "Ride History",
        hint: "Your past rides at a glance.",
        suggestions: ["How are ratings calculated?", "Find a ride"],
    },
    myVehicle: {
        label: "My Vehicle",
        hint: "Manage the vehicles you drive.",
        suggestions: ["How do I add a vehicle?", "Create a ride"],
    },
    chats: {
        label: "Chats",
        hint: "Ride-scoped chat with your co-travellers.",
        suggestions: ["Who can I chat with?", "How do I share my location?"],
    },
    payments: {
        label: "Payments",
        hint: "Payments & receipts. Ask me anything.",
        suggestions: ["How do payments work?", "How does escrow work?", "How do I get a receipt?"],
    },
    earnings: {
        label: "Earnings",
        hint: "Track and withdraw your earnings.",
        suggestions: ["How do withdrawals work?", "What is escrow pending?", "How much can I withdraw?"],
    },
    profile: {
        label: "Profile",
        hint: "Your account, ratings and reviews.",
        suggestions: ["How do ratings work?", "Where are my reviews?"],
    },
};

export function getPageContext(tab) {
    return PAGE_CONTEXT[tab] || PAGE_CONTEXT.home;
}
