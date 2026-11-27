/* AION dashboard service worker (T-239).
 *
 * Minimal and deliberately NOT a full offline app: it caches the app shell so
 * the dashboard loads (rather than blank-screening) on a flaky connection, and
 * updates as a complete versioned shell. It never caches /api/ responses -
 * live state must never be served stale - so "offline" means "the shell loads
 * and then shows it cannot reach the server", not "chat works offline".
 *
 * BORDER INSTRUMENT (v10+): "/" is the main page (index.html + line.css,
 * stage.js); the old dashboard moved to /dashboard. An offline navigation gets
 * its own cached page first, then "/".
 * THE LINE (v14): line.css is the page design; scene.js places the night
 * picture (line-hero.*) behind the border and draws its light (no app logic).
 *
 * HYBRID BUILD: the shell also caches standalone.js and hybrid.bundle.js
 * (the Firebase AI Logic code, bundled so it needs no CDN) so the page loads
 * with no network. In standalone mode /api/* is answered inside the page, not
 * by the network, so Offline Demo Mode works with on-device Gemini Nano.
 */
/* VERSIONED SHELL. Bump VERSION on every deploy that changes a shell file.
 * One cache per version: the whole shell is precached atomically (install
 * FAILS if any file cannot be fetched, so a half-filled version never
 * activates), old versions are deleted on activate, and every file served from
 * the cache comes from this one version. Shell files are only ever written to
 * the cache at install time, never at runtime, so a cache cannot mix versions. */
const VERSION = "v16-2026-11-27-the-line-ask";
const CACHE = "aion-hybrid-shell-" + VERSION;

/* hybrid-v2 privacy rule: this worker only ever caches the PUBLIC app shell.
 * It never stores private data, prompts or AI responses:
 *   - AI calls go to firebasevertexai.googleapis.com (cross-origin) -> never
 *     intercepted, never cached;
 *   - tasks, memories and chat live in IndexedDB, not in HTTP responses;
 *   - only GET requests whose path matches CACHEABLE below are written to the
 *     cache, and never when the URL has a query string or the response says
 *     no-store / private. Everything else passes straight to the network. */
const CACHEABLE = [/^\/$/, /^\/index\.html$/, /^\/[a-z.-]+\.(?:css|js|html|webmanifest|jpg|webp)$/, /^\/(?:fonts|icons|vendor)\//];
function cacheable(url, resp) {
  if (url.search) return false;
  if (!CACHEABLE.some((re) => re.test(url.pathname))) return false;
  if (!resp || !resp.ok || resp.type !== "basic") return false;
  const cc = (resp.headers.get("cache-control") || "").toLowerCase();
  return !/no-store|private/.test(cc);
}
/* Served paths. "/" is index.html; /dashboard, /mobile, /approve are clean URLs of the .html files. */
const SHELL = [
  "/",
  "/line.css",
  "/stage.js",
  "/scene.js",
  "/line-hero.webp", "/line-hero-s.webp", "/line-hero.jpg",
  "/dashboard",
  "/mobile",
  "/approve",
  "/style.css",
  "/app.js",
  "/standalone.js",
  "/case.js",
  "/fonts.css",
  "/vendor/chart.umd.min.js",
  "/fonts/geist-latin-300-normal.woff2",
  "/fonts/geist-latin-400-normal.woff2",
  "/fonts/geist-latin-500-normal.woff2",
  "/fonts/geist-latin-600-normal.woff2",
  "/fonts/dm-mono-latin-400-normal.woff2",
  "/fonts/dm-mono-latin-500-normal.woff2",
  "/fonts/instrument-serif-latin-400-normal.woff2",
  "/fonts/instrument-serif-latin-400-italic.woff2",
  "/fonts/barlow-condensed-latin-600-normal.woff2",
  "/hybrid.bundle.js",
  "/scene.jpg",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // Atomic: fetch every shell file fresh; any miss throws, the install
      // fails and the previous worker + cache stay in charge.
      for (const url of SHELL) {
        const resp = await fetch(url, { cache: "reload" });
        if (!resp.ok) throw new Error("precache failed: " + url + " " + resp.status);
        await cache.put(url, resp);
      }
    }).catch((err) => caches.delete(CACHE).then(() => { throw err; }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.indexOf("aion-hybrid-shell-") === 0).map((k) => caches.delete(k))))
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

  // Navigations and shell assets are cache-first. This worker installs only
  // after its complete shell is cached, so HTML cannot be paired with different
  // cached JS/CSS if connectivity drops in the middle of a load.
  if (req.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true })
        .then((hit) => hit || fetch(req).catch(() => c.match("/"))))
    );
    return;
  }

  if (!cacheable(url, { ok: true, type: "basic", headers: new Headers() })) return;
  event.respondWith(
    caches.open(CACHE).then((c) => c.match(req)
      .then((hit) => hit || fetch(req).catch(() => Response.error())))
  );
});
