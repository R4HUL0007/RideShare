// =======================================================
// Structured logging (pino) with optional Grafana Loki shipping.
//
// - Always writes JSON logs to stdout → captured by Northflank's log viewer.
// - Additionally ships to Grafana Cloud Loki when GRAFANA_LOKI_* are set.
//
// IMPORTANT: we ship to Loki over plain HTTP from the MAIN THREAD (a small
// batching pusher using Node's built-in https), NOT via pino's worker-thread
// transport (`pino-loki`). Worker-thread transports silently fail to ship in
// some PaaS runtimes (e.g. Northflank) even when setup doesn't throw. The
// main-thread multistream approach is robust everywhere. Loki failures are
// swallowed so logging can never crash or block the app.
// =======================================================
const pino = require("pino");
const https = require("https");
const { URL } = require("url");

const LOKI_URL = process.env.GRAFANA_LOKI_URL;      // e.g. https://logs-prod-028.grafana.net
const LOKI_USER = process.env.GRAFANA_LOKI_USER;    // numeric Loki instance/user id
const LOKI_TOKEN = process.env.GRAFANA_LOKI_TOKEN;  // access-policy token with logs:write
const lokiEnabled = Boolean(LOKI_URL && LOKI_USER && LOKI_TOKEN);
const LEVEL = process.env.LOG_LEVEL || "info";
const ENV = process.env.NODE_ENV || "development";

// A pino "stream" that batches log lines and POSTs them to Loki's push API.
// Runs in-process (no worker threads). Silent on any failure.
function createLokiStream({ url, user, token, labels }) {
    const pushUrl = new URL(url.replace(/\/+$/, "") + "/loki/api/v1/push");
    const auth = "Basic " + Buffer.from(`${user}:${token}`).toString("base64");
    let buffer = [];
    let timer = null;

    const flush = () => {
        if (buffer.length === 0) return;
        const lines = buffer;
        buffer = [];
        // Loki needs [ns-timestamp, line] pairs, strictly increasing per stream.
        let lastNs = 0n;
        const values = lines.map((line) => {
            let ns;
            try { ns = BigInt(JSON.parse(line).time) * 1000000n; }
            catch { ns = BigInt(Date.now()) * 1000000n; }
            if (ns <= lastNs) ns = lastNs + 1n;
            lastNs = ns;
            return [ns.toString(), line.replace(/\n$/, "")];
        });
        const body = JSON.stringify({ streams: [{ stream: labels, values }] });
        try {
            const req = https.request(pushUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: auth,
                    "Content-Length": Buffer.byteLength(body),
                },
                timeout: 8000,
            }, (res) => { res.resume(); });
            req.on("error", () => { /* never throw on shipping failure */ });
            req.on("timeout", () => req.destroy());
            req.write(body);
            req.end();
        } catch { /* ignore */ }
    };

    const schedule = () => {
        if (timer) return;
        timer = setTimeout(() => { timer = null; flush(); }, 3000);
        if (timer.unref) timer.unref();
    };

    // Flush any buffered logs on shutdown (Northflank sends SIGTERM on redeploy).
    const flushNow = () => { if (timer) { clearTimeout(timer); timer = null; } flush(); };
    process.once("SIGTERM", flushNow);
    process.once("beforeExit", flushNow);

    return {
        write(line) {
            buffer.push(line);
            if (buffer.length >= 50) flushNow();
            else schedule();
        },
    };
}

const streams = [{ level: LEVEL, stream: process.stdout }];
if (lokiEnabled) {
    streams.push({
        level: LEVEL,
        stream: createLokiStream({
            url: LOKI_URL,
            user: String(LOKI_USER),
            token: LOKI_TOKEN,
            labels: { app: "rideshare-backend", env: ENV },
        }),
    });
}

const logger = pino({ level: LEVEL }, pino.multistream(streams));

if (lokiEnabled) logger.info("📈 Log shipping to Grafana Loki enabled (http)");

module.exports = { logger, lokiEnabled };
