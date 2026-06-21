# RideShare

A full-stack, production-grade carpooling / ride-sharing platform built for a university community. Riders and drivers post and book shared rides, pay securely through an escrow-backed flow, chat and track each other in real time, and stay safe with SOS, ride check-in, and driver verification — all wrapped in a dark, installable PWA.

> Sign-up is restricted to `@paruluniversity.ac.in` email accounts (configurable in code).

This repository contains the two application services:

- **`backend/`** — Node.js + Express REST API, Socket.io real-time layer, MongoDB, Redis, and an AI/RAG agent.
- **`frontend/`** — React 19 + Vite single-page app (Tailwind CSS), installable as a PWA.

---

## Tech Stack

**Backend** — Node.js, Express, MongoDB (Mongoose), Socket.io, Redis (ioredis + Socket.io Redis adapter), Razorpay, Nodemailer, JWT, Google Auth Library, Helmet, web-push.

**Frontend** — React 19, Vite, Tailwind CSS, React Router 7, Axios, Socket.io-client, Google Maps (`@react-google-maps/api`), `@react-oauth/google`, React Toastify, QRCode. Ships as an installable PWA (service worker, offline page, push).

**Testing** — Vitest (unit tests) on both backend and frontend.

---

## Architecture

```
   Browser / PWA
        │   (REST + WebSocket, single origin)
        ▼
 ┌──────────────────┐        ┌──────────┐
 │ backend (Express)│◀──────▶│  Redis   │   cache / presence / socket adapter
 │ REST + Socket.io │        └──────────┘
 └────────┬─────────┘
          │
    ┌─────▼─────┐
    │  MongoDB  │   users, rides, payments, escrow, chat, reviews, ...
    └───────────┘
```

In production the React build is served by a static web server that also reverse-proxies `/api` and `/socket.io` to the backend, so the whole app runs from a single origin — which is what the httpOnly auth cookies need.

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
├── backend/                Express API + Socket.io + AI agent
│   ├── ai/                 RAG agent: providers, vector store, retriever, tools
│   ├── config/             db, redis, jwt, razorpay
│   ├── controllers/        route handlers (auth, rides, payments, admin, safety, ...)
│   ├── middleware/         auth, admin, rate limiting
│   ├── models/             Mongoose schemas
│   ├── routes/             Express routers
│   ├── jobs/               background jobs (escrow auto-release, personal rides)
│   ├── utils/              helpers (notify, escrow, fares, route match, ...)
│   └── server.js           app entry (HTTP + Socket.io)
└── frontend/               React 19 + Vite SPA (Tailwind)
    ├── public/             PWA manifest, service worker, icons, offline page
    └── src/
        ├── components/     UI (rides, chat, tracking, admin, safety, ...)
        ├── pages/          top-level routes
        ├── context/        React context (sockets, auth, maps)
        ├── services/       API clients
        └── utils/          helpers (axios config, auth token, maps, pwa)
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- A MongoDB instance (local or hosted)
- A Redis instance (optional — the app degrades gracefully to in-memory if absent)

### 1. Backend

```bash
cd backend
npm install
```

Create a `backend/.env` file with at least:

```env
MONGO_URI=mongodb://127.0.0.1:27017/RIDESHARE
REDIS_URL=redis://127.0.0.1:6379         # optional
PORT=5000
NODE_ENV=development
JWT_SECRET=<random-32+-char-secret>
REFRESH_TOKEN_SECRET=<different-random-secret>
FRONTEND_URL=http://localhost:5173
EMAIL_USER=<gmail-address>
EMAIL_PASS=<gmail-app-password>
GOOGLE_CLIENT_ID=<google-oauth-web-client-id>
RAZORPAY_KEY_ID=<razorpay-key-id>
RAZORPAY_KEY_SECRET=<razorpay-key-secret>
# Optional web push:
# VAPID_PUBLIC_KEY=...
# VAPID_PRIVATE_KEY=...
# VAPID_SUBJECT=mailto:you@example.com
```

> Generate auth secrets: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
> Generate a VAPID keypair: `node -e "console.log(require('web-push').generateVAPIDKeys())"`

Run it:

```bash
npm run dev      # nodemon, http://localhost:5000
# or: npm start
```

### 2. Frontend

```bash
cd frontend
npm install
```

Create a `frontend/.env` file:

```env
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_CLIENT_ID=<same-as-backend-GOOGLE_CLIENT_ID>
VITE_GOOGLE_MAPS_API_KEY=<google-maps-js-api-key>
VITE_CLOUDINARY_CLOUD_NAME=<cloudinary-cloud-name>
VITE_CLOUDINARY_UPLOAD_PRESET=<unsigned-upload-preset>
VITE_RAZORPAY_KEY_ID=<same-as-backend-RAZORPAY_KEY_ID>
# VITE_VAPID_PUBLIC_KEY=<same-public-key-as-backend>
```

Run it:

```bash
npm run dev      # Vite, http://localhost:5173
```

The frontend talks to the backend at `VITE_API_URL`.

---

## Testing

```bash
# backend unit tests
cd backend && npm test

# frontend unit tests
cd frontend && npm test
```

---

## Environment Variables Reference

**Backend** (`backend/.env`): `MONGO_URI`, `REDIS_URL`, `PORT`, `NODE_ENV`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `FRONTEND_URL`, `TRUST_PROXY`, `ADMIN_EMAILS`, `EMAIL_USER`, `EMAIL_PASS`, `GOOGLE_CLIENT_ID`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `PLATFORM_COMMISSION_PERCENT`, `ESCROW_AUTO_RELEASE_HOURS`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

**Frontend** (`frontend/.env`): `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`, `VITE_RAZORPAY_KEY_ID`, `VITE_VAPID_PUBLIC_KEY`.

---

## Security Notes
- Auth tokens are stored in **httpOnly cookies** (secure in production), never in localStorage in prod.
- Helmet, global + per-route rate limiting, URL sanitization, JWT algorithm allow-list, and production error-detail stripping are enabled.
- All `.env*` files are gitignored — configure secrets locally and via your deploy platform's environment settings. Never commit real secrets.

---

## License
ISC.
