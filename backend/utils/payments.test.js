const crypto = require("crypto");
const fc = require("fast-check");
const { verifyRazorpaySignature, computeBreakdown } = require("./payments");

// Helper: produce a valid Razorpay-style signature for given inputs.
const sign = (orderId, paymentId, secret) =>
    crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

describe("verifyRazorpaySignature", () => {
    const secret = "test_secret_key";

    it("accepts a correctly-signed payload", () => {
        const orderId = "order_ABC123";
        const paymentId = "pay_XYZ789";
        const signature = sign(orderId, paymentId, secret);
        expect(verifyRazorpaySignature(orderId, paymentId, signature, secret)).toBe(true);
    });

    it("rejects a tampered signature", () => {
        const orderId = "order_ABC123";
        const paymentId = "pay_XYZ789";
        const bad = sign(orderId, paymentId, secret).replace(/.$/, (c) => (c === "0" ? "1" : "0"));
        expect(verifyRazorpaySignature(orderId, paymentId, bad, secret)).toBe(false);
    });

    it("rejects when the secret is wrong (forged with a different key)", () => {
        const orderId = "order_ABC123";
        const paymentId = "pay_XYZ789";
        const forged = sign(orderId, paymentId, "attacker_secret");
        expect(verifyRazorpaySignature(orderId, paymentId, forged, secret)).toBe(false);
    });

    it("rejects when order or payment id is swapped", () => {
        const orderId = "order_ABC123";
        const paymentId = "pay_XYZ789";
        const signature = sign(orderId, paymentId, secret);
        // Same signature but ids swapped → must not validate.
        expect(verifyRazorpaySignature(paymentId, orderId, signature, secret)).toBe(false);
    });

    it("returns false for any missing input", () => {
        expect(verifyRazorpaySignature("", "p", "s", "k")).toBe(false);
        expect(verifyRazorpaySignature("o", "", "s", "k")).toBe(false);
        expect(verifyRazorpaySignature("o", "p", "", "k")).toBe(false);
        expect(verifyRazorpaySignature("o", "p", "s", "")).toBe(false);
    });

    // PROPERTY: a signature produced with the real secret ALWAYS verifies, and a
    // signature produced with any other secret NEVER verifies.
    it("property: correct secret verifies, any wrong secret fails", () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1 }), // orderId
                fc.string({ minLength: 1 }), // paymentId
                fc.string({ minLength: 1 }), // real secret
                fc.string({ minLength: 1 }), // other secret
                (orderId, paymentId, realSecret, otherSecret) => {
                    const good = sign(orderId, paymentId, realSecret);
                    expect(verifyRazorpaySignature(orderId, paymentId, good, realSecret)).toBe(true);

                    // Only assert the negative case when the secrets actually differ.
                    if (otherSecret !== realSecret) {
                        const forged = sign(orderId, paymentId, otherSecret);
                        expect(verifyRazorpaySignature(orderId, paymentId, forged, realSecret)).toBe(false);
                    }
                }
            ),
            { numRuns: 300 }
        );
    });

    // PROPERTY: flipping any character of a valid signature breaks verification.
    it("property: any single-character mutation of a valid signature is rejected", () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1 }),
                fc.string({ minLength: 1 }),
                fc.string({ minLength: 1 }),
                (orderId, paymentId, secret) => {
                    const good = sign(orderId, paymentId, secret);
                    const idx = 0;
                    const mutatedChar = good[idx] === "a" ? "b" : "a";
                    const mutated = mutatedChar + good.slice(1);
                    expect(verifyRazorpaySignature(orderId, paymentId, mutated, secret)).toBe(false);
                }
            ),
            { numRuns: 200 }
        );
    });
});

describe("computeBreakdown", () => {
    it("computes a simple fare with no commission/tax", () => {
        const b = computeBreakdown(100, 2, 0, 0);
        expect(b).toMatchObject({ perSeat: 100, seats: 2, fare: 200, platformFee: 0, tax: 0, total: 200, driverEarnings: 200 });
    });

    it("applies a 10% commission to the driver's earnings (₹100 → ₹90 / ₹10)", () => {
        const b = computeBreakdown(100, 1, 10, 0);
        expect(b.fare).toBe(100);
        expect(b.platformFee).toBe(10);
        expect(b.driverEarnings).toBe(90);
        expect(b.total).toBe(100); // passenger still pays the fare
    });

    it("defaults invalid seats to 1 and floors negatives to 0", () => {
        expect(computeBreakdown(50, 0, 0, 0).seats).toBe(1);
        expect(computeBreakdown(-50, 2, 0, 0).perSeat).toBe(0);
        expect(computeBreakdown(50, 2, -5, 0).platformFee).toBe(0);
    });

    // PROPERTY: invariants that must always hold for any fare/seats/commission.
    it("property: earnings + platformFee == fare, and total >= fare", () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 100000 }), // perSeat
                fc.integer({ min: 1, max: 4 }),       // seats
                fc.integer({ min: 0, max: 100 }),     // commissionPct
                fc.integer({ min: 0, max: 100 }),     // taxPct
                (perSeat, seats, commissionPct, taxPct) => {
                    const b = computeBreakdown(perSeat, seats, commissionPct, taxPct);
                    expect(b.fare).toBe(perSeat * seats);
                    // The driver earns the fare minus the platform's cut.
                    expect(b.driverEarnings + b.platformFee).toBe(b.fare);
                    // Driver never earns more than the fare or less than zero.
                    expect(b.driverEarnings).toBeGreaterThanOrEqual(0);
                    expect(b.driverEarnings).toBeLessThanOrEqual(b.fare);
                    // Passenger total is the fare plus (non-negative) tax.
                    expect(b.total).toBeGreaterThanOrEqual(b.fare);
                    // Commission never exceeds the fare.
                    expect(b.platformFee).toBeLessThanOrEqual(b.fare);
                }
            ),
            { numRuns: 500 }
        );
    });
});
