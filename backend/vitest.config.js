// Vitest configuration for the backend (CommonJS project).
// The backend uses `require`/`module.exports`, so tests run in a Node
// environment. mongodb-memory-server may need to download/boot a binary on the
// first run, so hook/test timeouts are generous.
const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
    test: {
        // Node environment for backend (Mongoose / Express) tests.
        environment: "node",
        // Enable describe/it/expect without imports.
        globals: true,
        // Allow time for the in-memory MongoDB binary to boot (and download
        // on the first run).
        testTimeout: 60000,
        hookTimeout: 60000,
        // Discover *.test.js / *.spec.js across the backend, ignoring deps.
        include: ["**/*.{test,spec}.{js,cjs,mjs}"],
        exclude: ["node_modules", "dist"],
    },
});
