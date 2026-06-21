// Smoke test for the in-memory MongoDB test infrastructure.
// Confirms the test runner is wired up and that the dbHelper can boot an
// in-memory MongoDB, connect Mongoose, clear data, and disconnect cleanly.
const mongoose = require("mongoose");
const {
    connectTestDB,
    clearTestDB,
    disconnectTestDB,
} = require("./dbHelper");

describe("test infrastructure (dbHelper)", () => {
    beforeAll(async () => {
        await connectTestDB();
    });

    afterEach(async () => {
        await clearTestDB();
    });

    afterAll(async () => {
        await disconnectTestDB();
    });

    it("connects Mongoose to the in-memory MongoDB", () => {
        // readyState 1 === connected
        expect(mongoose.connection.readyState).toBe(1);
    });

    it("persists and reads back a document, then clears it", async () => {
        const Widget = mongoose.model(
            "Widget",
            new mongoose.Schema({ name: String })
        );

        await Widget.create({ name: "alpha" });
        expect(await Widget.countDocuments()).toBe(1);

        await clearTestDB();
        expect(await Widget.countDocuments()).toBe(0);
    });
});
