// =======================================================
// RidexShare AI — Knowledge Sources (RAG corpus)
// -------------------------------------------------------
// The curated platform documentation that RAG retrieves from. Each source is a
// self-contained document with a stable id, category, title and rich content.
// This is intentionally RAG-friendly: the ingestion pipeline chunks + embeds
// `content` into the vector store. New sources (admin uploads, PDFs) can be
// appended here or ingested dynamically without code changes elsewhere.
// =======================================================

const KNOWLEDGE_SOURCES = [
    {
        id: "doc_escrow",
        category: "payments",
        title: "How Escrow Works",
        content:
            "RidexShare protects every paid ride with an escrow system. When a passenger pays for a booking, the money is NOT sent to the driver immediately — it is held safely by the platform in escrow. The escrow lifecycle is: held (passenger paid) → awaiting_completion (ride marked complete, a 24-hour auto-release clock starts) → released (funds paid to the driver). After a ride completes, the passenger can confirm it to release funds to the driver immediately. If the passenger does nothing, the funds auto-release to the driver after 24 hours so drivers are never stuck waiting. If something went wrong, the passenger can raise a dispute BEFORE release, which freezes the escrow (status: disputed) until an admin reviews it. Disputes resolve to either released (paid to driver) or refunded (returned to passenger). The platform commission is deducted from the fare; the driver receives fare minus commission as driverEarnings.",
    },
    {
        id: "doc_disputes",
        category: "payments",
        title: "How Disputes Are Handled",
        content:
            "A passenger can raise a dispute against a payment for reasons such as ride not taken, driver no-show, wrong route, safety concern, or being overcharged. Filing a dispute immediately freezes the linked payment's escrow so the auto-release sweep skips it. An admin then reviews the ride information, payment, chat history, tracking logs, ratings and user history. The admin resolves the dispute in one of two ways: 'released' rejects the dispute and pays the driver, or 'refunded' upholds the dispute and refunds the passenger. Repeated false disputes (rejected on review) count against a passenger and after three false disputes the account is flagged for manual review. The platform never auto-bans.",
    },
    {
        id: "doc_withdrawals",
        category: "payments",
        title: "How Withdrawals Work",
        content:
            "Drivers earn money from completed, released rides. The Earnings page shows four balances: Available (released funds ready to withdraw), Escrow Pending (held until rides complete), Released, and Total. To withdraw, a driver first saves payout details (a UPI ID is sufficient for now; bank details are supported too), then requests a withdrawal of their available balance. Withdrawals are reviewed and approved by an admin. If a withdrawal is rejected, the funds return to the driver's available balance so they can re-request. The architecture is ready for automated payouts (Razorpay Route / RazorpayX) in the future.",
    },
    {
        id: "doc_payments",
        category: "payments",
        title: "How Payments Work",
        content:
            "Paid rides are charged at the time of booking through Razorpay, which supports UPI, cards, net banking and wallets. Payment is verified on the server using an HMAC-SHA256 signature check before the seat is confirmed — the browser is never trusted on its own. Only after a verified payment is the booking confirmed and the seat reserved. Free rides book instantly without payment. Every transaction is visible on the Payments page where receipts can be viewed. The amount breakdown stores fare, platform fee and tax separately for transparent receipts.",
    },
    {
        id: "doc_create_ride",
        category: "rides",
        title: "Creating (Offering) a Ride",
        content:
            "To offer a ride, a driver opens Create Ride, selects a registered vehicle, picks a pickup point and destination (with map markers that can be fine-tuned), sets the date and time, the number of available seats (1 to 4), and an optional price per seat. The gender preference for the ride is derived automatically from the driver. On publish, riders whose role matches are notified and can book matching rides. A driver must have at least one vehicle registered before offering a ride.",
    },
    {
        id: "doc_request_ride",
        category: "rides",
        title: "Request a Ride (Ride Request Broadcast)",
        content:
            "When no suitable ride exists yet, a passenger can use Request a Ride to broadcast an on-demand request to nearby drivers — similar to how Ola/Uber dispatch. The passenger sets a pickup and drop and chooses a vehicle class (Bike, Auto or Car); the fare is calculated automatically from the trip distance at the platform's fair, distance-based price (no haggling, no manual price entry). On Broadcast, the request is sent in real time to online, verified drivers within a configurable radius (default 10 km, set via RIDE_REQUEST_RADIUS_KM) and they receive a notification with the route, distance and fare to Accept or Ignore. The moment a driver accepts, the matching ride is created automatically at the quoted price and the passenger is notified — the passenger can then book it directly. Requests expire automatically after a configurable window (RIDE_REQUEST_EXPIRY_MIN). A passenger can cancel a pending request anytime. Admins can view, filter, cancel and force-expire requests from the Ride Requests page.",
    },
    {
        id: "doc_find_ride",
        category: "rides",
        title: "Finding and Booking a Ride",
        content:
            "To find a ride, a passenger opens Find Rides, enters a source and destination (or uses current location for pickup), and can filter by date, seats required, vehicle type, and gender preference. Search results show the route, driver, vehicle, seats available, timing and price per seat. Selecting a ride and tapping Book reserves seats. Paid rides go through secure Razorpay checkout; free rides book instantly. A safety rule prevents male passengers from seeing rides offered by female drivers.",
    },
    {
        id: "doc_bookings",
        category: "bookings",
        title: "Managing Bookings",
        content:
            "My Bookings shows a passenger's rides across Upcoming, Completed and Cancelled tabs. A passenger can view ride details, see the route on a map, track an active ride, and cancel within 3 minutes of booking (after which the cancellation window closes). Completed rides prompt the passenger to rate the driver. Booking a ride reduces the available seat count and notifies the driver in real time.",
    },
    {
        id: "doc_tracking",
        category: "tracking",
        title: "Live Ride Tracking",
        content:
            "Live Tracking shows the driver's real-time location, the planned route, ETA and remaining distance on a map. The tracking state flows scheduled → enroute → arriving → arrived → in_progress → completed. The driver taps Start Ride to begin sharing location and End Ride to complete the trip. Passengers open tracking from a confirmed booking. Only the participants of a ride (the driver and booked passengers) can view its tracking — tracking is never public.",
    },
    {
        id: "doc_ratings",
        category: "ratings",
        title: "Ratings and Reviews",
        content:
            "After a completed ride, the passenger rates the driver and the driver rates the passenger. A review is a 1-to-5 star rating plus optional per-category scores and a written comment. Driver categories are driving, punctuality, communication and vehicle; passenger categories are punctuality, communication and behavior. Reviews are tied to a completed ride, you cannot review yourself, and duplicate reviews for the same ride are blocked. A user's profile shows the reviews they have received as a driver and as a passenger.",
    },
    {
        id: "doc_vehicles",
        category: "vehicles",
        title: "Managing Vehicles",
        content:
            "My Vehicle lets a driver add and manage vehicles: type (Car, Motorcycle, Scooter, Auto-rickshaw), make, model, year, color, license plate, total seats, photos, amenities (such as AC, music system, charging port), driving license and experience. A driver selects one of their vehicles when offering a ride. Multiple vehicles per user are supported.",
    },
    {
        id: "doc_chat",
        category: "chat",
        title: "Chat with Co-travellers",
        content:
            "Chat is ride-scoped: a driver and a booked passenger of the same ride can message each other in real time. Messages can be plain text or a shared live location rendered as an in-app map. Conversations appear in Chats with unread counts. Only participants of a ride can chat within that ride; you cannot message users outside a shared ride.",
    },
    {
        id: "doc_notifications",
        category: "notifications",
        title: "Notifications",
        content:
            "The notification bell shows your personal notifications in real time — booking updates, ride updates, tracking changes, chat messages, payment and escrow events, reviews and admin actions. Notifications are private to each user and deep-link to the relevant page. You can mark notifications read individually or all at once, and clear them.",
    },
    {
        id: "doc_safety",
        category: "safety",
        title: "Safety and Community Guidelines",
        content:
            "RidexShare is a closed community: every member signs in with a verified @paruluniversity.ac.in email. A safety rule prevents male riders from seeing rides offered by female drivers. Ratings, reviews and a dispute system keep the community accountable. Live tracking is restricted to ride participants. Suspended accounts are blocked from the platform. Never share OTPs or passwords. Report unsafe behavior through a dispute or by contacting support.",
    },
    {
        id: "doc_account",
        category: "account",
        title: "Sign up, OTP and Google Sign-in",
        content:
            "Register with a @paruluniversity.ac.in email and verify the 6-digit OTP sent to your inbox. You can also use 'Continue with Google' but only with a @paruluniversity.ac.in Google account. Email verification is required before you can log in. You can reset a forgotten password through an OTP-based flow, and update your profile (name, phone, gender, profile picture) from My Profile.",
    },
    {
        id: "doc_admin",
        category: "admin",
        title: "Admin Platform Management",
        content:
            "Admins access a dedicated admin panel to manage the platform: dashboard analytics (users, rides, bookings, revenue, escrow balance, disputes), user management (search, suspend, reactivate, flag), ride and booking oversight, payment and escrow visibility, a dispute resolution center, withdrawal approvals, review moderation, live monitoring, and an append-only audit log of every admin action. Admin access is gated server-side; regular users cannot reach admin features.",
    },
];

module.exports = { KNOWLEDGE_SOURCES };
