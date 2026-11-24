// Scans public/images and writes src/lib/image-manifest.json  { events: {"<Event type folder>": [files]}, hero: [], gallery: [] }
// Every folder in public/images/events is an event type (its exact name is shown to hosts and admins), even if it has no photos yet.
import fs from "node:fs"; import path from "node:path";
const root = path.resolve("public/images");
const ok = /\.(jpe?g|png|webp)$/i;
const list = (d) => fs.existsSync(d) ? fs.readdirSync(d).filter((f) => ok.test(f) && fs.statSync(path.join(d, f)).isFile()).sort() : [];
const m = { events: {}, hero: [], gallery: [] };
const evDir = path.join(root, "events");
for (const k of fs.existsSync(evDir) ? fs.readdirSync(evDir).sort((a, b) => a.localeCompare(b)) : []) {
  if (!fs.statSync(path.join(evDir, k)).isDirectory()) continue;
  const files = list(path.join(evDir, k));
  files.sort((a, b) => (/^cover\./i.test(b) ? 1 : 0) - (/^cover\./i.test(a) ? 1 : 0));
  m.events[k] = files;
}
m.hero = list(path.join(root, "hero")); m.gallery = list(path.join(root, "gallery"));
fs.writeFileSync(path.resolve("src/lib/image-manifest.json"), JSON.stringify(m, null, 1));
