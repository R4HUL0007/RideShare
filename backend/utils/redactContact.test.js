import { describe, it, expect } from "vitest";
const { redactPhoneNumbers } = require("./redactContact");

describe("redactPhoneNumbers", () => {
    it("redacts a plain 10-digit number", () => {
        const { text, redacted } = redactPhoneNumbers("call me on 9876543210 please");
        expect(redacted).toBe(true);
        expect(text).toContain("[number hidden]");
        expect(text).not.toContain("9876543210");
    });

    it("redacts numbers with +91, spaces and dashes", () => {
        expect(redactPhoneNumbers("+91 98765-43210").text).toBe("[number hidden]");
        expect(redactPhoneNumbers("my no is 98765 43210").redacted).toBe(true);
    });

    it("leaves short numbers (prices, seats, OTP-length) alone", () => {
        expect(redactPhoneNumbers("2 seats for 250 rupees").redacted).toBe(false);
        expect(redactPhoneNumbers("code 1234").redacted).toBe(false);
        expect(redactPhoneNumbers("meet at 5 pm, gate 3").redacted).toBe(false);
    });

    it("handles empty / non-string input safely", () => {
        expect(redactPhoneNumbers("").redacted).toBe(false);
        expect(redactPhoneNumbers(null).text).toBe(null);
    });

    it("redacts multiple numbers in one message", () => {
        const { text, redacted } = redactPhoneNumbers("either 9876543210 or 9123456780");
        expect(redacted).toBe(true);
        expect(text).not.toMatch(/\d{10}/);
    });
});
