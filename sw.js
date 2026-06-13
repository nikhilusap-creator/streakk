const CACHE = "streakk-v14";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./logo.png",
  "./icon-32.png",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  if (e.request.url.includes("twelvedata.com") || e.request.url.includes("fonts.google") || e.request.url.includes("cloudflare")) {
    e.respondWith(fetch(e.request).catch(() => new Response("", {status:503})));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
    .catch(() => caches.match("./index.html"))
  );
});
