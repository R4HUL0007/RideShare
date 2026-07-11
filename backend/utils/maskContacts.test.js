import { describe, it, expect } from "vitest";
const { maskRideContacts } = require("./maskContacts");

// Build a fresh ride each time (the helper mutates its input).
const makeRide = (over = {}) => ({
    _id: "ride1",
    status: "Booked",
    user_id: { _id: "driver1", name: "Dee", phoneNumber: "9000000001" },
    passengers: [
        { user_id: { _id: "pax1", name: "Pat", phoneNumber: "9000000002" } },
        { user_id: { _id: "pax2", name: "Sam", phoneNumber: "9000000003" } },
    ],
    ...over,
});

describe("maskRideContacts", () => {
    it("reveals the driver's number to a booked passenger", () => {
        const r = maskRideContacts(makeRide(), "pax1");
        expect(r.user_id.phoneNumber).toBe("9000000001");
        expect(r.user_id.contactLocked).toBeUndefined();
    });

    it("hides other passengers' numbers from a passenger", () => {
        const r = maskRideContacts(makeRide(), "pax1");
        const self = r.passengers.find((p) => p.user_id._id === "pax1");
        const other = r.passengers.find((p) => p.user_id._id === "pax2");
        expect(self.user_id.phoneNumber).toBe("9000000002"); // own number stays
        expect(other.user_id.phoneNumber).toBeNull();
        expect(other.user_id.contactLocked).toBe(true);
    });

    it("reveals all passengers to the driver, keeps driver's own number", () => {
        const r = maskRideContacts(makeRide(), "driver1");
        expect(r.user_id.phoneNumber).toBe("9000000001");
        expect(r.passengers[0].user_id.phoneNumber).toBe("9000000002");
        expect(r.passengers[1].user_id.phoneNumber).toBe("9000000003");
    });

    it("hides everything from a stranger (browsing)", () => {
        const r = maskRideContacts(makeRide(), "stranger");
        expect(r.user_id.phoneNumber).toBeNull();
        expect(r.user_id.contactLocked).toBe(true);
        expect(r.passengers[0].user_id.phoneNumber).toBeNull();
        expect(r.passengers[1].user_id.phoneNumber).toBeNull();
    });

    it("never reveals numbers on a cancelled ride", () => {
        const r = maskRideContacts(makeRide({ status: "Cancelled" }), "pax1");
        expect(r.user_id.phoneNumber).toBeNull();
        expect(r.user_id.contactLocked).toBe(true);
    });
});
