// Persistence + behavior tests for the Recent Location Searches controller.
//
// Exercises the controller functions directly with mock req/res (the same
// pattern as other backend tests: in-memory Mongo + Vitest globals). Covers:
//   R1 capture-on-valid-select / ignore-invalid
//   R2 cap-to-6 + newest-first ordering
//   R3 de-dup (by placeId, and by label when no placeId) + bump-to-top
//   R5 per-user scoping (privacy)
//   R6 remove-one + clear-all
//
// Backend is CommonJS; uses Vitest globals + mongodb-memory-server.

const mongoose = require("mongoose");
const RecentSearch = require("../models/RecentSearch");
const { list, add, removeOne, clearAll } = require("./recentSearchController");
const { connect, clearDatabase, closeDatabase } = require("../test/setupDb");

beforeAll(connect);
afterEach(clearDatabase);
afterAll(closeDatabase);

// Minimal Express res double.
const mkRes = () => {
    const res = {};
    res.statusCode = null;
    res.body = null;
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
};

const call = async (fn, { user, body = {}, params = {} }) => {
    const res = mkRes();
    await fn({ user, body, params }, res);
    return res;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mkUser = () => ({ _id: new mongoose.Types.ObjectId() });

describe("recentSearchController", () => {
    it("R1: records a valid selection and lists it", async () => {
        const user = mkUser();
        await call(add, { user, body: { label: "Parul University", placeId: "p1", lat: 22.28, lng: 73.36 } });

        const res = await call(list, { user });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].label).toBe("Parul University");
        expect(res.body[0].coords).toEqual({ lat: 22.28, lng: 73.36 });
    });

    it("R1: ignores selections without usable coordinates", async () => {
        const user = mkUser();
        await call(add, { user, body: { label: "No coords", placeId: "x" } });
        await call(add, { user, body: { label: "", lat: 1, lng: 2 } });
        await call(add, { user, body: { label: "NaN", lat: "abc", lng: "def" } });

        const res = await call(list, { user });
        expect(res.body).toHaveLength(0);
    });

    it("R3: de-dups by placeId and keeps the count unchanged", async () => {
        const user = mkUser();
        await call(add, { user, body: { label: "Home", placeId: "same", lat: 1, lng: 1 } });
        await call(add, { user, body: { label: "Home (updated)", placeId: "same", lat: 1.1, lng: 1.1 } });

        const res = await call(list, { user });
        expect(res.body).toHaveLength(1);
        expect(res.body[0].label).toBe("Home (updated)");
        expect(res.body[0].coords).toEqual({ lat: 1.1, lng: 1.1 });
    });

    it("R3: de-dups by label when no placeId is present", async () => {
        const user = mkUser();
        await call(add, { user, body: { label: "Airport", lat: 10, lng: 20 } });
        await call(add, { user, body: { label: "Airport", lat: 10, lng: 20 } });

        const res = await call(list, { user });
        expect(res.body).toHaveLength(1);
    });

    it("R2/R3: re-selecting an existing place bumps it to the top", async () => {
        const user = mkUser();
        await call(add, { user, body: { label: "A", placeId: "a", lat: 1, lng: 1 } });
        await sleep(8);
        await call(add, { user, body: { label: "B", placeId: "b", lat: 2, lng: 2 } });
        await sleep(8);
        // Re-select A → should move to the top.
        await call(add, { user, body: { label: "A", placeId: "a", lat: 1, lng: 1 } });

        const res = await call(list, { user });
        expect(res.body).toHaveLength(2);
        expect(res.body[0].placeId).toBe("a");
        expect(res.body[1].placeId).toBe("b");
    });

    it("R2: caps at 6, evicting the oldest, newest-first", async () => {
        const user = mkUser();
        for (let i = 1; i <= 8; i++) {
            await call(add, { user, body: { label: `Place ${i}`, placeId: `p${i}`, lat: i, lng: i } });
            await sleep(4);
        }
        const res = await call(list, { user });
        expect(res.body).toHaveLength(6);
        // Newest-first: p8 .. p3 retained; p1, p2 evicted.
        expect(res.body[0].placeId).toBe("p8");
        expect(res.body[5].placeId).toBe("p3");
        expect(res.body.map((e) => e.placeId)).not.toContain("p1");
        expect(res.body.map((e) => e.placeId)).not.toContain("p2");
    });

    it("R5: a user only sees their own recent searches", async () => {
        const userA = mkUser();
        const userB = mkUser();
        await call(add, { user: userA, body: { label: "A-place", placeId: "a", lat: 1, lng: 1 } });
        await call(add, { user: userB, body: { label: "B-place", placeId: "b", lat: 2, lng: 2 } });

        const resA = await call(list, { user: userA });
        const resB = await call(list, { user: userB });
        expect(resA.body).toHaveLength(1);
        expect(resA.body[0].label).toBe("A-place");
        expect(resB.body).toHaveLength(1);
        expect(resB.body[0].label).toBe("B-place");
    });

    it("R6: removes a single entry (scoped to the user)", async () => {
        const user = mkUser();
        await call(add, { user, body: { label: "Keep", placeId: "k", lat: 1, lng: 1 } });
        await call(add, { user, body: { label: "Drop", placeId: "d", lat: 2, lng: 2 } });
        const doc = await RecentSearch.findOne({ user_id: user._id, placeId: "d" });

        await call(removeOne, { user, params: { id: String(doc._id) } });

        const res = await call(list, { user });
        expect(res.body).toHaveLength(1);
        expect(res.body[0].placeId).toBe("k");
    });

    it("R6: clears all of the user's entries", async () => {
        const user = mkUser();
        await call(add, { user, body: { label: "One", placeId: "1", lat: 1, lng: 1 } });
        await call(add, { user, body: { label: "Two", placeId: "2", lat: 2, lng: 2 } });

        const cleared = await call(clearAll, { user });
        expect(cleared.body).toHaveLength(0);
        const res = await call(list, { user });
        expect(res.body).toHaveLength(0);
    });
});
