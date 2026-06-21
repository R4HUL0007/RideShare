/* =======================================================
   RideShare — Dummy data seeder (for local/Docker testing)
   -------------------------------------------------------
   Inserts realistic test data across users, vehicles, rides, payments,
   reviews, support tickets, safety reports, SOS events, ride requests,
   withdrawals, disputes, verifications, emergency contacts and notifications.

   SAFE & RE-RUNNABLE: it only ever touches the dummy accounts listed in
   SEED_EMAILS (and their related docs). Your real admin account and real data
   are never deleted. Run it again any time to reset the dummy dataset.

   Usage (from the backend folder, with the Docker mongo running on 27018):
       node seedDummyData.js
   Or against a custom DB:
       SEED_MONGO_URI="mongodb://127.0.0.1:27018/RIDESHARE" node seedDummyData.js

   Every dummy user logs in with password:  Test@1234
   ======================================================= */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("./models/User");
const Vehicle = require("./models/Vehicle");
const Ride = require("./models/Ride");
const Payment = require("./models/Payment");
const Review = require("./models/Review");
const SupportTicket = require("./models/SupportTicket");
const SafetyReport = require("./models/SafetyReport");
const SosEvent = require("./models/SosEvent");
const Withdrawal = require("./models/Withdrawal");
const Dispute = require("./models/Dispute");
const Verification = require("./models/Verification");
const EmergencyContact = require("./models/EmergencyContact");
const Notification = require("./models/Notification");
const PersonalRideRequest = require("./models/PersonalRideRequest");
const DriverLedger = require("./models/DriverLedger");
const Settlement = require("./models/Settlement");

const MONGO_URI = process.env.SEED_MONGO_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27018/RIDESHARE";
const PASSWORD = "Test@1234";

const now = Date.now();
const days = (n) => new Date(now + n * 86400000);
const hrs = (n) => new Date(now + n * 3600000);

// All dummy accounts (cleanup + recreate target by these emails).
const SEED_EMAILS = [
    "aarav.shah@paruluniversity.ac.in",
    "priya.patel@paruluniversity.ac.in",
    "rohan.mehta@paruluniversity.ac.in",
    "sneha.iyer@paruluniversity.ac.in",
    "karan.desai@paruluniversity.ac.in",
    "ananya.nair@paruluniversity.ac.in",
    "vikram.rao@paruluniversity.ac.in",
    "meera.joshi@paruluniversity.ac.in",
];

