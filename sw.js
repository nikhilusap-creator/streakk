const CACHE = "streakk-v8";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
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
  // Never cache API calls — always go to network for stock data
  if (e.request.url.includes("yahoo.com") || e.request.url.includes("corsproxy") || e.request.url.includes("allorigins")) {
    e.respondWith(fetch(e.request).catch(() => new Response("", {status: 503})));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(r => {
      if (e.request.method === "GET" && r.status === 200) {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return r;
    })).catch(() => caches.match("./index.html"))
  );
});
