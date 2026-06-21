# RideShare

RideShare is a full-stack carpooling and ride-sharing platform built for a university community. It lets students and faculty share rides going the same way — drivers post trips, riders book a seat, and everyone splits the cost. The goal is simple: make everyday travel cheaper, safer, greener, and more social than riding alone.

## What it does

People heading in the same direction rarely find each other. RideShare connects them. A driver creates a ride with their route, time, available seats, and price per seat. Riders search for trips going their way, book a seat, pay securely, and track the ride in real time. Payments are held safely until the trip is done, both sides rate each other, and built-in safety tools are there if anything goes wrong.

## Why it exists

- **Save money** — split fuel costs instead of paying full fare for solo cabs.
- **Cut traffic and emissions** — fewer cars on the same route, with a dashboard that shows the CO₂ and fuel each user has saved.
- **Travel safely** — verified drivers, ride check-in with a boarding code, live tracking, SOS alerts, and a women-only ride option.
- **Stay connected** — chat, live location, and a community of people from the same campus.

## Main features

- **Accounts** — university-email sign-up with OTP verification and Google Sign-In.
- **Rides** — create, search, and book shared rides with smart route matching and seat management.
- **Secure payments** — online payments with an escrow system that holds money until the ride is completed, plus driver earnings and withdrawals.
- **Real-time experience** — live ride tracking, in-app chat, and instant notifications.
- **Safety & trust** — driver/vehicle verification, ride check-in codes, no-show protection, SOS with emergency contacts, and reviews/ratings.
- **Smart assistant** — an AI helper that answers questions and can search, book, and track rides through conversation.
- **Recommendations** — personalized ride suggestions for riders and demand insights for drivers.
- **Sustainability** — a carbon-footprint dashboard showing the impact of sharing rides.
- **Admin panel** — full management of users, rides, payments, disputes, withdrawals, reviews, and analytics.
- **Installable app (PWA)** — works on mobile like a native app, with offline support and push notifications.

## Tech stack

- **Backend** — Node.js, Express, MongoDB, Socket.io, Redis
- **Frontend** — React, Vite, Tailwind CSS
- **Integrations** — Razorpay (payments), Google Maps, Google OAuth, Cloudinary

## Project structure

- `backend/` — the API server, real-time layer, database models, and AI assistant
- `frontend/` — the React web app (also installable as a PWA)
