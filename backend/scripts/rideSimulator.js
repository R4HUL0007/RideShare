#!/usr/bin/env node
/* =======================================================
 * TOOL 1 — Ride Simulator
 * -------------------------------------------------------
 * Drives a single shared ride through the FULL production lifecycle against the
 * live API, with real driver + passenger socket connections (so presence /
 * "connected" shows up in the Admin Live Monitor):
 *
 *   Driver → Move to Pickup → OTP → Start Ride → Move Along Route →
 *   Destination → Complete (AUTO_GPS | DRIVER_MANUAL | PASSENGER_CONFIRMATION)
 *
 * Usage (run from the backend/ folder so socket.io-client resolves):
 *   node scripts/rideSimulator.js
 *   node scripts/rideSimulator.js --method=manual --stepMs=2500
 *   node scripts/rideSimulator.js --driver=aarav.shah@paruluniversity.ac.in \
 *        --passenger=karan.desai@paruluniversity.ac.in --method=auto
 *
 * Env: SIM_BASE (default http://localhost:3000), SIM_PASSWORD (default Test@1234)
 * ======================================================= */

const { io } = require("socket.io-client");

// ---- args / config ----
const arg = (name, def) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : def;
};
const BASE = process.env.SIM_BASE || "http://localhost:3000";
const PASSWORD = process.env.SIM_PASSWORD || "Test@1234";
const DRIVER_EMAIL = arg("driver", "aarav.shah@paruluniversity.ac.in");
const PAX_EMAIL = arg("passenger", "karan.desai@paruluniversity.ac.in");
const METHOD = (arg("method", "auto") || "auto").toLowerCase(); // auto | manual | passenger
const STEP_MS = Number(arg("stepMs", "2000"));
const STEPS = Number(arg("steps", "8"));

// Pickup approach → source (pickup) → destination.
const APPROACH = { lat: 22.2935, lng: 73.4000 };
const SRC = { lat: 22.2980, lng: 73.4000 };
const DEST = { lat: 22.3050, lng: 73.4000 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toLocaleTimeString();
const step = (label) => console.log(`\n▶ ${label}`);
const info = (...a) => console.log("   ", ...a);

// ---- cookie-jar fetch ----
function makeClient() {
    const jar = {};
    const client = async (path, { method = "GET", body } = {}) => {
        const headers = { "Content-Type": "application/json" };
        const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
        if (cookie) headers["Cookie"] = cookie;
        const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
        for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
            const [pair] = c.split(";"); const i = pair.indexOf("=");
            jar[pair.slice(0, i)] = pair.slice(i + 1);
        }
        let data = null; try { data = await res.json(); } catch { /* none */ }
        return { status: res.status, data };
    };
    client.jar = jar;
    return client;
}

function steps(a, b, n) {
    const out = [];
    for (let i = 1; i <= n; i++) { const t = i / n; out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }); }
    return out;
}

async function login(client, who, email) {
    const r = await client("/api/auth/login", { method: "POST", body: { email, password: PASSWORD } });
    if (r.status !== 200) throw new Error(`${who} login failed (${r.status}): ${JSON.stringify(r.data)}`);
    info(`${who} logged in: ${email}`);
}

// Open a real socket connection (drives presence → "connected" in the monitor).
function connectSocket(token, label) {
    return new Promise((resolve) => {
        const sock = io(BASE, { auth: { token }, transports: ["websocket", "polling"], reconnection: true });
        let settled = false;
        sock.on("connect", () => { info(`${label} socket connected (${sock.id})`); if (!settled) { settled = true; resolve(sock); } });
        sock.on("connect_error", (e) => { info(`${label} socket error: ${e.message}`); if (!settled) { settled = true; resolve(sock); } });
        setTimeout(() => { if (!settled) { settled = true; resolve(sock); } }, 4000);
    });
}

