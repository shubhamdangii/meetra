// Next.js 16 static export writes route-segment data as  events/__next.events/__PAGE__.txt
// but the browser requests                               events/__next.events.__PAGE__.txt
// This copies each file to the flat name so instant page-to-page navigation works on GitHub Pages.
import fs from "node:fs";
import path from "node:path";

const out = path.resolve(process.argv[2] ?? "out");
let copied = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("__next.")) flatten(full, dir, entry.name);
    else if (entry.name !== "_next") walk(full);
  }
}

// __next.events/__PAGE__.txt          → __next.events.__PAGE__.txt
// __next.events/sub/__PAGE__.txt      → __next.events.sub.__PAGE__.txt
function flatten(segDir, parent, prefix) {
  for (const entry of fs.readdirSync(segDir, { withFileTypes: true })) {
    const full = path.join(segDir, entry.name);
    if (entry.isDirectory()) flatten(full, parent, `${prefix}.${entry.name}`);
    else {
      const target = path.join(parent, `${prefix}.${entry.name}`);
      if (!fs.existsSync(target)) { fs.copyFileSync(full, target); copied++; }
    }
  }
}

walk(out);
// GitHub Pages: don't run Jekyll (it would hide folders starting with "_", like _next).
fs.writeFileSync(path.join(out, ".nojekyll"), "");
console.log(`fix-export: added ${copied} flat route files, wrote .nojekyll`);
