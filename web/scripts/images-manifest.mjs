// Scans public/images and writes src/lib/image-manifest.json  { events: {key:[files]}, hosts: {name:file} }
import fs from "node:fs"; import path from "node:path";
const root = path.resolve("public/images");
const ok = /\.(jpe?g|png|webp)$/i;
const list = (d) => fs.existsSync(d) ? fs.readdirSync(d).filter((f) => ok.test(f)).sort() : [];
const m = { events: {}, hosts: {}, hero: [], gallery: [] };
for (const k of fs.existsSync(path.join(root, "events")) ? fs.readdirSync(path.join(root, "events")) : []) {
  const files = list(path.join(root, "events", k));
  files.sort((a, b) => (/^cover\./i.test(b) ? 1 : 0) - (/^cover\./i.test(a) ? 1 : 0));
  if (files.length) m.events[k] = files;
}
for (const c of ["jaipur", "ahmedabad"]) for (const f of list(path.join(root, "hosts", c))) m.hosts[path.parse(f).name.toLowerCase()] = `hosts/${c}/${f}`;
m.hero = list(path.join(root, "hero")); m.gallery = list(path.join(root, "gallery"));
fs.writeFileSync(path.resolve("src/lib/image-manifest.json"), JSON.stringify(m, null, 1));
