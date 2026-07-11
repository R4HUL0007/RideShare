// Tests for Smart Ride Suggestions — engine (radius match, priority) + controller
// (record/trim, favorite upsert, clear, per-user scoping). In-memory Mongo +
// Vitest globals; no ML, no network.

const mongoose = require("mongoose");
const SearchLog = require("../models/SearchLog");
const FavoriteLocation = require("../models/FavoriteLocation");
const RideSearchHistory = require("../models/RideSearchHistory");
const { matchCurrentPlace, buildSmartSuggestion } = require("../utils/suggestions");
const { record, removeSearch, clearSearches } = require("./suggestionsController");
const { connect, clearDatabase, closeDatabase } = require("../test/setupDb");

beforeAll(connect);
afterEach(clearDatabase);
afterAll(closeDatabase);

const mkRes = () => {
    const res = {};
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
};
const call = async (fn, { user, body = {}, params = {}, query = {} }) => {
    const res = mkRes();
    await fn({ user, body, params, query }, res);
    return res;
};
const uid = () => new mongoose.Types.ObjectId();

// Seed a user's search logs (buildProfile reads these to build favorite routes).
const seedSearch = (userId, source, destination, times, destCoords) =>
    SearchLog.insertMany(
        Array.from({ length: times }, () => ({
            user_id: userId, role: "Student", source, destination,
            destinationCoords: destCoords || { lat: null, lng: null },
        }))
    );

describe("suggestions engine", () => {
    it("matchCurrentPlace returns the nearest favorite within radius, else null", () => {
        const favs = [
            { label: "Home", coords: { lat: 22.2895, lng: 73.3631 } },
            { label: "Far", coords: { lat: 23.0, lng: 72.0 } },
        ];
        // ~50m from Home
        const near = matchCurrentPlace({ lat: 22.2899, lng: 73.3631 }, favs, 300);
        expect(near && near.label).toBe("Home");
        // >1km from any favorite
        expect(matchCurrentPlace({ lat: 22.31, lng: 73.40 }, favs, 300)).toBeNull();
        // no coords
        expect(matchCurrentPlace(null, favs, 300)).toBeNull();
    });

    it("prioritizes a current-location match over a more frequent route (R6)", async () => {
        const user = uid();
        const homeCoords = { lat: 22.2895, lng: 73.3631 };
        // Frequent route NOT from Home.
        await seedSearch(user, "University", "Railway Station", 10);
        // Less frequent route FROM Home.
        await seedSearch(user, "Home", "Gym", 2);
        // Favorite "Home" at homeCoords.
        await FavoriteLocation.create({ user_id: user, label: "Home", coords: homeCoords, visitCount: 5 });

        const now = new Date();
        const out = await buildSmartSuggestion(user, { lat: homeCoords.lat, lng: homeCoords.lng, hour: now.getHours(), day: now.getDay() });
        expect(out.smartCard).toBeTruthy();
        // Location match (Home → Gym) beats the more frequent University route.
        expect(out.smartCard.origin.toLowerCase()).toContain("home");
        expect(out.smartCard.destination).toBe("Gym");
    });

    it("returns null smartCard when there is no history", async () => {
        const out = await buildSmartSuggestion(uid(), {});
        expect(out.smartCard).toBeNull();
        expect(out.favoritePlaces).toEqual([]);
        expect(out.frequentDestinations).toEqual([]);
    });
});

describe("suggestions controller", () => {
    it("record trims recent searches to 10 (R1)", async () => {
        const user = { _id: uid() };
        for (let i = 1; i <= 12; i++) {
            await call(record, { user, body: { pickup: { label: "Home", lat: 22.28, lng: 73.36 }, destination: { label: `Dest ${i}`, lat: 22 + i * 0.01, lng: 73 + i * 0.01 } } });
        }
        const count = await RideSearchHistory.countDocuments({ user_id: user._id });
        expect(count).toBe(10);
    });

    it("bumps an existing favorite within radius instead of creating a new one (R2)", async () => {
        const user = { _id: uid() };
        // Same destination coords twice (within radius) → one favorite, visitCount 2.
        await call(record, { user, body: { pickup: { label: "A", lat: 1, lng: 1 }, destination: { label: "University", lat: 22.2895, lng: 73.3631 } } });
        await call(record, { user, body: { pickup: { label: "A", lat: 1, lng: 1 }, destination: { label: "University", lat: 22.2896, lng: 73.3632 } } });

        const uniFavs = await FavoriteLocation.find({ user_id: user._id }).lean();
        const uni = uniFavs.find((f) => Math.abs(f.coords.lat - 22.2895) < 0.001);
        expect(uni).toBeTruthy();
        expect(uni.visitCount).toBe(2);
    });

    it("clears all recent searches without touching favorites/SearchLog (R1, R9)", async () => {
        const user = { _id: uid() };
        await call(record, { user, body: { pickup: { label: "A", lat: 1, lng: 1 }, destination: { label: "B", lat: 2, lng: 2 } } });
        await SearchLog.create({ user_id: user._id, source: "A", destination: "B" });

        await call(clearSearches, { user });

        expect(await RideSearchHistory.countDocuments({ user_id: user._id })).toBe(0);
        // Favorites + SearchLog are untouched.
        expect(await FavoriteLocation.countDocuments({ user_id: user._id })).toBeGreaterThan(0);
        expect(await SearchLog.countDocuments({ user_id: user._id })).toBe(1);
    });

    it("scopes recent searches per user (R8)", async () => {
        const a = { _id: uid() };
        const b = { _id: uid() };
        await call(record, { user: a, body: { destination: { label: "A-dest", lat: 1, lng: 1 } } });
        await call(record, { user: b, body: { destination: { label: "B-dest", lat: 2, lng: 2 } } });

        const resA = await call(removeSearch, { user: a, params: { id: "not-an-id" } }); // returns a's list
        expect(resA.body.every((s) => s.destination.label === "A-dest")).toBe(true);
    });
});
