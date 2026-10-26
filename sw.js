/* Mind log service worker.
   build.mjs copies this to dist/sw.js and fills in the two placeholders below.

   - App files are cached when the worker installs, so the app opens with no connection.
   - The page itself is "network first": online you always get the newest version, offline you get the saved one.
   - Google Fonts are saved the first time they load, so the look survives offline too.
   - Your entries never touch this cache; they live in localStorage. */
const BUILD_ID = "b56b05fe3c";
const PRECACHE = [
  "./assets/app-DFMEXLVT.js",
  "./assets/app-W2V2KSL2.css",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/favicon-64.png",
  "./index.html",
  "./manifest.webmanifest"
];

const CACHE = `mind-log-${BUILD_ID}`;
const FONT_CACHE = "mind-log-fonts-v1";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
const INDEX = new URL("./index.html", self.location).href;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: "reload" skips the browser's HTTP cache so we never store a stale copy
    await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith("mind-log-") && n !== CACHE && n !== FONT_CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (FONT_HOSTS.includes(url.hostname)) { event.respondWith(staleWhileRevalidate(event, FONT_CACHE)); return; }
  if (url.origin !== self.location.origin) return; // anything else off-site: leave it to the network

  if (req.mode === "navigate") { event.respondWith(page(req)); return; }
  event.respondWith(cacheFirst(req));
});

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

// The app is a single page, so every navigation inside the scope gets the same shell.
async function page(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(req, { cache: "no-cache" }), 4000);
    if (res.ok) { cache.put(INDEX, res.clone()); return res; }
  } catch (e) { /* offline or slow: fall back to the saved copy */ }
  return (await cache.match(INDEX)) || Response.error();
}

// Built files have a hash in their name, so a saved copy is always the right one.
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(event, cacheName) {
  const req = event.request;
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const refresh = fetch(req).then((res) => {
    if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (hit) { event.waitUntil(refresh); return hit; }
  return (await refresh) || Response.error();
}
