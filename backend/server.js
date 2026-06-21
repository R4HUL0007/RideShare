const express = require("express");
const http = require("http");  // Required for Socket.io
const dotenv = require("dotenv");
const socketIo = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");
const jwt = require("jsonwebtoken");
const authRoutes = require("./routes/authRoutes");
const rideRoutes = require("./routes/rideRoutes");
const { rateLimit } = require("./middleware/rateLimit");
const User = require("./models/User");
dotenv.config();

// Fail fast if the JWT secret is missing or weak — a forgeable/absent secret is
// a silent auth bypass, so we refuse to boot rather than run insecurely.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    console.error("FATAL: JWT_SECRET is missing or too short (need >= 16 chars). Refusing to start.");
    process.exit(1);
}

connectDB();

const app = express();
// Trust the reverse proxy (nginx / tunnel) so req.ip reflects the real client
// IP from X-Forwarded-For — the rate limiter keys on it. Configurable via
// TRUST_PROXY (a hop count like "1", or a preset like "loopback"); defaults to
// a single proxy hop, matching the docker/nginx deployment.
const trustProxy = process.env.TRUST_PROXY;
app.set("trust proxy", trustProxy != null && trustProxy !== ""
    ? (Number.isNaN(Number(trustProxy)) ? trustProxy : Number(trustProxy))
    : 1);

// Security headers. This is a JSON API (the SPA is served separately by nginx),
// so the HTML-oriented CSP is disabled and cross-origin resource policy is left
// to the CORS layer below — everything else (HSTS, no-sniff, frameguard, etc.)
// is on by default.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

app.use(express.json());
app.use(cookieParser());

// In production, never leak internal error detail to clients: strip any `error`
// field from 5xx JSON responses (controllers may still return it in dev for
// debugging). This neutralizes the pervasive `{ error: err.message }` 500s
// without touching every controller.
if (process.env.NODE_ENV === "production") {
    app.use((req, res, next) => {
        const origJson = res.json.bind(res);
        res.json = (body) => {
            if (res.statusCode >= 500 && body && typeof body === "object" && "error" in body) {
                const { error, ...safe } = body;
                return origJson(safe);
            }
            return origJson(body);
        };
        next();
    });
}

// Baseline DoS backstop: a generous per-client global cap on the API surface.
// Sensitive endpoints have their own tighter limiters; this just blunts floods.
app.use("/api", rateLimit({ key: "global", windowMs: 60 * 1000, max: 1000 }));

// CORS configuration
const isDevelopment = process.env.NODE_ENV !== 'production';
const allowedOrigins = process.env.FRONTEND_URL 
    ? process.env.FRONTEND_URL.split(',') 
    : ["http://localhost:3000", "http://localhost:5173"];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // In development, allow all localhost origins and port-forwarded URLs
        if (isDevelopment) {
            // Allow localhost with any port
            if (origin.match(/^https?:\/\/localhost(:\d+)?$/)) {
                return callback(null, true);
            }
            // Allow 127.0.0.1 with any port
            if (origin.match(/^https?:\/\/127\.0\.0\.1(:\d+)?$/)) {
                return callback(null, true);
            }
            // Allow common port forwarding patterns (e.g., *.loca.lt, *.ngrok.io, *.devtunnels.ms, etc.)
            if (origin.match(/^https?:\/\/.*\.(loca\.lt|ngrok\.io|ngrok-free\.app|ngrok-free\.dev|ngrok\.app|ngrok\.dev|cloudflaretunnel\.com|trycloudflare\.com|devtunnels\.ms|inc1\.devtunnels\.ms)(:\d+)?$/)) {
                return callback(null, true);
            }
        }
        
        // Check against allowed origins list
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            // In development, log the blocked origin for debugging
            if (isDevelopment) {
                console.warn(`⚠️  CORS blocked origin: ${origin}. Add it to FRONTEND_URL env variable.`);
            }
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// app.use("/api/payment", require("./routes/paymentRoutes"));

const server = http.createServer(app);  // Create an HTTP server
const io = socketIo(server, {
    cors: { origin: true, credentials: true },
});

