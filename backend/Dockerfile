# ---- RideShare backend (Express + Socket.io) ----
# Pinned Node version so everyone runs the same runtime.
FROM node:20-alpine

WORKDIR /app

# Install production deps first (better layer caching). We omit devDependencies
# so mongodb-memory-server (a test-only dep) never tries to download a binary
# inside the image.
COPY package*.json ./
RUN npm ci --omit=dev

# App source.
COPY . .

# The API + Socket.io listen on 5000.
EXPOSE 5000

ENV NODE_ENV=development

CMD ["node", "server.js"]