(async () => {
    console.log(`=== Ride Simulator === base=${BASE} method=${METHOD}`);
    const driver = makeClient();
    const pax = makeClient();

    step("Login + connect sockets (presence)");
    await login(driver, "driver", DRIVER_EMAIL);
    await login(pax, "passenger", PAX_EMAIL);
    const driverSock = await connectSocket(driver.jar.accessToken, "driver");
    const paxSock = await connectSocket(pax.jar.accessToken, "passenger");

    // ---- Create ride ----
    step("Driver creates ride");
    const timing = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    let r = await driver("/api/rides", {
        method: "POST",
        body: { source: "Sim Pickup", destination: "Sim Destination", timing, pricePerPerson: 100, seatsAvailable: 3, sourceCoords: SRC, destinationCoords: DEST },
    });
    if (r.status !== 201) throw new Error(`createRide failed (${r.status}): ${JSON.stringify(r.data)}`);
    const rideId = r.data._id;
    console.log(`\n★ RIDE_ID=${rideId}  → point the Admin Live Monitor at this id`);
    await sleep(1500);

    step("Passenger books a seat");
    r = await pax(`/api/rides/book/${rideId}`, { method: "POST", body: { seats: 1 } });
    if (r.status !== 200 && r.status !== 201) throw new Error(`book failed (${r.status}): ${JSON.stringify(r.data)}`);
    info("seat booked");

    // ---- Move to pickup (pre-start enroute → arrived) ----
    step("Driver moving to pickup");
    const toPickup = steps(APPROACH, SRC, 4);
    for (let i = 0; i < toPickup.length; i++) {
        const p = toPickup[i];
        const state = i < toPickup.length - 1 ? "enroute" : "arrived";
        await driver(`/api/rides/${rideId}/tracking/location`, { method: "POST", body: { lat: p.lat, lng: p.lng, state } });
        info(`[${ts()}] driver @ ${p.lat.toFixed(4)},${p.lng.toFixed(4)} (${state})`);
        await sleep(STEP_MS);
    }

    // ---- OTP ----
    step("OTP boarding verification");
    r = await pax(`/api/rides/${rideId}/checkin`, { method: "POST" });
    if (r.status !== 200 || !r.data.code) throw new Error(`checkin failed (${r.status}): ${JSON.stringify(r.data)}`);
    const code = r.data.code;
    info(`passenger OTP issued: ${code}`);
    r = await driver(`/api/rides/${rideId}/verify`, { method: "POST", body: { code } });
    if (r.status !== 200) throw new Error(`verify OTP failed (${r.status}): ${JSON.stringify(r.data)}`);
    info("driver verified OTP ✓");

    // ---- Start ----
    step("Start ride (RIDE_STARTED)");
    r = await driver(`/api/rides/${rideId}/tracking/start`, { method: "POST" });
    if (r.status !== 200) throw new Error(`start failed (${r.status}): ${JSON.stringify(r.data)}`);
    info(`tracking state: ${r.data.tracking?.state}`);
    const startTs = Date.now();

    // ---- Move along the route ----
    step("Moving along route to destination");
    const route = steps(SRC, DEST, STEPS);
    for (const p of route) {
        const res = await driver(`/api/rides/${rideId}/tracking/location`, { method: "POST", body: { lat: p.lat, lng: p.lng } });
        const tk = res.data || {};
        info(`[${ts()}] @ ${p.lat.toFixed(4)},${p.lng.toFixed(4)}  travelled=${tk.tracking?.distanceKm ?? "?"}km  remaining=${tk.remainingKm ?? "?"}km  ETA=${tk.etaMin ?? "?"}min  atDest=${tk.tracking?.atDestination}`);
        if (tk.autoCompleted) { info("auto-completed mid-stream"); break; }
        await sleep(STEP_MS);
    }

    // ---- Destination + completion ----
    step(`Destination reached — completing via ${METHOD.toUpperCase()}`);
    if (METHOD === "passenger") {
        r = await pax(`/api/rides/${rideId}/tracking/arrived`, { method: "POST" });
        info(`passenger confirmation → ${r.status} ${r.data?.message || ""}`);
    } else if (METHOD === "manual") {
        const waitMs = Math.max(0, 64 * 1000 - (Date.now() - startTs));
        info(`holding ${Math.round(waitMs / 1000)}s to clear min trip duration...`);
        await sleep(waitMs);
        r = await driver(`/api/rides/${rideId}/tracking/end`, { method: "POST", body: DEST });
        info(`driver manual complete → ${r.status} ${r.data?.message || ""}`);
    } else {
        // AUTO_GPS: dwell inside the radius until the dwell + duration mins pass.
        info("dwelling inside destination radius for AUTO_GPS auto-complete...");
        let auto = false;
        for (let i = 0; i < 24 && !auto; i++) {
            const res = await driver(`/api/rides/${rideId}/tracking/location`, { method: "POST", body: DEST });
            auto = res.data?.autoCompleted === true;
            if (!auto) await sleep(4000);
        }
        info(auto ? "auto-completed ✓" : "auto-complete did not fire (check thresholds)");
    }

    // ---- Final state ----
    const fin = await driver(`/api/rides/${rideId}/tracking`);
    const tfin = fin.data?.tracking || {};
    step("Final state");
    info(`status=${fin.data ? "ok" : "?"} state=${tfin.state} method=${tfin.completionMethod} distance=${tfin.distanceKm}km`);
    console.log(`\n✅ Lifecycle complete for RIDE_ID=${rideId}`);

    driverSock.close(); paxSock.close();
    await sleep(300);
    process.exit(0);
})().catch((e) => { console.error("SIM ERROR:", e.message); process.exit(1); });
