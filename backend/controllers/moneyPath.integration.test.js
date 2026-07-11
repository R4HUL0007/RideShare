/**
 * FULL-STATE money-path integration test.
 *
 * Instead of asserting only HTTP status codes, this drives the real controllers
 * across the whole money path and verifies the ENTIRE system state after each
 * step — the class of bug where one collection updates but another silently
 * doesn't:
 *
 *   book (pre-seeded) → verifyPayment → confirmCompletion (release)
 *
 * After each step we assert:
 *   • Ride.status / booking (passenger subdoc) state
 *   • Payment.status + escrowStatus + timestamps
 *   • Driver earnings summary (escrowPending → available)
 *   • Notification documents created (passenger + driver)
 *   • VerificationLog audit entry (drop-off confirmation)
 *   • Socket.IO notification:new events emitted to the right rooms
 */
const crypto = require("crypto");
const { connectTestDB, clearTestDB, disconnectTestDB } = require("../test/dbHelper");

const TEST_SECRET = "rzp_test_secret_value";
process.env.RAZORPAY_KEY_ID = "rzp_test_key_id";
process.env.RAZORPAY_KEY_SECRET = TEST_SECRET;
process.env.JWT_SECRET = "test_jwt";
process.env.ESCROW_AUTO_RELEASE_HOURS = "24";
process.env.PLATFORM_COMMISSION_PERCENT = "10";

const Ride = require("../models/Ride");
const User = require("../models/User");
const Payment = require("../models/Payment");
const Notification = require("../models/Notification");
const VerificationLog = require("../models/VerificationLog");
const paymentController = require("../controllers/paymentController");

const mockRes = () => {
    const res = {};
    res.statusCode = 200;
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
};

