// Fake GitHub Pages for the service worker tests.
// Serves the built site (web/out) under /meetra/ with the same cache header GitHub Pages sends: max-age=600.
// A "deploy" is simulated by switching version: files in the version's overlay folder replace the ones in out/.
import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";

export type Version = "v1" | "v2";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};

export function startFakePages(outDir: string, overlays: Record<Version, string>) {
  let version: Version = "v1";
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let p = decodeURIComponent(url.pathname);
    if (p === "/meetra") { res.writeHead(302, { Location: "/meetra/" }); return res.end(); }
    if (!p.startsWith("/meetra/")) { res.writeHead(404); return res.end("not found"); }
    p = p.slice("/meetra".length);
    if (p.endsWith("/")) p += "index.html";
    const pick = (root: string) => { const f = path.join(root, p); return f.startsWith(root) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null; };
    let file = pick(overlays[version]) ?? pick(outDir);
    let status = 200;
    if (!file) { file = path.join(outDir, "404.html"); status = 404; if (!fs.existsSync(file)) { res.writeHead(404); return res.end("not found"); } }
    let body = fs.readFileSync(file);
    const ext = path.extname(file);
    // The production CSP says upgrade-insecure-requests; on plain http://localhost WebKit would turn every request into https.
    if (ext === ".html") body = Buffer.from(body.toString("utf8").replace(/;?\s*upgrade-insecure-requests/g, ""));
    const etag = `"${crypto.createHash("md5").update(body).digest("hex")}"`;
    const headers = { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "max-age=600", ETag: etag };
    if (status === 200 && req.headers["if-none-match"] === etag) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(status, headers);
    res.end(body);
  });
  return {
    setVersion(v: Version) { version = v; },
    listen: () => new Promise<string>((resolve) => server.listen(0, "127.0.0.1", () => {
      const addr = server.address(); resolve(`http://localhost:${typeof addr === "object" && addr ? addr.port : 0}`);
    })),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
