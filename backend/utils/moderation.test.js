import { describe, it, expect } from "vitest";
const { moderateMessage, maskProfanity, containsAbuse } = require("./moderation");

describe("moderateMessage", () => {
    it("redacts phone numbers and flags it", () => {
        const r = moderateMessage("ping me 9876543210");
        expect(r.redactedPhone).toBe(true);
        expect(r.text).toContain("[number hidden]");
    });

    it("masks profanity and flags it", () => {
        const r = moderateMessage("you are an asshole");
        expect(r.profane).toBe(true);
        expect(r.text).not.toContain("asshole");
        expect(r.text).toMatch(/a\*+/);
    });

    it("handles both phone + abuse together", () => {
        const r = moderateMessage("call 9876543210 you bastard");
        expect(r.redactedPhone).toBe(true);
        expect(r.profane).toBe(true);
        expect(r.changed).toBe(true);
    });

    it("leaves clean messages untouched", () => {
        const r = moderateMessage("See you at the main gate at 5, 2 seats booked");
        expect(r.changed).toBe(false);
        expect(r.text).toBe("See you at the main gate at 5, 2 seats booked");
    });
});

describe("containsAbuse", () => {
    it("detects abuse (and is not stateful across calls)", () => {
        expect(containsAbuse("this is bullshit")).toBe(true);
        expect(containsAbuse("this is bullshit")).toBe(true); // repeatable (global-regex lastIndex reset)
        expect(containsAbuse("have a great ride")).toBe(false);
        expect(containsAbuse("have a great ride")).toBe(false);
    });

    it("flags violent threats", () => {
        expect(containsAbuse("i will kill you")).toBe(true);
    });
});

describe("maskProfanity", () => {
    it("keeps first letter, asterisks the rest", () => {
        expect(maskProfanity("shit").text).toBe("s***");
    });
});
