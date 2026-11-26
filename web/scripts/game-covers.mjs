// Generates retro-style cover art for every game: public/images/games/<id>.svg
// Run: node scripts/game-covers.mjs   (re-run after adding a game in src/lib/games.ts)
import fs from "node:fs"; import path from "node:path";

const src = fs.readFileSync(path.resolve("src/lib/games.ts"), "utf8");
// pick id / name / colour / emoji-or-icon out of the DECKS and PARTY lists
const games = [];
const re = /id:\s*"([^"]+)",\s*name:\s*"([^"]+)"[\s\S]*?color:\s*"(#[0-9A-Fa-f]{6})"[^\n]*?(?:emoji|icon):\s*"([^"]+)"|id:\s*"([^"]+)",\s*name:\s*"([^"]+)"[^\n]*?icon:\s*"([^"]+)"[^\n]*?color:\s*"(#[0-9A-Fa-f]{6})"/g;
for (const m of src.matchAll(re)) {
  if (m[1]) games.push({ id: m[1], name: m[2], color: m[3], icon: m[4] });
  else games.push({ id: m[5], name: m[6], icon: m[7], color: m[8] });
}
const seen = new Set(); const list = games.filter((g) => !seen.has(g.id) && seen.add(g.id));

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)))); return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join(""); };
const INK = "#16122B";
const ACCENTS = ["#FF4F87", "#6C4CF5", "#FF7A3D", "#1BB78A", "#2E8BFF", "#FFC93C"];

function wrap(name, max = 12) {
  const words = name.toUpperCase().split(/\s+/); const lines = [""];
  for (const w of words) { const cur = lines[lines.length - 1]; if ((cur + " " + w).trim().length > max && cur) lines.push(w); else lines[lines.length - 1] = (cur + " " + w).trim(); }
  return lines.slice(0, 3);
}

function svg(g, i) {
  const bg = g.color.toUpperCase() === INK ? "#2A2347" : g.color;
  const dark = shade(bg, -0.28), light = shade(bg, 0.35), acc = ACCENTS[i % ACCENTS.length];
  const rays = Array.from({ length: 18 }, (_, k) => { const a1 = (k * 20) * Math.PI / 180, a2 = (k * 20 + 10) * Math.PI / 180; return `<path d="M200 210 L${200 + 700 * Math.cos(a1)} ${210 + 700 * Math.sin(a1)} L${200 + 700 * Math.cos(a2)} ${210 + 700 * Math.sin(a2)} Z"/>`; }).join("");
  const lines = wrap(g.name); const fs = lines.some((l) => l.length > 10) ? 38 : 46;
  const title = lines.map((l, k) => `<text x="200" y="${388 + k * (fs + 4) - (lines.length - 1) * (fs + 4) / 2}">${esc(l)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="400" height="500">
<defs>
  <pattern id="dots" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="${INK}" opacity=".16"/></pattern>
  <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#fff" opacity=".07"/></pattern>
  <clipPath id="card"><rect x="0" y="0" width="400" height="500" rx="28"/></clipPath>
</defs>
<g clip-path="url(#card)">
  <rect width="400" height="500" fill="${bg}"/>
  <g fill="${light}" opacity=".55">${rays}</g>
  <rect width="400" height="500" fill="url(#dots)"/>
  <circle cx="200" cy="210" r="112" fill="${dark}" />
  <circle cx="200" cy="210" r="100" fill="${INK}"/>
  <circle cx="200" cy="210" r="92" fill="${acc}"/>
  <circle cx="200" cy="210" r="92" fill="url(#dots)"/>
  <text x="200" y="244" font-size="96" text-anchor="middle" font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif">${esc(g.icon)}</text>
  <rect x="0" y="318" width="400" height="182" fill="${INK}"/>
  <rect x="0" y="318" width="400" height="10" fill="${acc}"/>
  <rect x="0" y="332" width="400" height="5" fill="${light}"/>
  <g font-family="'Arial Black','Archivo Black',Impact,'Helvetica Neue',sans-serif" font-weight="900" font-size="${fs}" text-anchor="middle" letter-spacing="1">
    <g fill="${acc}" transform="translate(4 4)">${title}</g>
    <g fill="#FFF7EC">${title}</g>
  </g>
  <text x="24" y="474" font-family="Georgia,'Times New Roman',serif" font-style="italic" font-weight="700" font-size="22" fill="#FFF7EC">meetra<tspan fill="${acc}">.</tspan></text>
  <text x="376" y="474" text-anchor="end" font-family="'Courier New',monospace" font-weight="700" font-size="15" fill="${light}">GAME NO. ${String(i + 1).padStart(2, "0")}</text>
  <rect width="400" height="500" fill="url(#scan)"/>
  <rect x="6" y="6" width="388" height="488" rx="24" fill="none" stroke="${INK}" stroke-width="6"/>
</g>
</svg>`;
}

const out = path.resolve("public/images/games"); fs.mkdirSync(out, { recursive: true });
list.forEach((g, i) => fs.writeFileSync(path.join(out, `${g.id}.svg`), svg(g, i)));
console.log(`${list.length} covers → public/images/games`);
