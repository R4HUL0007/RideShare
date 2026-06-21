// Persistence tests for ride coordinate handling (Task 8.3).
//
// The full `createRide` controller has many dependencies (User lookup,
// Notification fan-out, socket.io). Rather than mounting Express, these tests
// exercise the SAME coordinate path the controller uses:
//
//     Ride.create({ ...required fields..., sourceCoords: normalizeCoords(input),
//                                          destinationCoords: normalizeCoords(input) })
//
// followed by a read-back via `Ride.findById`. This covers:
//   - Req 13.1: numeric coords stored as { lat, lng }
//   - Req 13.2: missing/partial/non-finite coords stored as { lat: null, lng: null }
//   - Req 13.3: stored coords returned unchanged on retrieval
//
// Properties validated (from design.md "Correctness Properties"):
//   - Property 4: Coordinate normalization totality (Reqs 13.1, 13.2)
//   - Property 5: Persistence round-trip (Reqs 13.1, 13.3)
//
// Backend is CommonJS; uses Vitest globals + fast-check + mongodb-memory-server.

const mongoose = require("mongoose");
const fc = require("fast-check");
const Ride = require("../models/Ride");
const { normalizeCoords } = require("../utils/coords");
const { connect, clearDatabase, closeDatabase } = require("../test/setupDb");

beforeAll(connect);
afterEach(clearDatabase);
afterAll(closeDatabase);

// Build a valid base ride document so the schema's required validators pass.
// Coordinates are added per-test on top of this base.
const baseRide = () => ({
    user_id: new mongoose.Types.ObjectId(),
    role: "Student",
    gender_preference: "Any",
    source: "University",
    destination: "Downtown",
    timing: new Date(),
});

describe("Ride coordinate persistence", () => {
    describe("Property 5 / Req 13.1, 13.3: persistence round-trip", () => {
        it("returns the exact numeric coords that were stored (fast-check)", async () => {
            // Generators constrained to the valid geographic input space.
            const lat = fc.double({
                min: -90,
                max: 90,
                noNaN: true,
                noDefaultInfinity: true,
            });
            const lng = fc.double({
                min: -180,
                max: 180,
                noNaN: true,
                noDefaultInfinity: true,
            });

            await fc.assert(
                fc.asyncProperty(lat, lng, lat, lng, async (sLat, sLng, dLat, dLng) => {
                    const source = normalizeCoords({ lat: sLat, lng: sLng });
                    const destination = normalizeCoords({ lat: dLat, lng: dLng });

                    // Mirror the controller: normalizeCoords -> Ride.create.
                    const created = await Ride.create({
                        ...baseRide(),
                        sourceCoords: source,
                        destinationCoords: destination,
                    });

                    // Read back the specific doc by its _id (cleanest under
                    // concurrent/repeated property runs).
                    const found = await Ride.findById(created._id);

                    // Coords survive the round-trip exactly.
                    expect(found.sourceCoords.lat).toBe(sLat);
                    expect(found.sourceCoords.lng).toBe(sLng);
                    expect(found.destinationCoords.lat).toBe(dLat);
                    expect(found.destinationCoords.lng).toBe(dLng);
                }),
                // Keep modest so the DB-backed property stays fast.
                { numRuns: 10 }
            );
        });
    });

    describe("Property 4 / Req 13.2: missing/partial/non-finite -> nulls", () => {
        // Inputs that are NOT a finite numeric pair. Each must collapse to
        // { lat: null, lng: null } on storage and read-back.
        const nonFiniteInputs = [
            ["null", null],
            ["undefined", undefined],
            ["lat only", { lat: 1 }],
            ["lng only", { lng: 2 }],
            ["non-numeric strings", { lat: "x", lng: "y" }],
            ["NaN lat", { lat: NaN, lng: 2 }],
            ["NaN lng", { lat: 1, lng: NaN }],
            ["Infinity lat", { lat: Infinity, lng: 2 }],
            ["-Infinity lng", { lat: 1, lng: -Infinity }],
            ["empty object", {}],
            ["null fields", { lat: null, lng: null }],
        ];

        it.each(nonFiniteInputs)(
            "stores { lat: null, lng: null } for input: %s",
            async (_label, input) => {
                const created = await Ride.create({
                    ...baseRide(),
                    sourceCoords: normalizeCoords(input),
                    destinationCoords: normalizeCoords(input),
                });

                const found = await Ride.findById(created._id);

                expect(found.sourceCoords.lat).toBe(null);
                expect(found.sourceCoords.lng).toBe(null);
                expect(found.destinationCoords.lat).toBe(null);
                expect(found.destinationCoords.lng).toBe(null);
            }
        );

        it("collapses arbitrary non-pair inputs to nulls (fast-check)", async () => {
            // Generate inputs that are explicitly NOT finite { lat, lng } pairs:
            // arbitrary objects whose lat/lng (if present) are non-numeric or
            // non-finite, plus null/undefined.
            const nonPair = fc.oneof(
                fc.constant(null),
                fc.constant(undefined),
                fc.constant({}),
                fc.record({ lat: fc.string(), lng: fc.string() }),
                fc.record({ lat: fc.integer() }), // lng missing
                fc.record({ lng: fc.integer() }), // lat missing
                fc.record({
                    lat: fc.constantFrom(NaN, Infinity, -Infinity),
                    lng: fc.constantFrom(NaN, Infinity, -Infinity),
                })
            );

            await fc.assert(
                fc.asyncProperty(nonPair, async (input) => {
                    const created = await Ride.create({
                        ...baseRide(),
                        sourceCoords: normalizeCoords(input),
                        destinationCoords: normalizeCoords(input),
                    });

                    const found = await Ride.findById(created._id);

                    expect(found.sourceCoords.lat).toBe(null);
                    expect(found.sourceCoords.lng).toBe(null);
                    expect(found.destinationCoords.lat).toBe(null);
                    expect(found.destinationCoords.lng).toBe(null);
                }),
                { numRuns: 10 }
            );
        });
    });

    describe("Example integration sanity (Req 13.1, 13.2, 13.3)", () => {
        it("stores and returns exact numeric coords", async () => {
            const sourceCoords = normalizeCoords({ lat: 12.9716, lng: 77.5946 });
            const destinationCoords = normalizeCoords({ lat: 13.0827, lng: 80.2707 });

            const created = await Ride.create({
                ...baseRide(),
                sourceCoords,
                destinationCoords,
            });

            const found = await Ride.findById(created._id);

            expect(found.sourceCoords.lat).toBe(12.9716);
            expect(found.sourceCoords.lng).toBe(77.5946);
            expect(found.destinationCoords.lat).toBe(13.0827);
            expect(found.destinationCoords.lng).toBe(80.2707);
        });

        it("stores nulls when no coords are provided", async () => {
            const created = await Ride.create({
                ...baseRide(),
                sourceCoords: normalizeCoords(undefined),
                destinationCoords: normalizeCoords(undefined),
            });

            const found = await Ride.findById(created._id);

            expect(found.sourceCoords.lat).toBe(null);
            expect(found.sourceCoords.lng).toBe(null);
            expect(found.destinationCoords.lat).toBe(null);
            expect(found.destinationCoords.lng).toBe(null);
        });
    });
});