const sign = (orderId, paymentId) =>
    crypto.createHmac("sha256", TEST_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

// Socket.IO spy: records every emit as { room, event, payload }.
const makeIo = (emits) => ({
    to: (room) => ({ emit: (event, payload) => emits.push({ room: String(room), event, payload }) }),
});
const emittedTo = (emits, room, event) =>
    emits.some((e) => e.room === String(room) && e.event === event);

let driver, passenger, ride, emits, users, appStub;

beforeAll(async () => { await connectTestDB(); });
afterAll(async () => { await disconnectTestDB(); });

beforeEach(async () => {
    await clearTestDB();
    driver = await User.create({
        name: "Dee Driver", username: "dee", email: "dee@paruluniversity.ac.in",
        password: "x", phoneNumber: "9000000001", role: "Student", gender: "Male", isVerified: true,
    });
    passenger = await User.create({
        name: "Pat Passenger", username: "pat", email: "pat@paruluniversity.ac.in",
        password: "x", phoneNumber: "9000000002", role: "Student", gender: "Female", isVerified: true,
    });
    // Passenger already booked (2 seats, fare locked), ride COMPLETED — ready to pay.
    ride = await Ride.create({
        user_id: driver._id, role: "Student", gender_preference: "Any",
        source: "A", destination: "B", timing: new Date(Date.now() - 3600_000),
        status: "Completed", seatsAvailable: 1, pricePerPerson: 100,
        passengers: [{ user_id: passenger._id, seats: 2, bookedAt: new Date(), fareAmount: 200, paymentStatus: "unpaid" }],
    });
    emits = [];
    users = { [driver._id.toString()]: "sock_d", [passenger._id.toString()]: "sock_p" };
    appStub = { get: (k) => (k === "io" ? makeIo(emits) : k === "users" ? users : undefined) };
});

// A Pending payment row exactly as createOrder produces it (10% commission).
const makePendingPayment = (orderId) =>
    Payment.create({
        user_id: passenger._id, driver_id: driver._id, ride_id: ride._id,
        seats: 2, order_id: orderId, amount: 200, currency: "INR",
        amountBreakdown: { fare: 200, platformFee: 20, tax: 0 },
        driverEarnings: 180, status: "Pending",
        routeSnapshot: { source: ride.source, destination: ride.destination, timing: ride.timing },
    });

describe("FULL money-path state verification", () => {
    it("verifyPayment → confirmCompletion leaves every collection + socket consistent", async () => {
        const orderId = "order_money_1";
        const paymentId = "pay_money_1";
        await makePendingPayment(orderId);

        // ---------- STEP 1: verifyPayment (valid signature) ----------
        const verifyReq = {
            user: { id: passenger._id.toString(), name: passenger.name },
            app: appStub,
            body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sign(orderId, paymentId) },
        };
        const verifyRes = mockRes();
        await paymentController.verifyPayment(verifyReq, verifyRes);
        expect(verifyRes.statusCode).toBe(200);

        // Payment state
        let payment = await Payment.findOne({ order_id: orderId });
        expect(payment.status).toBe("Successful");
        expect(payment.payment_id).toBe(paymentId);
        expect(payment.escrowStatus).toBe("awaiting_completion");
        expect(payment.autoReleaseAt).toBeTruthy();
        expect(payment.driverEarnings).toBe(180);

        // Ride / booking state (ride stays Completed; booking flagged paid; seats untouched)
        let updatedRide = await Ride.findById(ride._id);
        expect(updatedRide.status).toBe("Completed");
        expect(updatedRide.seatsAvailable).toBe(1);
        expect(updatedRide.passengers[0].paymentStatus).toBe("paid");

        // Notifications created for BOTH parties
        const paxNotifs = await Notification.find({ user_id: passenger._id });
        const drvNotifs = await Notification.find({ user_id: driver._id });
        expect(paxNotifs.some((n) => /payment successful/i.test(n.title + n.message))).toBe(true);
        expect(drvNotifs.some((n) => /payment received/i.test(n.title + n.message))).toBe(true);

        // Socket: real-time notification:new to both users
        expect(emittedTo(emits, passenger._id, "notification:new")).toBe(true);
        expect(emittedTo(emits, driver._id, "notification:new")).toBe(true);

        // Driver earnings summary: fare is now pending in escrow, nothing available yet
        const earnReq1 = { user: { id: driver._id.toString() }, app: appStub };
        const earnRes1 = mockRes();
        await paymentController.getEarnings(earnReq1, earnRes1);
        expect(earnRes1.body.summary.escrowPending).toBe(180);
        expect(earnRes1.body.summary.available).toBe(0);

        // ---------- STEP 2: confirmCompletion (passenger releases escrow) ----------
        emits = [];
        appStub = { get: (k) => (k === "io" ? makeIo(emits) : k === "users" ? users : undefined) };
        const releaseReq = {
            user: { id: passenger._id.toString(), name: passenger.name },
            app: appStub,
            params: { id: payment._id.toString() },
        };
        const releaseRes = mockRes();
        await paymentController.confirmCompletion(releaseReq, releaseRes);
        expect(releaseRes.statusCode).toBe(200);

        // Payment: released
        payment = await Payment.findById(payment._id);
        expect(payment.escrowStatus).toBe("released");
        expect(payment.releaseType).toBe("passenger_confirmed");
        expect(payment.escrowReleasedAt).toBeTruthy();

        // Booking: drop-off confirmed
        updatedRide = await Ride.findById(ride._id);
        expect(updatedRide.passengers[0].dropOffConfirmed).toBe(true);

        // Audit trail: VerificationLog dropoff_confirmed
        const auditLog = await VerificationLog.findOne({ ride_id: ride._id, event: "dropoff_confirmed" });
        expect(auditLog).toBeTruthy();

        // Notifications: driver "Escrow released" + passenger "Thanks for confirming"
        const drvNotifs2 = await Notification.find({ user_id: driver._id });
        const paxNotifs2 = await Notification.find({ user_id: passenger._id });
        expect(drvNotifs2.some((n) => /escrow released/i.test(n.title + n.message))).toBe(true);
        expect(paxNotifs2.some((n) => /thanks for confirming|released to your driver/i.test(n.title + n.message))).toBe(true);

        // Socket: release notification emitted to the driver
        expect(emittedTo(emits, driver._id, "notification:new")).toBe(true);

        // Driver earnings summary: now available (released), nothing pending
        const earnReq2 = { user: { id: driver._id.toString() }, app: appStub };
        const earnRes2 = mockRes();
        await paymentController.getEarnings(earnReq2, earnRes2);
        expect(earnRes2.body.summary.available).toBe(180);
        expect(earnRes2.body.summary.released).toBe(180);
        expect(earnRes2.body.summary.escrowPending).toBe(0);
    });

    it("double-release is prevented (idempotent escrow)", async () => {
        const orderId = "order_money_2";
        const paymentId = "pay_money_2";
        await makePendingPayment(orderId);

        await paymentController.verifyPayment({
            user: { id: passenger._id.toString(), name: passenger.name }, app: appStub,
            body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sign(orderId, paymentId) },
        }, mockRes());

        const payment = await Payment.findOne({ order_id: orderId });
        const release = () => paymentController.confirmCompletion({
            user: { id: passenger._id.toString(), name: passenger.name }, app: appStub,
            params: { id: payment._id.toString() },
        }, mockRes());

        await release();
        await release(); // second release must be a no-op

        const after = await Payment.findById(payment._id);
        expect(after.escrowStatus).toBe("released");
        // Earnings must not double-count.
        const earnRes = mockRes();
        await paymentController.getEarnings({ user: { id: driver._id.toString() }, app: appStub }, earnRes);
        expect(earnRes.body.summary.available).toBe(180);
    });
});
