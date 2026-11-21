/* AION dashboard service worker (T-239).
 *
 * Minimal and deliberately NOT a full offline app: it caches the app shell so
 * the dashboard loads (rather than blank-screening) on a flaky connection, and
 * stays current when the network is fine. It never caches /api/ responses -
 * live state must never be served stale - so "offline" means "the shell loads
 * and then shows it cannot reach the server", not "chat works offline".
 *
 * HYBRID BUILD: the shell now also caches standalone.js and hybrid.bundle.js
 * (the Firebase AI Logic code, bundled so it needs no CDN) so the page loads
 * with no network. In standalone mode /api/* is answered inside the page, not
 * by the network, so Offline Demo Mode works with on-device Gemini Nano.
 */
const CACHE = "aion-hybrid-shell-v8";

/* hybrid-v2 privacy rule: this worker only ever caches the PUBLIC app shell.
 * It never stores private data, prompts or AI responses:
 *   - AI calls go to firebasevertexai.googleapis.com (cross-origin) -> never
 *     intercepted, never cached;
 *   - tasks, memories and chat live in IndexedDB, not in HTTP responses;
 *   - only GET requests whose path matches CACHEABLE below are written to the
 *     cache, and never when the URL has a query string or the response says
 *     no-store / private. Everything else passes straight to the network. */
const CACHEABLE = [/^\/$/, /^\/index\.html$/, /^\/[a-z.-]+\.(?:css|js|html|webmanifest|jpg)$/, /^\/(?:fonts|icons|vendor)\//];
function cacheable(url, resp) {
  if (url.search) return false;
  if (!CACHEABLE.some((re) => re.test(url.pathname))) return false;
  if (!resp || !resp.ok || resp.type !== "basic") return false;
  const cc = (resp.headers.get("cache-control") || "").toLowerCase();
  return !/no-store|private/.test(cc);
}
const SHELL = [
  "/",
  "/style.css",
  "/app.js",
  "/standalone.js",
  "/case.js",
  "/fonts.css",
  "/vendor/chart.umd.min.js",
  "/fonts/geist-latin-400-normal.woff2",
  "/fonts/dm-mono-latin-400-normal.woff2",
  "/fonts/instrument-serif-latin-400-normal.woff2",
  "/hybrid.bundle.js",
  "/mobile.html",
  "/approve.html",
  "/scene.jpg",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // addAll fails the whole install if one URL 404s; add individually and
      // tolerate a miss so a renamed asset can't brick the worker.
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only GET, only same-origin, and NEVER /api/ - live data is network-only.
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  // Navigations: try the network, fall back to the cached shell so a flaky
  // connection loads the app instead of a blank screen.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/").then((hit) => hit || caches.match(req)))
    );
    return;
  }

  // Static assets: network-first (so a deploy's new CSS/JS wins), cache on
  // success, fall back to cache when the network is unreachable.
  event.respondWith(
    fetch(req)
      .then((resp) => {
        if (cacheable(url, resp)) {
          const copy = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return resp;
      })
      .catch(() => caches.match(req))
  );
});
