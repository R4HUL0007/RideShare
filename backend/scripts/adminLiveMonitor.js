#!/usr/bin/env node
/* =======================================================
 * TOOL 2 — Admin Live Monitor
 * -------------------------------------------------------
 * A live terminal dashboard for a ride, for ops/admin. Logs in as an admin,
 * opens an admin Socket.io connection, and polls the admin live endpoints to
 * render, refreshing in place:
 *
 *   Ride #<id>
 *     Status            RIDE_STARTED / Completed / ...
 *     Current Location  lat,lng (age)
 *     Distance          travelled / remaining
 *     ETA               N min
 *     Socket Connected  yes/no   (this monitor's admin socket)
 *     Passenger(s)      name → connected yes/no
 *     Driver            name → connected yes/no
 *
 * Usage (run from the backend/ folder):
 *   node scripts/adminLiveMonitor.js                 # auto-pick an active ride
 *   node scripts/adminLiveMonitor.js --ride=<rideId>
 *
 * Env: SIM_BASE (default http://localhost:3000),
 *      ADMIN_EMAIL (default qa.admin@paruluniversity.ac.in),
 *      ADMIN_PASSWORD (default Test@1234), POLL_MS (default 2000)
 * ======================================================= */

const { io } = require("socket.io-client");

const arg = (name, def) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : def;
};
const BASE = process.env.SIM_BASE || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "qa.admin@paruluniversity.ac.in";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Test@1234";
const POLL_MS = Number(process.env.POLL_MS || 2000);
let RIDE_ID = arg("ride", null);

const jar = {};
async function api(path) {
    const headers = {};
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers["Cookie"] = cookie;
    const res = await fetch(`${BASE}${path}`, { headers });
    for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
        const [pair] = c.split(";"); const i = pair.indexOf("=");
        jar[pair.slice(0, i)] = pair.slice(i + 1);
    }
    let data = null; try { data = await res.json(); } catch { /* none */ }
    return { status: res.status, data };
}
async function login() {
    const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
        const [pair] = c.split(";"); const i = pair.indexOf("=");
        jar[pair.slice(0, i)] = pair.slice(i + 1);
    }
    if (res.status !== 200) throw new Error(`admin login failed (${res.status})`);
}

const yn = (b) => (b ? "✅ yes" : "⛔ no");
const age = (iso) => (iso ? `${Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))}s ago` : "—");
const STATE_LABEL = {
    scheduled: "SCHEDULED", enroute: "DRIVER EN ROUTE", arriving: "DRIVER ARRIVING",
    arrived: "DRIVER ARRIVED", in_progress: "RIDE_STARTED", completed: "COMPLETED",
};

let socketConnected = false;

function render(d) {
    const loc = d.currentLocation ? `${d.currentLocation.lat.toFixed(5)}, ${d.currentLocation.lng.toFixed(5)} (${age(d.locationUpdatedAt)})` : "— (not shared yet)";
    const lines = [];
    lines.push("\x1b[2J\x1b[H"); // clear screen + home
    lines.push("╔══════════════════════════════════════════════════════════════╗");
    lines.push(`  ADMIN LIVE MONITOR        ${new Date().toLocaleTimeString()}`);
    lines.push("╠══════════════════════════════════════════════════════════════╣");
    lines.push(`  Ride #${d.rideId}`);
    lines.push(`  Route             ${d.source}  →  ${d.destination}`);
    lines.push(`  Status            ${STATE_LABEL[d.state] || d.state}${d.status === "Completed" ? `  (${d.completionMethod || ""})` : ""}`);
    lines.push(`  Current Location  ${loc}`);
    lines.push(`  Distance          travelled ${d.distanceTravelledKm}km  |  remaining ${d.remainingKm ?? "—"}km`);
    lines.push(`  ETA               ${d.etaMin != null ? d.etaMin + " min" : "—"}`);
    lines.push(`  At Destination    ${yn(d.atDestination)}${d.deviationFlagged ? "   ⚠ ROUTE DEVIATION FLAGGED" : ""}`);
    lines.push("  ──────────────────────────────────────────────────────────────");
    lines.push(`  Socket Connected  ${yn(socketConnected)}   (admin monitor)`);
    lines.push(`  Driver            ${d.driver?.name || "—"}  →  ${yn(d.driver?.connected)}`);
    if ((d.passengers || []).length === 0) {
        lines.push(`  Passenger         — none booked —`);
    } else {
        d.passengers.forEach((p, i) => {
            lines.push(`  Passenger ${i + 1}       ${p.name}  →  ${yn(p.connected)}  [OTP ${p.boardingVerified ? "verified" : "pending"}, ${p.paymentStatus}]`);
        });
    }
    lines.push("╚══════════════════════════════════════════════════════════════╝");
    lines.push("  (Ctrl+C to exit)");
    process.stdout.write(lines.join("\n") + "\n");
}

async function pickActiveRide() {
    const r = await api("/api/admin/live");
    const list = r.data?.activeRideList || [];
    if (list.length) return list[0]._id;
    return null;
}

(async () => {
    await login();

    // Admin socket — proves realtime infra is up (also subscribes to status).
    const sock = io(BASE, { auth: { token: jar.accessToken }, transports: ["websocket", "polling"], reconnection: true });
    sock.on("connect", () => { socketConnected = true; });
    sock.on("disconnect", () => { socketConnected = false; });
    sock.on("ride:status", (p) => { /* live status nudge — next poll re-renders */ });

    if (!RIDE_ID) {
        process.stdout.write("Looking for an active in-progress ride...\n");
        for (let i = 0; i < 30 && !RIDE_ID; i++) { RIDE_ID = await pickActiveRide(); if (!RIDE_ID) await new Promise((r) => setTimeout(r, 1000)); }
        if (!RIDE_ID) { console.error("No active ride found. Pass --ride=<rideId> or start the Ride Simulator first."); process.exit(1); }
    }

    const tick = async () => {
        try {
            const r = await api(`/api/admin/rides/${RIDE_ID}/live`);
            if (r.status === 200) render(r.data);
            else process.stdout.write(`\n[poll ${r.status}] ${JSON.stringify(r.data)}\n`);
        } catch (e) { process.stdout.write(`\n[poll error] ${e.message}\n`); }
    };
    await tick();
    const timer = setInterval(tick, POLL_MS);

    process.on("SIGINT", () => { clearInterval(timer); sock.close(); process.stdout.write("\nMonitor stopped.\n"); process.exit(0); });
})().catch((e) => { console.error("MONITOR ERROR:", e.message); process.exit(1); });
