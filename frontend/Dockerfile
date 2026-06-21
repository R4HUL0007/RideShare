# ---- RideShare frontend (React + Vite, served by nginx) ----
# Multi-stage: build the static bundle with Node, then serve it with nginx.

# Vite inlines VITE_* vars at BUILD time, so they must be present during the
# build. They're passed as build args from docker-compose and exposed as env.
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_URL
ARG VITE_GOOGLE_MAPS_API_KEY
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_CLOUDINARY_CLOUD_NAME
ARG VITE_CLOUDINARY_UPLOAD_PRESET
ARG VITE_RAZORPAY_KEY_ID
ARG VITE_VAPID_PUBLIC_KEY
ENV VITE_API_URL=$VITE_API_URL \
    VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_CLOUDINARY_CLOUD_NAME=$VITE_CLOUDINARY_CLOUD_NAME \
    VITE_CLOUDINARY_UPLOAD_PRESET=$VITE_CLOUDINARY_UPLOAD_PRESET \
    VITE_RAZORPAY_KEY_ID=$VITE_RAZORPAY_KEY_ID \
    VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- serve ----
FROM nginx:1.27-alpine AS serve
# SPA routing config (history fallback to index.html).
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