// ---- Cross-instance real-time fan-out ----
// When Redis is configured, attach the Socket.io Redis adapter so `io.to(room)`
// emits reach a user's sockets regardless of WHICH backend instance they're
// connected to (required behind a load balancer). No-op single-instance.
try {
    const { getRedisPair } = require("./config/redis");
    const pair = getRedisPair();
    if (pair) {
        const { createAdapter } = require("@socket.io/redis-adapter");
        io.adapter(createAdapter(pair.pub, pair.sub));
        console.log("[socket.io] Redis adapter enabled (multi-instance fan-out)");
    }
} catch (e) {
    console.error("Failed to enable Socket.io Redis adapter:", e.message);
}

const { markOnline, markOffline } = require("./utils/presence");

// ---- Socket authentication ----
// Derive the user identity from a verified JWT (handshake auth token or the
// httpOnly cookie) instead of trusting a client-sent userId. This closes the
// impersonation hole where any client could "join" as any user.
const parseCookie = (raw, name) => {
    if (!raw) return null;
    const m = raw.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[1]) : null;
};
io.use(async (socket, next) => {
    try {
        const token =
            socket.handshake.auth?.token ||
            parseCookie(socket.handshake.headers?.cookie, "accessToken") ||
            parseCookie(socket.handshake.headers?.cookie, "token");
        if (!token) return next(new Error("unauthorized"));
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
        // Mirror the HTTP `protect` gate: the account must still exist, be
        // verified, and not be suspended/frozen — otherwise a blocked or deleted
        // user keeps live realtime delivery until their token expires.
        const u = await User.findById(decoded.id).select("isVerified status").lean();
        if (!u || !u.isVerified || u.status === "suspended" || u.status === "frozen") {
            return next(new Error("unauthorized"));
        }
        socket.userId = String(decoded.id);
        next();
    } catch {
        next(new Error("unauthorized"));
    }
});

// Store connected users
const users = {};
app.set("io", io);
app.set("users", users);

io.on("connection", (socket) => {
    // The user is already authenticated by io.use(); join a private room keyed
    // by their id so targeted emits reach ALL of their devices/tabs.
    const uid = socket.userId;
    if (uid) {
        socket.join(uid);
        users[uid] = socket.id;       // local socket id (this instance)
        markOnline(uid).catch(() => {}); // cluster-wide presence (Redis or memory)
    }

    // Back-compat: the client still emits "join", but we ignore its payload and
    // trust the token-derived id (never a client-supplied one).
    socket.on("join", () => {
        if (uid) { socket.join(uid); users[uid] = socket.id; }
    });

    socket.on("disconnect", () => {
        // Only clear LOCAL presence if no other socket for this user remains on
        // THIS instance; always decrement the cluster-wide presence counter.
        if (uid) {
            const room = io.sockets.adapter.rooms.get(uid);
            if (!room || room.size === 0) delete users[uid];
            markOffline(uid).catch(() => {});
        }
    });
});

// Register API routes
app.use("/api/auth", authRoutes);
app.use("/api/vehicles", require("./routes/vehicleRoutes"));
app.use("/api/rides", rideRoutes);
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/ai", require("./routes/aiRoutes"));
app.use("/api/verification", require("./routes/verificationRoutes"));
app.use("/api/safety", require("./routes/safetyRoutes"));
app.use("/api/support", require("./routes/supportRoutes"));
app.use("/api/personal-rides", require("./routes/personalRideRoutes"));
app.use("/api/push", require("./routes/pushRoutes"));
app.use("/api/recommendations", require("./routes/recommendationRoutes"));
app.use("/api/sustainability", require("./routes/sustainabilityRoutes"));

// Start server
const PORT = process.env.PORT || 5000;

// Start the escrow auto-release sweep (releases held funds to drivers when a
// passenger neither confirms nor disputes within the window).
try {
    const { startAutoReleaseScheduler } = require("./jobs/autoReleaseEscrow");
    startAutoReleaseScheduler(app);
} catch (e) {
    console.error("Failed to start auto-release scheduler:", e.message);
}

// Start the Personalized Ride jobs (request/OTP expiry, weekly settlement,
// failed-payout retry).
try {
    const { startPersonalRideJobs } = require("./jobs/personalRideJobs");
    startPersonalRideJobs(app);
} catch (e) {
    console.error("Failed to start personalized-ride jobs:", e.message);
}

// Initialize the AI assistant gateway (ingests the knowledge base into the
// vector store). Non-fatal: the assistant degrades gracefully if this fails.
try {
    const aiGateway = require("./ai");
    aiGateway.init();
} catch (e) {
    console.error("Failed to initialize AI gateway:", e.message);
}

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
