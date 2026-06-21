// =======================================================
// RidexShare Assistant — Knowledge Base
// -------------------------------------------------------
// Each entry is a self-contained "document" (id, topic, title, keywords,
// content). This shape is intentionally RAG-friendly: a future ingestion
// pipeline can embed `content` into a vector store (Chroma/Pinecone/Qdrant)
// and retrieve by semantic similarity instead of the keyword scorer below.
// Until then, `searchKnowledge()` does lightweight keyword/topic scoring.
// =======================================================

export const KNOWLEDGE_BASE = [
    {
        id: "kb_create_ride",
        topic: "rides",
        title: "How to create (offer) a ride",
        keywords: ["create", "offer", "host", "publish", "post", "new ride", "drive", "give ride"],
        content:
            "To offer a ride: open Create Ride, pick your pickup point and destination on the map (drag the markers to fine-tune), choose your vehicle, set the date & time, the number of seats, and the price per seat. Confirm to publish — riders matching your route can then book.",
        actions: [{ label: "Open Create Ride", tool: "navigate", args: { tab: "createRide" } }],
    },
    {
        id: "kb_find_ride",
        topic: "rides",
        title: "How to find and book a ride",
        keywords: ["find", "search", "book", "discover", "available rides", "join ride"],
        content:
            "To find a ride: open Find Rides, enter your source and destination (use 'current location' for pickup), optionally filter by date, seats, vehicle type, or gender preference, then open a ride and tap Book. Paid rides go through secure checkout; free rides book instantly.",
        actions: [{ label: "Open Find Rides", tool: "navigate", args: { tab: "findRides" } }],
    },
    {
        id: "kb_bookings",
        topic: "bookings",
        title: "Managing your bookings",
        keywords: ["bookings", "my bookings", "upcoming", "completed", "cancelled", "cancel booking"],
        content:
            "My Bookings shows your rides as a passenger across Upcoming, Completed, and Cancelled tabs. You can view details, see the route on a map, track an active ride, and cancel within 3 minutes of booking. Completed rides let you rate the driver.",
        actions: [{ label: "Open My Bookings", tool: "navigate", args: { tab: "myBookings" } }],
    },
    {
        id: "kb_vehicles",
        topic: "vehicles",
        title: "Managing your vehicles",
        keywords: ["vehicle", "car", "bike", "add vehicle", "my vehicle", "license plate"],
        content:
            "My Vehicle lets you add and manage the vehicles you drive — make, model, type, license plate, colour, seats, and amenities. You select one of these when offering a ride. You can also set a default vehicle.",
        actions: [{ label: "Open My Vehicle", tool: "navigate", args: { tab: "myVehicle" } }],
    },
    {
        id: "kb_tracking",
        topic: "tracking",
        title: "Live ride tracking",
        keywords: ["track", "tracking", "live", "where is driver", "eta", "location", "driver location"],
        content:
            "Live Tracking shows the driver's real-time location, the route, ETA and distance remaining on a map. Drivers tap Start Ride to share location and End Ride to complete. Passengers open tracking from a confirmed booking. Only ride participants can view tracking.",
    },
    {
        id: "kb_payments",
        topic: "payments",
        title: "How payments work",
        keywords: ["payment", "pay", "razorpay", "upi", "card", "checkout", "transaction", "receipt"],
        content:
            "Paid rides are charged at booking through Razorpay (UPI, cards, net banking, wallets). Payment is verified on our server before your seat is confirmed — we never trust the browser alone. You can view every transaction and download receipts from the Payments page.",
        actions: [{ label: "Open Payments", tool: "navigate", args: { tab: "payments" } }],
    },
    {
        id: "kb_escrow",
        topic: "payments",
        title: "How escrow protects you",
        keywords: ["escrow", "held", "release", "refund", "dispute", "safe", "hold money"],
        content:
            "Your payment is held safely in escrow by the platform — it is NOT sent to the driver immediately. After the ride is completed you confirm it to release the money to the driver. If you do nothing, it auto-releases after 24 hours so drivers aren't stuck. If something went wrong, raise a dispute before release and the funds are frozen for review.",
        actions: [{ label: "Open Payments", tool: "navigate", args: { tab: "payments" } }],
    },
    {
        id: "kb_earnings",
        topic: "payments",
        title: "Driver earnings & withdrawals",
        keywords: ["earnings", "withdraw", "withdrawal", "payout", "balance", "available balance", "earned"],
        content:
            "Drivers see four balances on Earnings: Available (released, ready to withdraw), Escrow Pending (held until rides complete), Released, and Total. Add a UPI ID under payout details, then request a withdrawal of your available balance — payouts are approved by an admin.",
        actions: [{ label: "Open Earnings", tool: "navigate", args: { tab: "earnings" } }],
    },
    {
        id: "kb_ratings",
        topic: "ratings",
        title: "Ratings & reviews",
        keywords: ["rating", "review", "rate", "stars", "feedback"],
        content:
            "After a completed ride, passengers rate the driver and drivers rate passengers — a 1–5 star rating plus per-category scores and an optional written review. Your profile shows reviews you've received (As Driver / As Passenger). A review you give appears on the other person's profile.",
        actions: [{ label: "Open Profile", tool: "navigate", args: { tab: "profile" } }],
    },
    {
        id: "kb_chat",
        topic: "chat",
        title: "Chatting with co-travellers",
        keywords: ["chat", "message", "contact", "talk", "co-traveller"],
        content:
            "Chat is ride-scoped: a driver and a booked passenger of the same ride can message each other in real time. You can share your live location in chat as an in-app map. Open Chats to see your conversations.",
        actions: [{ label: "Open Chats", tool: "navigate", args: { tab: "chats" } }],
    },
    {
        id: "kb_notifications",
        topic: "notifications",
        title: "Notifications",
        keywords: ["notification", "alerts", "bell", "updates"],
        content:
            "The bell (top-right) shows your personal notifications in real time — bookings, ride updates, tracking, chat messages, payments and more. Notifications are private to you and deep-link to the relevant page.",
    },
    {
        id: "kb_safety",
        topic: "safety",
        title: "Safety & community",
        keywords: ["safety", "safe", "gender", "verified", "trust", "secure"],
        content:
            "RidexShare is a closed community — every member signs in with a verified @paruluniversity.ac.in email. A safety rule prevents male riders from seeing rides offered by female drivers. Ratings, reviews and reporting keep the community accountable.",
    },
    {
        id: "kb_otp",
        topic: "account",
        title: "Sign up, OTP & Google sign-in",
        keywords: ["sign up", "register", "otp", "verify", "google", "login", "account"],
        content:
            "Register with your @paruluniversity.ac.in email and verify the 6-digit OTP sent to your inbox. You can also use 'Continue with Google' — but only with your @paruluniversity.ac.in Google account.",
    },
];

export function getKnowledgeById(id) {
    return KNOWLEDGE_BASE.find((d) => d.id === id) || null;
}

// Lightweight keyword/topic relevance scorer. Returns the best-matching entries
// above a threshold. (Swap this for vector similarity when RAG is wired up.)
export function searchKnowledge(query, { limit = 3 } = {}) {
    const q = (query || "").toLowerCase();
    if (!q.trim()) return [];
    const tokens = q.split(/\s+/).filter(Boolean);

    const scored = KNOWLEDGE_BASE.map((doc) => {
        let score = 0;
        for (const kw of doc.keywords) {
            if (q.includes(kw)) score += kw.includes(" ") ? 3 : 2;
        }
        // Token overlap with title + keywords.
        const hay = `${doc.title} ${doc.keywords.join(" ")} ${doc.topic}`.toLowerCase();
        for (const t of tokens) {
            if (t.length >= 3 && hay.includes(t)) score += 1;
        }
        return { doc, score };
    })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    return scored.map((s) => s.doc);
}
