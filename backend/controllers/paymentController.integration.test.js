const crypto = require("crypto");
const { connectTestDB, clearTestDB, disconnectTestDB } = require("../test/dbHelper");

// Integration test for the payment verify→book flow against an in-memory Mongo.
// We set Razorpay env BEFORE requiring the controller so config picks it up,
// and we stub the Razorpay order creation (no network). The signature check
// uses the REAL secret, so this proves bookings only confirm after a valid
// signature.

const TEST_SECRET = "rzp_test_secret_value";
process.env.RAZORPAY_KEY_ID = "rzp_test_key_id";
process.env.RAZORPAY_KEY_SECRET = TEST_SECRET;
process.env.JWT_SECRET = "test_jwt";

const Ride = require("../models/Ride");
const User = require("../models/User");
const Payment = require("../models/Payment");
const paymentController = require("../controllers/paymentController");

// Minimal Express-style res mock capturing status + json.
const mockRes = () => {
    const res = {};
    res.statusCode = 200;
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
};

// req.app.get("io"/"users") stubs (no sockets in tests).
const appStub = { get: () => undefined };

const sign = (orderId, paymentId) =>
    crypto.createHmac("sha256", TEST_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

let driver, passenger, ride;

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
    ride = await Ride.create({
        user_id: driver._id, role: "Student", gender_preference: "Any",
        source: "A", destination: "B", timing: new Date(Date.now() + 3600_000),
        status: "Available", seatsAvailable: 3, pricePerPerson: 100,
    });
});

describe("verifyPayment → booking confirmation", () => {
    // Build a Pending payment row the way createOrder would.
    const makePendingPayment = async (orderId, seats = 1) =>
        Payment.create({
            user_id: passenger._id, driver_id: driver._id, ride_id: ride._id,
            seats, order_id: orderId, amount: 100 * seats, currency: "INR",
            amountBreakdown: { fare: 100 * seats, platformFee: 0, tax: 0 },
            driverEarnings: 100 * seats, status: "Pending",
            routeSnapshot: { source: ride.source, destination: ride.destination, timing: ride.timing },
        });

    it("confirms the booking and reduces seats on a VALID signature", async () => {
        const orderId = "order_valid_1";
        const paymentId = "pay_valid_1";
        await makePendingPayment(orderId, 2);

        const req = {
            user: { id: passenger._id.toString(), name: passenger.name },
            app: appStub,
            body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sign(orderId, paymentId) },
        };
        const res = mockRes();
        await paymentController.verifyPayment(req, res);

        expect(res.statusCode).toBe(200);

        const updatedRide = await Ride.findById(ride._id);
        const updatedPayment = await Payment.findOne({ order_id: orderId });

        // Seats reduced (3 → 1), passenger added, payment marked Successful.
        expect(updatedRide.seatsAvailable).toBe(1);
        expect(updatedRide.passengers).toHaveLength(1);
        expect(updatedRide.passengers[0].user_id.toString()).toBe(passenger._id.toString());
        expect(updatedRide.passengers[0].seats).toBe(2);
        expect(updatedPayment.status).toBe("Successful");
        expect(updatedPayment.payment_id).toBe(paymentId);
    });

    it("does NOT confirm the booking on an INVALID signature (seats untouched)", async () => {
        const orderId = "order_bad_1";
        const paymentId = "pay_bad_1";
        await makePendingPayment(orderId, 1);

        const req = {
            user: { id: passenger._id.toString(), name: passenger.name },
            app: appStub,
            body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: "deadbeef_not_valid" },
        };
        const res = mockRes();
        await paymentController.verifyPayment(req, res);

        expect(res.statusCode).toBe(400);

        const updatedRide = await Ride.findById(ride._id);
        const updatedPayment = await Payment.findOne({ order_id: orderId });

        // No seats reserved, no passenger, payment marked Failed.
        expect(updatedRide.seatsAvailable).toBe(3);
        expect(updatedRide.passengers).toHaveLength(0);
        expect(updatedPayment.status).toBe("Failed");
    });

    it("is idempotent — re-verifying a Successful payment does not double-book", async () => {
        const orderId = "order_idem_1";
        const paymentId = "pay_idem_1";
        await makePendingPayment(orderId, 1);

        const makeReq = () => ({
            user: { id: passenger._id.toString(), name: passenger.name },
            app: appStub,
            body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sign(orderId, paymentId) },
        });

        await paymentController.verifyPayment(makeReq(), mockRes());
        await paymentController.verifyPayment(makeReq(), mockRes()); // second time

        const updatedRide = await Ride.findById(ride._id);
        // Only one seat consumed despite two verify calls.
        expect(updatedRide.seatsAvailable).toBe(2);
        expect(updatedRide.passengers).toHaveLength(1);
    });

    it("rejects a user verifying someone else's payment", async () => {
        const orderId = "order_owner_1";
        const paymentId = "pay_owner_1";
        await makePendingPayment(orderId, 1);

        const stranger = await User.create({
            name: "Stranger", username: "stx", email: "stx@paruluniversity.ac.in",
            password: "x", phoneNumber: "9000000009", role: "Student", gender: "Male", isVerified: true,
        });

        const req = {
            user: { id: stranger._id.toString(), name: stranger.name },
            app: appStub,
            body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sign(orderId, paymentId) },
        };
        const res = mockRes();
        await paymentController.verifyPayment(req, res);

        expect(res.statusCode).toBe(403);
        const updatedRide = await Ride.findById(ride._id);
        expect(updatedRide.passengers).toHaveLength(0);
    });
});
