/* =======================================================
   RidexShare Service Worker
   -------------------------------------------------------
   - Precaches the app shell + offline page.
   - Runtime caching strategies:
       • Cache-first        → static assets (JS/CSS/fonts/images)
       • Network-first      → navigations + API GETs (fresh, offline fallback)
       • Stale-while-revalidate → frequently-read GET endpoints
   - Web Push: shows notifications + deep-links on click.
   - Background Sync: future-ready hooks (chat/notification/ride sync).
   ======================================================= */

const VERSION = "v1.7.9";
const STATIC_CACHE = `rs-static-${VERSION}`;
const RUNTIME_CACHE = `rs-runtime-${VERSION}`;
const IMAGE_CACHE = `rs-images-${VERSION}`;
const OFFLINE_URL = "/offline.html";

// App-shell resources known up front. Hashed build assets are cached at runtime.
const PRECACHE_URLS = [
    "/",
    "/offline.html",
    "/manifest.webmanifest",
    "/favicon.svg",
    "/icons/icon.svg",
];

// ---- Install: precache the shell ----
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => { /* tolerate missing */ }))
            .then(() => self.skipWaiting())
    );
});

// ---- Activate: clean up old caches ----
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((k) => ![STATIC_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(k)).map((k) => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// Allow the page to trigger an immediate update.
self.addEventListener("message", (event) => {
    if (event.data === "SKIP_WAITING") self.skipWaiting();
});

const isStaticAsset = (url) =>
    /\.(?:js|css|woff2?|ttf|eot)$/.test(url.pathname) ||
    url.pathname.startsWith("/assets/");

const isImage = (url) =>
    /\.(?:png|jpg|jpeg|gif|svg|webp|ico)$/.test(url.pathname);

const isApi = (url) => url.pathname.startsWith("/api/");

// SECURITY: API responses are per-user and auth-dependent. The service-worker
// cache is keyed only by URL, so caching them would serve one user's data to
// the next user on the same browser (cross-user data leak). We therefore NEVER
// cache any /api/ response — they always go straight to the network with the
// caller's own credentials.

// ---- Fetch routing ----
self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return; // never cache mutations

    const url = new URL(request.url);
    const sameOrigin = url.origin === self.location.origin;

    // SPA navigations → network-first with offline fallback.
    if (request.mode === "navigate") {
        event.respondWith(networkFirstNavigation(request));
        return;
    }

    if (!sameOrigin) {
        // Cross-origin (maps tiles, cloudinary): cache-first for images only.
        if (isImage(url)) event.respondWith(cacheFirst(request, IMAGE_CACHE));
        return;
    }

    if (isStaticAsset(url)) {
        event.respondWith(cacheFirst(request, STATIC_CACHE));
        return;
    }
    if (isImage(url)) {
        event.respondWith(cacheFirst(request, IMAGE_CACHE));
        return;
    }
    if (isApi(url)) {
        // Never cache API responses — pass through to the network so each
        // request is authenticated as the CURRENT user (prevents cross-user
        // data being served from a URL-keyed cache).
        return;
    }
});

// ---- Strategies ----
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
        const res = await fetch(request);
        // Guard against SPA-fallback poisoning: after a redeploy a missing
        // hashed asset makes the host return index.html (200, text/html). We
        // must NEVER cache that under a JS/CSS URL — it would permanently break
        // module scripts (MIME mismatch) and trap the app in a reload loop.
        // Let the response through so the app's stale-chunk recovery can reload
        // to fresh HTML, but don't persist the bad body.
        const type = (res && res.headers.get("content-type")) || "";
        const isJsCss = /\.(?:js|css)$/.test(new URL(request.url).pathname);
        const htmlFallback = isJsCss && type.includes("text/html");
        if (res && res.ok && !htmlFallback) cache.put(request, res.clone());
        return res;
    } catch {
        return cached || Response.error();
    }
}

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const res = await fetch(request);
        if (res && res.ok) cache.put(request, res.clone());
        return res;
    } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ offline: true, message: "You are offline." }), {
            status: 503, headers: { "Content-Type": "application/json" },
        });
    }
}

async function networkFirstNavigation(request) {
    try {
        // Always fetch the freshest HTML (bypass the HTTP cache for the
        // navigation document) so a new deploy's asset hashes are picked up
        // immediately — otherwise a reload can re-serve stale index.html that
        // still points at deleted chunks, causing an endless reload loop.
        const res = await fetch(request, { cache: "no-store" });
        return res;
    } catch {
        const cache = await caches.open(STATIC_CACHE);
        const offline = await cache.match(OFFLINE_URL);
        return offline || new Response("Offline", { status: 503 });
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const network = fetch(request)
        .then((res) => { if (res && res.ok) cache.put(request, res.clone()); return res; })
        .catch(() => null);
    return cached || (await network) || new Response(JSON.stringify({ offline: true }), {
        status: 503, headers: { "Content-Type": "application/json" },
    });
}

// ---- Web Push ----
self.addEventListener("push", (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
    const title = data.title || "RidexShare";
    const options = {
        body: data.body || data.message || "",
        icon: "/icons/icon.svg",
        badge: "/icons/icon.svg",
        tag: data.tag || "rideshare",
        data: { url: data.url || urlForType(data.type), ...data },
        vibrate: [80, 40, 80],
        renotify: Boolean(data.tag),
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const target = (event.notification.data && event.notification.data.url) || "/dashboard";
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
            for (const client of list) {
                if ("focus" in client) {
                    client.navigate?.(target);
                    return client.focus();
                }
            }
            return self.clients.openWindow(target);
        })
    );
});

// Map a notification "type" to an in-app route (deep link).
function urlForType(type) {
    switch (type) {
        case "chat": return "/chats";
        case "booking": return "/my-bookings";
        case "ride": return "/my-rides";
        case "tracking": return "/my-bookings";
        case "payment": return "/payments";
        case "safety": return "/safety";
        default: return "/dashboard";
    }
}

// ---- Background Sync (future-ready) ----
self.addEventListener("sync", (event) => {
    if (event.tag === "rs-sync-notifications" || event.tag === "rs-sync-chat" || event.tag === "rs-sync-rides") {
        // Placeholder: when offline mutations are queued, replay them here.
        // Kept as a clean extension point so the architecture is ready.
        event.waitUntil(Promise.resolve());
    }
});
