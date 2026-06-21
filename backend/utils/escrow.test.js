const fc = require("fast-check");
const {
    computeAutoReleaseAt,
    isEligibleForAutoRelease,
    canPassengerRelease,
    summarizeDriverBalances,
} = require("./escrow");

describe("computeAutoReleaseAt", () => {
    it("adds the given hours to the base time", () => {
        const base = new Date("2025-01-01T00:00:00Z");
        const at = computeAutoReleaseAt(base, 24);
        expect(at.toISOString()).toBe("2025-01-02T00:00:00.000Z");
    });
});

describe("isEligibleForAutoRelease", () => {
    const base = {
        status: "Successful",
        escrowStatus: "awaiting_completion",
        autoReleaseAt: new Date(Date.now() - 1000), // already passed
    };

    it("releases a paid, awaiting payment whose window has passed", () => {
        expect(isEligibleForAutoRelease(base)).toBe(true);
    });

    it("does NOT release before the window passes", () => {
        expect(isEligibleForAutoRelease({ ...base, autoReleaseAt: new Date(Date.now() + 60000) })).toBe(false);
    });

    it("never releases a DISPUTED payment (silence-safe, dispute-safe)", () => {
        expect(isEligibleForAutoRelease({ ...base, escrowStatus: "disputed" })).toBe(false);
    });

    it("never releases an already-released or refunded payment", () => {
        expect(isEligibleForAutoRelease({ ...base, escrowStatus: "released" })).toBe(false);
        expect(isEligibleForAutoRelease({ ...base, escrowStatus: "refunded" })).toBe(false);
    });

    it("never releases an unpaid payment", () => {
        expect(isEligibleForAutoRelease({ ...base, status: "Pending" })).toBe(false);
    });
});

describe("canPassengerRelease", () => {
    const payment = { user_id: "user1", status: "Successful", escrowStatus: "awaiting_completion" };

    it("allows the payer to release a held/awaiting payment", () => {
        expect(canPassengerRelease(payment, "user1")).toBe(true);
        expect(canPassengerRelease({ ...payment, escrowStatus: "held" }, "user1")).toBe(true);
    });

    it("rejects a non-payer", () => {
        expect(canPassengerRelease(payment, "someoneElse")).toBe(false);
    });

    it("rejects when already released/refunded/disputed", () => {
        expect(canPassengerRelease({ ...payment, escrowStatus: "released" }, "user1")).toBe(false);
        expect(canPassengerRelease({ ...payment, escrowStatus: "refunded" }, "user1")).toBe(false);
        expect(canPassengerRelease({ ...payment, escrowStatus: "disputed" }, "user1")).toBe(false);
    });
});

describe("summarizeDriverBalances", () => {
    it("buckets earnings by escrow status", () => {
        const payments = [
            { status: "Successful", driverEarnings: 100, escrowStatus: "held" },
            { status: "Successful", driverEarnings: 50, escrowStatus: "awaiting_completion" },
            { status: "Successful", driverEarnings: 200, escrowStatus: "released" },
            { status: "Successful", driverEarnings: 75, escrowStatus: "released", withdrawal_id: "w1" },
            { status: "Successful", driverEarnings: 30, escrowStatus: "disputed" },
            { status: "Failed", driverEarnings: 999, escrowStatus: "held" }, // ignored (not paid)
        ];
        const b = summarizeDriverBalances(payments);
        expect(b.escrowPending).toBe(150); // 100 + 50
        expect(b.disputed).toBe(30);
        expect(b.released).toBe(275);      // 200 + 75
        expect(b.withdrawn).toBe(75);      // the one tied to a withdrawal
        expect(b.available).toBe(200);     // released - withdrawn
        expect(b.total).toBe(425);         // released + escrowPending
    });

    // PROPERTY: available is never negative and never exceeds released.
    it("property: 0 <= available <= released for any mix", () => {
        const paymentArb = fc.record({
            status: fc.constant("Successful"),
            driverEarnings: fc.integer({ min: 0, max: 10000 }),
            escrowStatus: fc.constantFrom("held", "awaiting_completion", "released", "disputed"),
            withdrawal_id: fc.option(fc.constant("w"), { nil: null }),
        });
        fc.assert(
            fc.property(fc.array(paymentArb, { maxLength: 50 }), (payments) => {
                const b = summarizeDriverBalances(payments);
                expect(b.available).toBeGreaterThanOrEqual(0);
                expect(b.available).toBeLessThanOrEqual(b.released);
                expect(b.escrowPending).toBeGreaterThanOrEqual(0);
            }),
            { numRuns: 300 }
        );
    });
});
