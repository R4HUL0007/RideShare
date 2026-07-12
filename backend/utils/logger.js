// =======================================================
// Structured logging (pino) with optional Grafana Loki shipping.
//
// - Always writes JSON logs to stdout → captured by Northflank's log viewer.
// - Additionally ships to Grafana Cloud Loki when GRAFANA_LOKI_* are set, so
//   ALL backend logs are centralized/searchable in Grafana. Loki failures are
//   silenced (silenceErrors) so logging can never crash or block the app.
// - Falls back to a plain stdout logger if transport setup fails.
// =======================================================
const pino = require("pino");

const LOKI_URL = process.env.GRAFANA_LOKI_URL;      // e.g. https://logs-prod-028.grafana.net
const LOKI_USER = process.env.GRAFANA_LOKI_USER;    // numeric Loki instance/user id
const LOKI_TOKEN = process.env.GRAFANA_LOKI_TOKEN;  // access-policy token with logs:write
const lokiEnabled = Boolean(LOKI_URL && LOKI_USER && LOKI_TOKEN);
const LEVEL = process.env.LOG_LEVEL || "info";
const ENV = process.env.NODE_ENV || "development";

let logger;
try {
    const targets = [
        // stdout (fd 1) — keeps Northflank / docker logs working as before.
        { target: "pino/file", level: LEVEL, options: { destination: 1 } },
    ];
    if (lokiEnabled) {
        targets.push({
            target: "pino-loki",
            level: LEVEL,
            options: {
                host: LOKI_URL,
                basicAuth: { username: String(LOKI_USER), password: LOKI_TOKEN },
                labels: { app: "rideshare-backend", env: ENV },
                batching: true,
                interval: 5,          // flush batched logs every 5s
                timeout: 5000,
                silenceErrors: true,  // never throw on a Loki hiccup
            },
        });
    }
    logger = pino({ level: LEVEL }, pino.transport({ targets }));
} catch (err) {
    // Transport worker failed to start — degrade to a plain stdout logger.
    // eslint-disable-next-line no-console
    console.error("logger: transport setup failed, using stdout only:", err.message);
    logger = pino({ level: LEVEL });
}

if (lokiEnabled) logger.info("📈 Log shipping to Grafana Loki enabled");

module.exports = { logger, lokiEnabled };
