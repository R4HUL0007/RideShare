// In-memory MongoDB test setup helper for backend persistence tests.
//
// Boots an ephemeral MongoDB instance via `mongodb-memory-server` and manages
// the Mongoose connection lifecycle. The backend is a CommonJS project, so this
// module uses `require`/`module.exports`.
//
// Typical usage in a Vitest suite (globals enabled):
//
//   const { connect, clearDatabase, closeDatabase } = require("./setupDb");
//
//   beforeAll(async () => { await connect(); });
//   afterEach(async () => { await clearDatabase(); });
//   afterAll(async () => { await closeDatabase(); });

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer = null;

/**
 * Boot an in-memory MongoDB server (if not already running) and connect
 * Mongoose to it. Safe to call repeatedly; subsequent calls reuse the existing
 * server and connection. Intended for use in `beforeAll`.
 *
 * @returns {Promise<string>} the in-memory server connection URI
 */
async function connect() {
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
 * Remove all documents from every collection in the connected database so each
 * test starts from a clean slate without the cost of recreating the server.
 * Intended for use in `afterEach`.
 *
 * @returns {Promise<void>}
 */
async function clearDatabase() {
    if (mongoose.connection.readyState === 0) {
        return;
    }

    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
        await collections[key].deleteMany({});
    }
}

/**
 * Drop the database, disconnect Mongoose, and stop the in-memory MongoDB
 * server, releasing all resources. Intended for use in `afterAll`.
 *
 * @returns {Promise<void>}
 */
async function closeDatabase() {
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
    connect,
    clearDatabase,
    closeDatabase,
};
