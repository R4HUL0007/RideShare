const { connectTestDB, clearTestDB, disconnectTestDB } = require("../test/dbHelper");

process.env.RAZORPAY_KEY_ID = "rzp_test_key_id";
process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret_value";
process.env.JWT_SECRET = "test_jwt";
process.env.ESCROW_AUTO_RELEASE_HOURS = "24";

const Ride = require("../models/Ride");
const User = require("../models/User");
const Payment = require("../models/Payment");
const Dispute = require("../models/Dispute");
const paymentController = require("../controllers/paymentController");
const { runAutoReleaseSweep } = require("../jobs/autoReleaseEscrow");

const mockRes = () => {
    const res = {};
    res.statusCode = 200;
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
};
const appStub = { get: () => undefined };

let driver, passenger, ride;

beforeAll(async () => { await connectTestDB(); });
afterAll(async () => { await disconnectTestDB(); });

beforeEach(async () => {
    await clearTestDB();
    driver = await User.create({
        name: "Dee", username: "dee", email: "dee@paruluniversity.ac.in",
        password: "x", phoneNumber: "9000000001", role: "Student", gender: "Male", isVerified: true,
    });
    passenger = await User.create({
        name: "Pat", username: "pat", email: "pat@paruluniversity.ac.in",
        password: "x", phoneNumber: "9000000002", role: "Student", gender: "Female", isVerified: true,
    });
    ride = await Ride.create({
        user_id: driver._id, role: "Student", gender_preference: "Any",
        source: "A", destination: "B", timing: new Date(),
        status: "Completed", seatsAvailable: 2, pricePerPerson: 100,
        passengers: [{ user_id: passenger._id, seats: 1 }],
    });
});

// A held payment for a completed-but-not-yet-armed booking.
const makeHeldPayment = () =>
    Payment.create({
        user_id: passenger._id, driver_id: driver._id, ride_id: ride._id,
        seats: 1, order_id: `o_${Date.now()}_${Math.random()}`, payment_id: "pay_1",
        amount: 90, driverEarnings: 90, status: "Successful", escrowStatus: "held",
        amountBreakdown: { fare: 100, platformFee: 10, tax: 0 },
    });

describe("armEscrowForRide", () => {
    it("moves held → awaiting_completion and sets the auto-release clock", async () => {
        const p = await makeHeldPayment();
        await paymentController.armEscrowForRide(ride._id, {});
        const updated = await Payment.findById(p._id);
        expect(updated.escrowStatus).toBe("awaiting_completion");
        expect(updated.completedAt).toBeTruthy();
        expect(updated.autoReleaseAt).toBeTruthy();
        // ~24h ahead.
        const deltaH = (new Date(updated.autoReleaseAt) - new Date(updated.completedAt)) / 3.6e6;
        expect(Math.round(deltaH)).toBe(24);
    });
});

describe("confirmCompletion (passenger releases escrow)", () => {
    it("releases to the driver when the payer confirms", async () => {
        const p = await makeHeldPayment();
        await paymentController.armEscrowForRide(ride._id, {});

        const req = { user: { id: passenger._id.toString(), name: "Pat" }, app: appStub, params: { id: p._id.toString() } };
        const res = mockRes();
        await paymentController.confirmCompletion(req, res);

        expect(res.statusCode).toBe(200);
        const updated = await Payment.findById(p._id);
        expect(updated.escrowStatus).toBe("released");
        expect(updated.releaseType).toBe("passenger_confirmed");
        expect(updated.escrowReleasedAt).toBeTruthy();
    });

    it("does not let a non-payer release", async () => {
        const p = await makeHeldPayment();
        await paymentController.armEscrowForRide(ride._id, {});
        const req = { user: { id: driver._id.toString(), name: "Dee" }, app: appStub, params: { id: p._id.toString() } };
        const res = mockRes();
        await paymentController.confirmCompletion(req, res);
        expect(res.statusCode).toBe(403);
        const updated = await Payment.findById(p._id);
        expect(updated.escrowStatus).toBe("awaiting_completion");
    });
});

describe("auto-release sweep (passenger silence does NOT block payout)", () => {
    it("releases an awaiting payment once its window has passed", async () => {
        const p = await makeHeldPayment();
        await paymentController.armEscrowForRide(ride._id, {});
        // Force the clock into the past to simulate 24h of silence.
        await Payment.updateOne({ _id: p._id }, { $set: { autoReleaseAt: new Date(Date.now() - 1000) } });

        const releasedCount = await runAutoReleaseSweep({});
        expect(releasedCount).toBe(1);

        const updated = await Payment.findById(p._id);
        expect(updated.escrowStatus).toBe("released");
        expect(updated.releaseType).toBe("auto");
    });

    it("does NOT auto-release before the window", async () => {
        const p = await makeHeldPayment();
        await paymentController.armEscrowForRide(ride._id, {}); // 24h in the future
        const releasedCount = await runAutoReleaseSweep({});
        expect(releasedCount).toBe(0);
        const updated = await Payment.findById(p._id);
        expect(updated.escrowStatus).toBe("awaiting_completion");
    });
});

describe("disputes freeze escrow", () => {
    it("freezes the payment and a disputed payment is skipped by auto-release", async () => {
        const p = await makeHeldPayment();
        await paymentController.armEscrowForRide(ride._id, {});

        // Passenger raises a dispute.
        const req = {
            user: { id: passenger._id.toString(), name: "Pat" }, app: appStub,
            params: { id: p._id.toString() },
            body: { reason: "driver_no_show", description: "Driver never came" },
        };
        const res = mockRes();
        await paymentController.raiseDispute(req, res);
        expect(res.statusCode).toBe(201);

        const updated = await Payment.findById(p._id);
        expect(updated.escrowStatus).toBe("disputed");

        const dispute = await Dispute.findOne({ payment_id: p._id });
        expect(dispute).toBeTruthy();
        expect(dispute.status).toBe("open");

        // Even past the window, a disputed payment must NOT auto-release.
        await Payment.updateOne({ _id: p._id }, { $set: { autoReleaseAt: new Date(Date.now() - 1000) } });
        const releasedCount = await runAutoReleaseSweep({});
        expect(releasedCount).toBe(0);
        const stillDisputed = await Payment.findById(p._id);
        expect(stillDisputed.escrowStatus).toBe("disputed");

        // Passenger's dispute counter incremented.
        const pax = await User.findById(passenger._id);
        expect(pax.disputeStats.total).toBe(1);
    });

    it("rejects a dispute from a non-payer", async () => {
        const p = await makeHeldPayment();
        await paymentController.armEscrowForRide(ride._id, {});
        const req = {
            user: { id: driver._id.toString(), name: "Dee" }, app: appStub,
            params: { id: p._id.toString() }, body: { reason: "other" },
        };
        const res = mockRes();
        await paymentController.raiseDispute(req, res);
        expect(res.statusCode).toBe(403);
    });
});
