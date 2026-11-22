// meetra service worker: makes the site installable and quick to reopen.
// Pages: network first (always fresh), cached copy only when offline. Static files + photos: cache first.
// Never touches Supabase or any other site.
const V = "meetra-v2";

// Admin phone alerts (sent by the admin-push function)
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: "meetra", body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "meetra admin", {
    body: d.body || "", tag: d.tag, renotify: true, icon: "/meetra/icons/icon-192.png", badge: "/meetra/icons/icon-192.png",
    data: { url: d.url || "/meetra/admin/" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const raw = (e.notification.data && (e.notification.data.url || e.notification.data.link)) || "/meetra/admin/";
  const url = raw.startsWith("/admin") ? "/meetra" + raw : raw;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if (c.url.includes("/meetra/")) { await c.focus(); return c.navigate(url).catch(() => self.clients.openWindow(url)); }
    return self.clients.openWindow(url);
  })());
});
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
