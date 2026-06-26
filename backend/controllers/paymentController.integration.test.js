const crypto = require("crypto");
const { connectTestDB, clearTestDB, disconnectTestDB } = require("../test/dbHelper");

// Integration test for the UNIFIED pay-AFTER-completion flow against an in-memory
// Mongo. The passenger is already booked (seat reserved at booking, fare locked)
// and the ride is Completed; verifyPayment then marks the payment Successful,
// starts escrow (awaiting_completion + 24h auto-release), and flags the booking
// paid — WITHOUT touching seats (they were reserved at booking time).
//
// We set Razorpay env BEFORE requiring the controller so config picks it up.
// The signature check uses the REAL secret, so this proves payment is only
// recorded after a valid signature.

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
    // Pay-after-completion: the passenger is ALREADY booked (2 seats reserved,
    // fare locked) and the ride is COMPLETED — ready to be paid.
    ride = await Ride.create({
        user_id: driver._id, role: "Student", gender_preference: "Any",
        source: "A", destination: "B", timing: new Date(Date.now() - 3600_000),
        status: "Completed", seatsAvailable: 1, pricePerPerson: 100,
        passengers: [{
            user_id: passenger._id, seats: 2, bookedAt: new Date(),
            fareAmount: 200, paymentStatus: "unpaid",
        }],
    });
});

describe("verifyPayment → post-completion payment + escrow", () => {
    // Build a Pending payment row the way createOrder would (post-completion).
    const makePendingPayment = async (orderId, seats = 2) =>
        Payment.create({
            user_id: passenger._id, driver_id: driver._id, ride_id: ride._id,
            seats, order_id: orderId, amount: 100 * seats, currency: "INR",
            amountBreakdown: { fare: 100 * seats, platformFee: 0, tax: 0 },
            driverEarnings: 100 * seats, status: "Pending",
            routeSnapshot: { source: ride.source, destination: ride.destination, timing: ride.timing },
        });

    it("records payment + starts escrow on a VALID signature (seats unchanged)", async () => {
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

        // Seats are NOT changed by payment (reserved at booking). The booking is
        // flagged paid, the payment is Successful, and escrow is armed.
        expect(updatedRide.seatsAvailable).toBe(1);
        expect(updatedRide.passengers).toHaveLength(1);
        expect(updatedRide.passengers[0].paymentStatus).toBe("paid");
        expect(updatedPayment.status).toBe("Successful");
        expect(updatedPayment.payment_id).toBe(paymentId);
        expect(updatedPayment.escrowStatus).toBe("awaiting_completion");
        expect(updatedPayment.autoReleaseAt).toBeTruthy();
    });

    it("does NOT record payment on an INVALID signature (booking stays unpaid)", async () => {
        const orderId = "order_bad_1";
        const paymentId = "pay_bad_1";
        await makePendingPayment(orderId, 2);

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

        expect(updatedRide.passengers[0].paymentStatus).toBe("unpaid");
        expect(updatedPayment.status).toBe("Failed");
        expect(updatedPayment.escrowStatus).toBe("none");
    });

    it("is idempotent — re-verifying a Successful payment is a no-op", async () => {
        const orderId = "order_idem_1";
        const paymentId = "pay_idem_1";
        await makePendingPayment(orderId, 2);

        const makeReq = () => ({
            user: { id: passenger._id.toString(), name: passenger.name },
            app: appStub,
            body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sign(orderId, paymentId) },
        });

        await paymentController.verifyPayment(makeReq(), mockRes());
        await paymentController.verifyPayment(makeReq(), mockRes()); // second time

        const updatedRide = await Ride.findById(ride._id);
        const payments = await Payment.find({ order_id: orderId });
        expect(payments).toHaveLength(1);
        expect(payments[0].status).toBe("Successful");
        expect(updatedRide.passengers[0].paymentStatus).toBe("paid");
    });

    it("rejects a user verifying someone else's payment", async () => {
        const orderId = "order_owner_1";
        const paymentId = "pay_owner_1";
        await makePendingPayment(orderId, 2);

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
        const updatedPayment = await Payment.findOne({ order_id: orderId });
        expect(updatedPayment.status).toBe("Pending");
    });
});
