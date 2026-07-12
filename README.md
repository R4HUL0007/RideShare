# RideShare

RideShare is a full-stack carpooling and ride-sharing platform built for a university community. It lets students and faculty share rides going the same way — drivers post trips, riders book a seat, and everyone splits the cost. The goal is simple: make everyday travel cheaper, safer, greener, and more social than riding alone.

## 🚀 Live Demo

**Try it now → [ridexshare.online](https://ridexshare.online)**

- **Web app:** https://ridexshare.online
- **API:** https://api.ridexshare.online

> Installable as a PWA — open the site on your phone and "Add to Home Screen" for a native-app experience.

## What it does

People heading in the same direction rarely find each other. RideShare connects them. A driver creates a ride with their route, time, available seats, and price per seat. Riders search for trips going their way, book a seat, pay securely, and track the ride in real time. Payments are held safely until the trip is done, both sides rate each other, and built-in safety tools are there if anything goes wrong.

## Why it exists

- **Save money** — split fuel costs instead of paying full fare for solo cabs.
- **Cut traffic and emissions** — fewer cars on the same route, with a dashboard that shows the CO₂ and fuel each user has saved.
- **Travel safely** — verified drivers, ride check-in with a boarding code, live tracking, SOS alerts, and a women-only ride option.
- **Stay connected** — chat, live location, and a community of people from the same campus.

## How it works

**For riders**
1. Sign up with your university email and verify it with a one-time code.
2. Search for rides going your way (or post a request and let nearby drivers come to you).
3. Book a seat and pay securely — your payment is held safely until the trip is done.
4. Track the ride live on the map, verify boarding with a code, and rate your driver at the end.

**For drivers**
1. Sign up, add your vehicle, and complete driver verification.
2. Create a ride with your route, time, seats, and price per seat.
3. Accept bookings, pick up your riders (verified by a boarding code), and drive.
4. Earnings are released after the trip and can be withdrawn to your bank/UPI.

> Phone verification is required the first time you create or book a ride, so everyone on the platform is contactable and trusted.

## Main features

- **Accounts** — university-email sign-up with email OTP verification, optional **phone verification via SMS OTP**, and Google Sign-In.
- **Rides** — create, search, and book shared rides with smart route matching and seat management; plus on-demand **personal ride requests** (Uber-style) that alert nearby drivers.
- **Secure payments** — online payments with an escrow system that holds money until the ride is completed, auto-release protection window, disputes, and driver earnings + withdrawals.
- **Real-time experience** — live ride tracking, in-app chat, and instant notifications over Socket.IO.
- **Safety & trust** — driver/vehicle verification, ride check-in codes, no-show protection, **SOS with emergency contacts + live trip sharing**, and reviews/ratings.
- **Privacy & moderation** — **contact numbers are masked** until a booking is confirmed, and chat automatically blocks shared phone numbers and abusive/violent language.
- **Smart assistant** — an AI helper that answers questions and can search, book, and track rides through conversation (with content safeguards).
- **Recommendations** — personalized ride suggestions based on your location, time, and travel habits, plus recent searches and favourite places.
- **Sustainability** — a carbon-footprint dashboard showing the impact of sharing rides.
- **Admin panel** — full management of users, rides, payments, disputes, withdrawals, reviews, audit logs, and analytics.
- **Installable app (PWA)** — works on mobile like a native app, with offline support and push notifications.

## Tech stack

- **Backend** — Node.js, Express, MongoDB (Mongoose), Socket.IO, Redis
- **Frontend** — React 19, Vite, Tailwind CSS, Google Maps
- **Integrations** — Razorpay (payments), Google Maps + OAuth, Cloudinary (media), Message Central / APITxT (SMS OTP)

## Deployment

- **Frontend** — Cloudflare Pages (auto-deploys from `main`)
- **Backend** — Northflank (auto-deploys from `main`)
- **Database** — MongoDB Atlas

## Project structure

- `backend/` — the API server, real-time layer, database models, and AI assistant
- `frontend/` — the React web app (also installable as a PWA)

## Testing

- **Backend** — `cd backend && npm test` (Vitest: unit + integration, incl. full money-path state verification)
- **End-to-end** — `cd e2e && npx playwright test` (auth, rides, payments/escrow, notifications, chat, safety, admin, security, rate-limiting)

## Learn more

- **About** — https://ridexshare.online/about
- **Privacy Policy** — https://ridexshare.online/privacy
- **Terms of Service** — https://ridexshare.online/terms
- **Feedback / contact** — https://ridexshare.online/feedback

## FAQ

**Who can use RideShare?** Verified members of the university community — everyone signs up with a university email.

**How is it safe?** Verified drivers, boarding codes, live tracking, SOS with emergency contacts, masked contact numbers until a booking is confirmed, and moderated chat.

**How are payments handled?** Securely online, with funds held in escrow until the ride is completed. Drivers withdraw their earnings to bank/UPI.

**Is it free?** Yes to use — riders simply split the travel cost with the driver.
