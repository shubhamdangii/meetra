// Draws the meetra app icon ("m." on ink) as PNGs for the web app manifest. Run once: node scripts/make-icons.mjs
import zlib from "node:zlib"; import fs from "node:fs";
const INK = [22, 18, 43], SUN = [255, 201, 60], PINK = [255, 79, 135];
function draw(N, pad) {             // pad = safe-zone fraction for maskable icons
  const px = Buffer.alloc(N * N * 4), S = 4;   // 4x4 supersampling
  const u = (v) => v * N, inner = 1 - 2 * pad;
  const P = (x) => u(pad + x * inner);         // map 0..1 icon space into the safe zone
  const t = 0.11, r = 0.13, x0 = 0.2, ya = 0.42, yb = 0.74;   // stroke, arch radius, left x, arch y, baseline
  const stems = [x0, x0 + 2 * r, x0 + 4 * r], arches = [x0 + r, x0 + 3 * r];
  const inM = (x, y) => {
    for (const sx of stems) if (Math.abs(x - sx) <= t / 2 && y >= ya && y <= yb) return true;
    for (const cx of arches) { const d = Math.hypot(x - cx, y - ya); if (y <= ya && Math.abs(d - r) <= t / 2) return true; }
    return false;
  };
  const inDot = (x, y) => Math.hypot(x - (x0 + 4 * r + 0.13), y - (yb - 0.055)) <= 0.065;
  for (let py = 0; py < N; py++) for (let qx = 0; qx < N; qx++) {
    let c = [0, 0, 0];
    for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) {
      const X = (qx + (a + 0.5) / S), Y = (py + (b + 0.5) / S);
      const x = (X / N - pad) / inner, y = (Y / N - pad) / inner;
      const col = inM(x, y) ? SUN : inDot(x, y) ? PINK : INK;
      c = c.map((v, i) => v + col[i]);
    }
    const o = (py * N + qx) * 4; px[o] = c[0] / S / S; px[o + 1] = c[1] / S / S; px[o + 2] = c[2] / S / S; px[o + 3] = 255;
  }
  return png(N, px);
}
function png(N, rgba) {
  const raw = Buffer.alloc((N * 4 + 1) * N);
  for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; rgba.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4); }
  const tbl = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tbl[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = tbl[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const h = Buffer.alloc(13); h.writeUInt32BE(N, 0); h.writeUInt32BE(N, 4); h[8] = 8; h[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", h), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
fs.mkdirSync("public/icons", { recursive: true });
fs.writeFileSync("public/icons/icon-192.png", draw(192, 0.04));
fs.writeFileSync("public/icons/icon-512.png", draw(512, 0.04));
fs.writeFileSync("public/icons/maskable-512.png", draw(512, 0.14));
fs.writeFileSync("public/icons/apple-touch-icon.png", draw(180, 0.06));
