// meetra service worker: makes the site installable and quick to reopen.
// Pages: network first (always fresh), cached copy only when offline. Static files + photos: cache first.
// Never touches Supabase or any other site.
const V = "meetra-v1";
const STATIC = /\/meetra\/(_next\/static|icons|images)\//;
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith("/meetra/")) return;
  if (STATIC.test(url.pathname)) {
    e.respondWith(caches.open(V).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
  } else if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(V).then((c) => c.put(req, copy)); } return r; })
      .catch(async () => (await caches.match(req)) || (await caches.match("/meetra/")) || Response.error()));
  }
});