async function cleanup() {
    const existing = await User.find({ email: { $in: SEED_EMAILS } }).select("_id").lean();
    const ids = existing.map((u) => u._id);
    if (ids.length === 0) return;
    await Promise.all([
        Vehicle.deleteMany({ user_id: { $in: ids } }),
        Ride.deleteMany({ user_id: { $in: ids } }),
        Payment.deleteMany({ $or: [{ user_id: { $in: ids } }, { driver_id: { $in: ids } }] }),
        Review.deleteMany({ $or: [{ reviewer: { $in: ids } }, { reviewee: { $in: ids } }] }),
        SupportTicket.deleteMany({ user_id: { $in: ids } }),
        SafetyReport.deleteMany({ $or: [{ reporter_id: { $in: ids } }, { against_id: { $in: ids } }] }),
        SosEvent.deleteMany({ user_id: { $in: ids } }),
        Withdrawal.deleteMany({ driver_id: { $in: ids } }),
        Dispute.deleteMany({ $or: [{ raisedBy: { $in: ids } }, { against: { $in: ids } }] }),
        Verification.deleteMany({ user_id: { $in: ids } }),
        EmergencyContact.deleteMany({ user_id: { $in: ids } }),
        Notification.deleteMany({ user_id: { $in: ids } }),
        PersonalRideRequest.deleteMany({ $or: [{ passenger_id: { $in: ids } }, { driver_id: { $in: ids } }] }),
        DriverLedger.deleteMany({ driver_id: { $in: ids } }),
        Settlement.deleteMany({ driver_id: { $in: ids } }),
    ]);
    await User.deleteMany({ _id: { $in: ids } });
    console.log(`🧹 Cleaned previous dummy data (${ids.length} users + related docs).`);
}

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log(`✅ Connected: ${MONGO_URI}`);

    await cleanup();

    const hash = await bcrypt.hash(PASSWORD, 10);
    const mk = (over) => ({
        password: hash, authProvider: "local", isVerified: true, status: "active", ...over,
    });

    // ---------------- Users ----------------
    const [aarav, priya, rohan, sneha, karan, ananya, vikram, meera] = await User.create([
        mk({ name: "Aarav Shah", username: "aarav.shah", email: SEED_EMAILS[0], phoneNumber: "9810000001", role: "Student", gender: "Male", isDriverVerified: true,
            ratings: { driver: { count: 12, average: 4.7, categories: { driving: 4.8, punctuality: 4.6, communication: 4.7, vehicle: 4.7 } }, passenger: { count: 3, average: 4.5, categories: { punctuality: 4.5, communication: 4.5, behavior: 4.5 } } },
            payoutDetails: { upiId: "aarav@okhdfc" } }),
        mk({ name: "Priya Patel", username: "priya.patel", email: SEED_EMAILS[1], phoneNumber: "9810000002", role: "Faculty", gender: "Female", isDriverVerified: true,
            ratings: { driver: { count: 8, average: 4.9, categories: { driving: 5, punctuality: 4.8, communication: 4.9, vehicle: 4.9 } }, passenger: { count: 0, average: 0, categories: {} } },
            payoutDetails: { upiId: "priya@okaxis" } }),
        mk({ name: "Rohan Mehta", username: "rohan.mehta", email: SEED_EMAILS[2], phoneNumber: "9810000003", role: "Student", gender: "Male", isDriverVerified: true,
            ratings: { driver: { count: 5, average: 4.3, categories: { driving: 4.4, punctuality: 4.2, communication: 4.3, vehicle: 4.3 } } },
            payoutDetails: { upiId: "rohan@oksbi" } }),
        mk({ name: "Sneha Iyer", username: "sneha.iyer", email: SEED_EMAILS[3], phoneNumber: "9810000004", role: "Student", gender: "Female" }),
        mk({ name: "Karan Desai", username: "karan.desai", email: SEED_EMAILS[4], phoneNumber: "9810000005", role: "Student", gender: "Male" }),
        mk({ name: "Ananya Nair", username: "ananya.nair", email: SEED_EMAILS[5], phoneNumber: "9810000006", role: "Faculty", gender: "Female" }),
        mk({ name: "Vikram Rao", username: "vikram.rao", email: SEED_EMAILS[6], phoneNumber: "9810000007", role: "Student", gender: "Male", status: "frozen", statusReason: "Suspicious activity flagged for review" }),
        mk({ name: "Meera Joshi", username: "meera.joshi", email: SEED_EMAILS[7], phoneNumber: "9810000008", role: "Student", gender: "Female", isDriverVerified: false }),
    ]);
    console.log("👤 Users created (8).");

    // ---------------- Vehicles ----------------
    const [vAarav, vPriya, vRohan, vMeera] = await Vehicle.create([
        { user_id: aarav._id, vehicleType: "Car", make: "Maruti Suzuki", model: "Swift", year: 2021, color: "White", licensePlate: "GJ06AB1234", totalSeats: 4, drivingLicense: "GJ0620210001234", experience: 4, amenities: ["AC Available", "Music System", "Charging Port"], isVerified: true },
        { user_id: priya._id, vehicleType: "Car", make: "Hyundai", model: "i20", year: 2022, color: "Blue", licensePlate: "GJ06CD5678", totalSeats: 4, drivingLicense: "GJ0620220005678", experience: 6, amenities: ["AC Available", "Clean & Well Maintained"], isVerified: true },
        { user_id: rohan._id, vehicleType: "Motorcycle", make: "Royal Enfield", model: "Classic 350", year: 2020, color: "Black", licensePlate: "GJ06EF9012", totalSeats: 1, drivingLicense: "GJ0620200009012", experience: 3, amenities: [], isVerified: true },
        { user_id: meera._id, vehicleType: "Car", make: "Tata", model: "Nexon", year: 2023, color: "Red", licensePlate: "GJ06GH3456", totalSeats: 4, drivingLicense: "GJ0620230003456", experience: 2, amenities: ["AC Available", "Spacious"], isVerified: false },
    ]);
    console.log("🚗 Vehicles created (4).");

    // ---------------- Rides ----------------
    // Available upcoming rides.
    const PU = { lat: 22.2895, lng: 73.3631 };  // Parul University, Waghodia, Vadodara
    const AHM = { lat: 23.0225, lng: 72.5714 }; // Ahmedabad
    const SRT = { lat: 21.1702, lng: 72.8311 }; // Surat
    const VADSTN = { lat: 22.3100, lng: 73.1812 }; // Vadodara Railway Station
    const [rideA, rideB] = await Ride.create([
        { user_id: aarav._id, role: "Student", gender_preference: "Any", source: "Parul University, Vadodara", destination: "Ahmedabad", timing: days(1), status: "Available", seatsAvailable: 3, vehicle_id: vAarav._id, pricePerPerson: 250, sourceCoords: PU, destinationCoords: AHM },
        { user_id: priya._id, role: "Faculty", gender_preference: "Female", source: "Parul University, Vadodara", destination: "Surat", timing: days(2), status: "Available", seatsAvailable: 3, vehicle_id: vPriya._id, pricePerPerson: 300, sourceCoords: PU, destinationCoords: SRT },
    ]);

    // Completed ride (Rohan drove Karan) — powers payments/escrow/reviews.
    const rideDone = await Ride.create({
        user_id: aarav._id, role: "Student", gender_preference: "Any",
        source: "Parul University, Vadodara", destination: "Vadodara Railway Station",
        timing: hrs(-30), status: "Completed", seatsAvailable: 2, vehicle_id: vAarav._id,
        pricePerPerson: 120, sourceCoords: PU, destinationCoords: VADSTN,
        passengers: [
            { user_id: karan._id, seats: 1, bookedAt: hrs(-50), boardingVerified: true, verifiedAt: hrs(-31), dropOffConfirmed: true },
            { user_id: sneha._id, seats: 1, bookedAt: hrs(-48), boardingVerified: true, verifiedAt: hrs(-31) },
        ],
        tracking: { state: "completed", startedAt: hrs(-31), endedAt: hrs(-30) },
    });
    console.log("🛣️  Rides created (3).");

    // ---------------- Payments (various escrow states) ----------------
    const mkPay = (over) => ({
        seats: 1, currency: "INR", amountBreakdown: { fare: 120, platformFee: 0, tax: 0 }, driverEarnings: 120,
        routeSnapshot: { source: rideDone.source, destination: rideDone.destination, timing: rideDone.timing },
        ...over,
    });
    await Payment.create([
        // Released earnings (available to withdraw).
        mkPay({ user_id: karan._id, driver_id: aarav._id, ride_id: rideDone._id, order_id: "seed_order_1", payment_id: "seed_pay_1", amount: 120, status: "Successful", escrowStatus: "released", completedAt: hrs(-30), escrowReleasedAt: hrs(-6), releaseType: "passenger_confirmed", paidAt: hrs(-50) }),
        // Held in escrow (ride completed, awaiting release).
        mkPay({ user_id: sneha._id, driver_id: aarav._id, ride_id: rideDone._id, order_id: "seed_order_2", payment_id: "seed_pay_2", amount: 120, status: "Successful", escrowStatus: "awaiting_completion", completedAt: hrs(-30), autoReleaseAt: hrs(18), paidAt: hrs(-48) }),
        // Disputed payment (frozen) — links to the dispute below.
        mkPay({ user_id: ananya._id, driver_id: priya._id, ride_id: rideB._id, order_id: "seed_order_3", payment_id: "seed_pay_3", amount: 300, driverEarnings: 300, amountBreakdown: { fare: 300, platformFee: 0, tax: 0 }, status: "Successful", escrowStatus: "disputed", completedAt: hrs(-20), paidAt: hrs(-40), routeSnapshot: { source: rideB.source, destination: rideB.destination, timing: rideB.timing } }),
    ]);
    const disputedPayment = await Payment.findOne({ order_id: "seed_order_3" });
    console.log("💳 Payments created (3).");

    // ---------------- Reviews (completed ride) ----------------
    await Review.create([
        { ride: rideDone._id, reviewer: karan._id, reviewee: aarav._id, direction: "passengerToDriver", rating: 5, comment: "Smooth ride, very punctual!", categories: { driving: 5, punctuality: 5, communication: 5, vehicle: 4 } },
        { ride: rideDone._id, reviewer: aarav._id, reviewee: karan._id, direction: "driverToPassenger", rating: 5, comment: "Great co-passenger.", categories: { punctuality: 5, communication: 5, behavior: 5 } },
        { ride: rideDone._id, reviewer: sneha._id, reviewee: aarav._id, direction: "passengerToDriver", rating: 4, comment: "Good ride, slightly late pickup.", categories: { driving: 4, punctuality: 3, communication: 5, vehicle: 4 } },
    ]);
    console.log("⭐ Reviews created (3).");

    // ---------------- Support tickets (conversation threads) ----------------
    await SupportTicket.create([
        { user_id: karan._id, name: karan.name, email: karan.email, topic: "Refund not received", description: "I cancelled my ride but haven't got the refund yet.", status: "open", lastMessageAt: hrs(-2), unreadForAgent: 1,
            messages: [
                { from: "user", senderName: karan.name, text: "I cancelled my ride but haven't got the refund yet.", at: hrs(-2) },
                { from: "system", text: "Request received. Our support team will reply here shortly.", at: hrs(-2) },
            ] },
        { user_id: sneha._id, name: sneha.name, email: sneha.email, topic: "How does escrow work?", description: "Wanted to understand when the driver gets paid.", status: "in_progress", agentName: "Support", lastMessageAt: hrs(-1), unreadForUser: 1,
            messages: [
                { from: "user", senderName: sneha.name, text: "Wanted to understand when the driver gets paid.", at: hrs(-5) },
                { from: "system", text: "Support joined the conversation.", at: hrs(-1.2) },
                { from: "agent", senderName: "Support", text: "Funds are held in escrow until the ride completes, then released to the driver. Let me know if that helps!", at: hrs(-1) },
            ] },
        { user_id: ananya._id, name: ananya.name, email: ananya.email, topic: "App feedback", description: "Loving the new request-a-ride feature!", status: "closed", agentName: "Support", lastMessageAt: hrs(-26),
            messages: [
                { from: "user", senderName: ananya.name, text: "Loving the new request-a-ride feature!", at: hrs(-28) },
                { from: "agent", senderName: "Support", text: "Thank you so much for the kind words! 😊", at: hrs(-27) },
                { from: "system", text: "Ticket closed by support.", at: hrs(-26) },
            ] },
    ]);
    console.log("🎟️  Support tickets created (3).");

    // ---------------- Safety reports ----------------
    await SafetyReport.create([
        { reporter_id: sneha._id, against_id: rohan._id, ride_id: rideDone._id, reportType: "unsafe_driving", reason: "Over-speeding", description: "Driver was speeding on the highway.", status: "open", priority: "high" },
        { reporter_id: karan._id, reportType: "vehicle_mismatch", reason: "Different car than shown", description: "The car number didn't match the app.", status: "resolved", priority: "medium", resolution: "Verified with driver — plate was updated. No further action." },
    ]);
    console.log("🚩 Safety reports created (2).");

    // ---------------- SOS events ----------------
    await SosEvent.create([
        { user_id: sneha._id, ride_id: rideDone._id, location: { lat: 22.29, lng: 73.05, address: "NH-48, Vadodara" }, rideSnapshot: { source: rideDone.source, destination: rideDone.destination, driverName: aarav.name, driverPhone: aarav.phoneNumber, vehicle: "Maruti Swift", licensePlate: "GJ06AB1234" }, status: "active", notifiedContacts: [{ name: "Mom", phoneNumber: "9899000011", relationship: "Parent" }] },
        { user_id: karan._id, location: { lat: 22.30, lng: 73.10, address: "Vadodara" }, status: "resolved", adminNotes: "Contacted user — false alarm, all safe.", resolvedAt: hrs(-12) },
    ]);
    console.log("🚨 SOS events created (2).");

    // ---------------- Withdrawal (driver payout request) ----------------
    await Withdrawal.create([
        { driver_id: aarav._id, amount: 120, method: "upi", upiId: "aarav@okhdfc", status: "Requested" },
    ]);
    console.log("🏧 Withdrawals created (1).");

    // ---------------- Dispute (linked to disputed payment) ----------------
    await Dispute.create([
        { payment_id: disputedPayment._id, ride_id: rideB._id, raisedBy: ananya._id, against: priya._id, reason: "driver_no_show", description: "Driver never arrived at the pickup point.", status: "open" },
    ]);
    console.log("⚠️  Disputes created (1).");

    // ---------------- Verification (approved for drivers + pending for review) ----------------
    const approvedVerif = (user, vehicle) => ({
        user_id: user._id, status: "approved", submittedAt: hrs(-220), reviewedAt: hrs(-210),
        drivingLicense: { url: "https://via.placeholder.com/600x380?text=Driving+License", fileName: "dl.jpg", uploadedAt: hrs(-220) },
        vehicles: [{ vehicle_id: vehicle._id, rc: { url: "https://via.placeholder.com/600x380?text=RC", fileName: "rc.jpg", uploadedAt: hrs(-220) }, photos: { front: { url: "https://via.placeholder.com/600x380?text=Front", uploadedAt: hrs(-220) }, side: { url: "https://via.placeholder.com/600x380?text=Side", uploadedAt: hrs(-220) }, rear: { url: "https://via.placeholder.com/600x380?text=Rear", uploadedAt: hrs(-220) } } }],
        ocrData: { dlNumber: vehicle.drivingLicense, dlName: user.name, processed: true },
        adminRemarks: "Documents verified.",
    });
    await Verification.create([
        approvedVerif(aarav, vAarav),
        approvedVerif(priya, vPriya),
        approvedVerif(rohan, vRohan),
        { user_id: meera._id, status: "pending", submittedAt: hrs(-10),
            drivingLicense: { url: "https://via.placeholder.com/600x380?text=Driving+License", fileName: "dl.jpg", uploadedAt: hrs(-10) },
            vehicles: [{ vehicle_id: vMeera._id, rc: { url: "https://via.placeholder.com/600x380?text=RC", fileName: "rc.jpg", uploadedAt: hrs(-10) }, photos: { front: { url: "https://via.placeholder.com/600x380?text=Front", uploadedAt: hrs(-10) }, side: { url: "https://via.placeholder.com/600x380?text=Side", uploadedAt: hrs(-10) }, rear: { url: "https://via.placeholder.com/600x380?text=Rear", uploadedAt: hrs(-10) } } }],
            ocrData: { dlNumber: "GJ0620230003456", dlName: "Meera Joshi", processed: false } },
    ]);
    console.log("🛡️  Verification submissions created (3 approved + 1 pending).");

    // ---------------- Emergency contacts ----------------
    await EmergencyContact.create([
        { user_id: sneha._id, name: "Sneha's Mother", phoneNumber: "9899000011", email: process.env.SUPPORT_EMAIL || "rmdm283@gmail.com", relationship: "Parent", priority: "primary" },
        { user_id: sneha._id, name: "Sneha's Friend", phoneNumber: "9899000012", relationship: "Friend", priority: "secondary" },
    ]);
    console.log("📇 Emergency contacts created (2).");

    // ---------------- Notifications ----------------
    await Notification.create([
        { user_id: karan._id, type: "booking", title: "Booking confirmed", message: "Your seat to Vadodara Railway Station is confirmed.", read: false, createdAt: hrs(-50) },
        { user_id: karan._id, type: "ride", title: "Ride completed", message: "Your ride with Aarav Shah is complete. Leave a review!", read: true, createdAt: hrs(-30) },
        { user_id: sneha._id, type: "system", title: "Support replied", message: "Support replied to your request \"How does escrow work?\".", read: false, link: { tab: "support" }, createdAt: hrs(-1) },
    ]);
    console.log("🔔 Notifications created (3).");

    // ---------------- Personalized Rides (Uber-style) + ledger + settlement ----------------
    const AHMAP = { address: "Ahmedabad Airport", lat: 23.0772, lng: 72.6347 };
    const place = (address, c) => ({ address, lat: c.lat, lng: c.lng });
    const pickupPU = place("Parul University, Vadodara", PU);

    const [prSearching, prAssigned, prStarted, prPaid1, prPaid2, prCancelled, prExpired] = await PersonalRideRequest.create([
        // Active — searching for a driver.
        { passenger_id: ananya._id, passengerName: ananya.name, pickup: pickupPU, destination: place("Ahmedabad", AHM), distanceKm: 92.4, durationMin: 110, vehicleType: "Car", estimatedFare: 1426, status: "SEARCHING", notifiedDriverIds: [aarav._id, priya._id], radiusKm: 10, expiresAt: hrs(0.1) },
        // Driver assigned — en route to pickup.
        { passenger_id: karan._id, passengerName: karan.name, pickup: pickupPU, destination: place("Vadodara Railway Station", VADSTN), distanceKm: 20.1, durationMin: 48, vehicleType: "Bike", estimatedFare: 161, status: "DRIVER_ASSIGNED", driver_id: rohan._id, driverName: rohan.name, vehicle_id: vRohan._id, assignedAt: hrs(-0.2), tracking: { state: "enroute_pickup" } },
        // On trip — OTP verified, in progress.
        { passenger_id: sneha._id, passengerName: sneha.name, pickup: pickupPU, destination: place("Surat", SRT), distanceKm: 149.0, durationMin: 180, vehicleType: "Car", estimatedFare: 2275, status: "RIDE_STARTED", driver_id: aarav._id, driverName: aarav.name, vehicle_id: vAarav._id, assignedAt: hrs(-1), reachedPickupAt: hrs(-0.8), startedAt: hrs(-0.7), otp: { code: "", verifiedAt: hrs(-0.7) }, tracking: { state: "in_progress" } },
        // Completed + paid (settled, part of a past settlement).
        { passenger_id: ananya._id, passengerName: ananya.name, pickup: pickupPU, destination: place("Vadodara Railway Station", VADSTN), distanceKm: 20.1, durationMin: 48, vehicleType: "Car", estimatedFare: 342, finalFare: 342, commission: 34, driverEarnings: 308, status: "PAYMENT_RECEIVED", driver_id: priya._id, driverName: priya.name, vehicle_id: vPriya._id, completedAt: hrs(-72), payment: { method: "upi", status: "received", paidAt: hrs(-72) } },
        // Completed + paid (pending this week's settlement).
        { passenger_id: karan._id, passengerName: karan.name, pickup: pickupPU, destination: place("Ahmedabad Airport", AHMAP), distanceKm: 95.0, durationMin: 115, vehicleType: "Car", estimatedFare: 1465, finalFare: 1465, commission: 147, driverEarnings: 1318, status: "PAYMENT_RECEIVED", driver_id: aarav._id, driverName: aarav.name, vehicle_id: vAarav._id, completedAt: hrs(-20), payment: { method: "upi", status: "received", paidAt: hrs(-20) } },
        // Cancelled by passenger.
        { passenger_id: sneha._id, passengerName: sneha.name, pickup: pickupPU, destination: place("Surat", SRT), distanceKm: 149.0, durationMin: 180, vehicleType: "Bike", estimatedFare: 1058, status: "CANCELLED", cancelledBy: "passenger", cancelReason: "Changed plans" },
        // Failed — no driver accepted in time.
        { passenger_id: karan._id, passengerName: karan.name, pickup: pickupPU, destination: place("Ahmedabad", AHM), distanceKm: 92.4, durationMin: 110, vehicleType: "Car", estimatedFare: 1426, status: "EXPIRED", notifiedDriverIds: [rohan._id], radiusKm: 10, expiresAt: hrs(-1) },
    ]);

    // Ledger entries for the paid rides.
    const [ledSettled, ledPending] = await DriverLedger.create([
        { driver_id: priya._id, ride_id: prPaid1._id, grossAmount: 342, commission: 34, netEarnings: 308, status: "settled" },
        { driver_id: aarav._id, ride_id: prPaid2._id, grossAmount: 1465, commission: 147, netEarnings: 1318, status: "pending" },
    ]);
    await PersonalRideRequest.updateOne({ _id: prPaid1._id }, { ledger_id: ledSettled._id });
    await PersonalRideRequest.updateOne({ _id: prPaid2._id }, { ledger_id: ledPending._id });

    // A past weekly settlement batch (Priya, already paid out).
    const lastFriday = new Date(now);
    lastFriday.setDate(lastFriday.getDate() - ((lastFriday.getDay() + 2) % 7 || 7));
    const settlement = await Settlement.create({
        driver_id: priya._id, batchId: `WK-${lastFriday.toISOString().slice(0, 10)}`,
        periodStart: new Date(lastFriday.getTime() - 7 * 86400000), periodEnd: lastFriday,
        rideCount: 1, totalGross: 342, totalCommission: 34, totalNet: 308,
        ledgerEntryIds: [ledSettled._id], upiId: "priya@okaxis", status: "settled",
        payoutRef: "SIMULATED", processedAt: lastFriday,
    });
    await DriverLedger.updateOne({ _id: ledSettled._id }, { settlement_id: settlement._id });
    console.log("🚕 Personalized rides created (7) + ledger (2) + settlement (1).");

    console.log("\n✅ Seed complete!");
    console.log("------------------------------------------------------");
    console.log("Login with any of these (password: " + PASSWORD + "):");
    console.log("  Driver (verified):    aarav.shah@paruluniversity.ac.in");
    console.log("  Driver (verified):    priya.patel@paruluniversity.ac.in");
    console.log("  Passenger:            karan.desai@paruluniversity.ac.in");
    console.log("  Passenger:            sneha.iyer@paruluniversity.ac.in");
    console.log("  Passenger:            ananya.nair@paruluniversity.ac.in");
    console.log("  Frozen account:       vikram.rao@paruluniversity.ac.in");
    console.log("  Pending verification: meera.joshi@paruluniversity.ac.in");
    console.log("------------------------------------------------------");

    await mongoose.disconnect();
    process.exit(0);
}

run().catch(async (err) => {
    console.error("❌ Seed failed:", err);
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    process.exit(1);
});
