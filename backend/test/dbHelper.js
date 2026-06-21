// Test helper that boots an in-memory MongoDB instance and manages the
// Mongoose connection lifecycle for backend persistence tests.
//
// Usage in a Vitest suite (CommonJS):
//
//   const { connectTestDB, clearTestDB, disconnectTestDB } = require("./dbHelper");
//
//   beforeAll(async () => { await connectTestDB(); });
//   afterEach(async () => { await clearTestDB(); });
//   afterAll(async () => { await disconnectTestDB(); });

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer = null;

/**
 * Boot an in-memory MongoDB server (if not already running) and connect
 * Mongoose to it. Safe to call multiple times; subsequent calls reuse the
 * existing server and connection.
 *
 * @returns {Promise<string>} the in-memory server connection URI
 */
async function connectTestDB() {
    if (!mongoServer) {
        mongoServer = await MongoMemoryServer.create();
    }

    const uri = mongoServer.getUri();

    // mongoose readyState: 0 = disconnected, 1 = connected, 2 = connecting.
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(uri);
    }

    return uri;
}

/**
 * Remove all documents from every collection in the connected database.
 * Intended for use in `afterEach` so tests start from a clean slate without
 * the cost of tearing down and recreating the server.
 *
 * @returns {Promise<void>}
 */
async function clearTestDB() {
    if (mongoose.connection.readyState === 0) {
        return;
    }

    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
        await collections[key].deleteMany({});
    }
}

/**
 * Disconnect Mongoose and stop the in-memory MongoDB server, releasing all
 * resources. Intended for use in `afterAll`.
 *
 * @returns {Promise<void>}
 */
async function disconnectTestDB() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
    }

    if (mongoServer) {
        await mongoServer.stop();
        mongoServer = null;
    }
}

module.exports = {
    connectTestDB,
    clearTestDB,
    disconnectTestDB,
};
