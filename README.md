# RideShare

A full-stack, production-grade carpooling / ride-sharing platform built for a university community. Riders and drivers post and book shared rides, pay securely through an escrow-backed flow, chat and track each other in real time, and stay safe with SOS, ride check-in, and driver verification — all wrapped in a dark, installable PWA.

> Sign-up is restricted to `@paruluniversity.ac.in` email accounts (configurable in code).

---

## Tech Stack

**Backend** — Node.js, Express, MongoDB (Mongoose), Socket.io, Redis (ioredis + Socket.io Redis adapter), Razorpay, Nodemailer, JWT, Google Auth Library, Helmet, web-push.

**Frontend** — React 19, Vite, Tailwind CSS, React Router 7, Axios, Socket.io-client, Google Maps (`@react-google-maps/api`), `@react-oauth/google`, React Toastify, QRCode. Ships as an installable PWA (service worker, offline page, push).

**Infrastructure** — Docker + Docker Compose (Mongo, Redis, backend, nginx-served frontend), single-origin reverse proxy, horizontally scalable (Redis-backed presence/rate-limit/socket adapter + nginx load balancer).

**Testing** — Vitest (unit) on backend & frontend, Playwright (97 end-to-end tests) against the live Docker stack.

---

## Architecture

```
                         ┌──────────────────────────────┐
  Browser / PWA  ───────▶│  frontend (nginx)            │
  (one origin)           │  • serves React build        │
                         │  • proxies /api  → backend   │
                         │  • proxies /socket.io → backend
                         └───────────────┬──────────────┘
                                         │
                                ┌────────▼─────────┐      ┌──────────┐
                                │  backend (Express)│◀────▶│  Redis   │
                                │  REST + Socket.io │      │ cache /  │
                                └────────┬─────────┘      │ presence │
                                         │                └──────────┘
                                   ┌─────▼─────┐
                                   │  MongoDB  │
                                   └───────────┘
```

The frontend nginx serves the static build **and** reverse-proxies `/api` and `/socket.io` to the backend, so the whole app runs from a single origin — which is what the httpOnly auth cookies need.

---

## Features

### Authentication & Users
- Email/password registration with **OTP email verification** (university-domain restricted)
- **Google Sign-In** with server-side ID-token verification and the same domain rule
- **Refresh-token auth**: 15-min access token + 20-day rotating refresh token, both httpOnly cookies, with reuse detection and silent auto-renew
- Forgot/reset password (OTP), profile update (Cloudinary avatar), change password, notification preferences

### Rides
- Create rides (source/destination with Google Maps coordinates, timing, vehicle, price, up to 4 seats, gender preference)
- Search/filter rides with a **Smart Route Matching** engine (women-only safety rule enforced server-side)
- Book (multi-seat, with self-/double-/over-booking prevention), cancel within a grace window, complete, soft-cancel, remove passenger
- My Rides / My Bookings / Ride History

### Payments & Escrow (Razorpay)
- Razorpay order creation + server-side HMAC-SHA256 signature verification
- **Escrow lifecycle**: `held → awaiting_completion → released`, with a 24-hour auto-release sweep and passenger confirm
- **Disputes** freeze escrow; admins resolve by releasing to the driver or refunding the passenger
- **Driver earnings & withdrawals** (available/pending balances, admin-approved payouts), configurable platform commission

### Real-time
- **Chat**: person-based 1:1 conversations merged across shared rides, text + location messages, read receipts, archive/unarchive
- **Live tracking**: Uber/Ola-style states (`scheduled → enroute → arriving → arrived → in_progress → completed`), live location, ETA/distance, proximity auto-state-changes
- **Notifications**: persisted + pushed in real time, unread badges, web push (VAPID)

### Trust & Safety
- **SOS** with emergency contacts + live tracking link
- **Ride check-in & boarding verification** (4-digit code + QR, no-show protection, start-ride gate)
- **Driver & vehicle verification** workflow (document upload, admin review, verified badge)
- Safety reports and ride check-ins

