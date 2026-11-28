// meetra service worker: makes the site installable and quick to reopen.
// Pages and page data: network first and always revalidated (the host tells browsers "keep for 10 minutes", we ignore that),
// cached copy only when offline. Site code (hashed file names): cache first. Icons + photos: show the saved copy, refresh it in the background.
// Never touches Supabase or any other site.
// BUILD is stamped on every deploy by scripts/fix-export.mjs ("<unix seconds>-<commit>"), so every deploy gets a new worker and a new cache.
const BUILD = "__BUILD__";
const V = "meetra-" + BUILD;

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
const HASHED = /\/meetra\/_next\/static\//;            // file name changes with every build, so a saved copy is never wrong
const STATIC = /\/meetra\/(icons|images)\//;           // same name can hold a new file after a deploy
const DATA = /\/meetra\/(?:.*\/)?__next\.[^/]*\.txt$/;   // page data the site fetches when you tap between pages
const save = (req, r) => { if (r.ok) { const copy = r.clone(); caches.open(V).then((c) => c.put(req, copy)); } return r; };
// ask the server, not the phone's own 10-minute copy (a "not changed" answer is tiny)
const fresh = (req) => fetch(req, { cache: "no-cache" }).then((r) => save(req, r));

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  // keep this build and the build before it (a tab left open during a deploy may still ask for its code files), delete the rest
  const built = (k) => { const m = /^meetra-(\d+)-/.exec(k); return m ? Number(m[1]) : -1; };
  const others = (await caches.keys()).filter((k) => k !== V).sort((a, b) => built(b) - built(a));
  const keep = others.length && built(others[0]) > 0 ? others[0] : null;
  for (const k of others) if (k !== keep) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith("/meetra/")) return;
  if (HASHED.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => save(req, r))));
  } else if (STATIC.test(url.pathname)) {
    e.respondWith(caches.open(V).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req, { cache: "no-cache" }).then((r) => { if (r.ok) c.put(req, r.clone()); return r; });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net.catch(async () => (await caches.match(req)) || Response.error());
    }));
  } else if (req.mode === "navigate") {
    e.respondWith(fresh(req).catch(async () => (await caches.match(req)) || (await caches.match("/meetra/")) || Response.error()));
  } else if (DATA.test(url.pathname)) {
    e.respondWith(fresh(req).catch(async () => (await caches.match(req)) || Response.error()));
  }
});