### Intelligence
- **AI assistant** (backend RAG agent + local vector store, tool-calling for ride/search/booking/tracking/payments; graceful fallback to a local engine)
- **Smart recommendation engine** (per-user route profiles, demand insights for drivers, trending routes)
- **Carbon footprint & sustainability** dashboard (CO₂/fuel saved, tree equivalents)

### Admin Panel
- Dashboard metrics, time-series analytics, user management, ride management, payment & escrow overview, dispute resolution, withdrawal approval, review moderation, live monitoring, append-only audit logs, AI insights.

### PWA
- Installable, offline page, service-worker caching strategies, push notifications, install prompt, update flow.

---

## Project Structure

```
.
├── backend/            Express API, Socket.io, models, controllers, AI agent, jobs
│   ├── ai/             RAG agent: providers, vector store, retriever, tools
│   ├── config/         db, redis, jwt, razorpay
│   ├── controllers/    route handlers (auth, rides, payments, admin, safety, ...)
│   ├── middleware/      auth, admin, rate limiting
│   ├── models/         Mongoose schemas
│   ├── routes/         Express routers
│   └── server.js       app entry (HTTP + Socket.io)
├── frontend/           React 19 + Vite SPA (Tailwind), served by nginx in prod
├── e2e/                Playwright end-to-end suite (97 tests)
├── deploy/             nginx load-balancer config
├── docker-compose.yml              local stack (mongo, redis, backend, frontend)
├── docker-compose.scale.yml        2-backend + nginx LB topology
└── docker-compose.dokploy.yml      Traefik/Let's Encrypt deploy target
```

---

## Getting Started

### Prerequisites
- Docker + Docker Compose (recommended), **or** Node.js 20+ and a local MongoDB + Redis.

### 1. Environment variables
Copy the templates and fill in your own values (these files are gitignored and **never** committed):

```bash
# backend
cp backend/.env.example backend/.env        # if present; otherwise create backend/.env

# frontend
cp frontend/.env.example frontend/.env
```

Key backend variables: `MONGO_URI`, `REDIS_URL`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `FRONTEND_URL`, `EMAIL_USER`, `EMAIL_PASS`, `GOOGLE_CLIENT_ID`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and (optional) `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` for web push.

Key frontend variables: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`, `VITE_RAZORPAY_KEY_ID`, `VITE_VAPID_PUBLIC_KEY`.

> Generate a VAPID keypair with: `node -e "console.log(require('web-push').generateVAPIDKeys())"`

### 2. Run with Docker (recommended)

```bash
docker compose up -d --build
```

The app is served at **http://localhost:3000** (frontend nginx, which proxies the API and sockets to the backend).

### 3. Run locally without Docker

```bash
# backend
cd backend && npm install && npm run dev      # http://localhost:5000

# frontend (in another terminal)
cd frontend && npm install && npm run dev      # http://localhost:5173
```

---

## Testing

```bash
# backend unit tests
cd backend && npm test

# frontend unit tests
cd frontend && npm test

# end-to-end (Playwright) — against the running stack
cd e2e && npm install && npx playwright test
```

---

## Deployment

The repo includes `docker-compose.dokploy.yml`, a production target for Dokploy/Coolify (Traefik + Let's Encrypt for automatic HTTPS, no host ports, single origin). Point your domain's DNS at the host, attach it to the `frontend` service (port 80), and provide the production environment variables. See `DEPLOYMENT_READINESS.md` for the full readiness audit and checklist.

For horizontal scaling, `docker-compose.scale.yml` runs two backend instances behind an nginx load balancer with Redis-backed presence, rate limiting, and the Socket.io adapter.

---

## Security Notes
- Auth tokens are stored in **httpOnly cookies** (secure in production), never in localStorage in prod.
- Helmet, global + per-route rate limiting, URL sanitization, JWT algorithm allow-list, and production error-detail stripping are enabled.
- All `.env*` files (including examples/templates) are gitignored — configure secrets locally and via your deploy platform's environment settings.

---

## License
ISC.
