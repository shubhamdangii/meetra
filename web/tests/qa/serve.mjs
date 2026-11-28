// Tiny static server: serves web/out at http://localhost:3100/meetra/ (same base path as GitHub Pages).
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../out");
const port = Number(process.env.QA_PORT || 3100);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain", ".mp4": "video/mp4" };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (!p.startsWith("/meetra")) { res.writeHead(302, { Location: "/meetra/" }); return res.end(); }
  p = p.slice("/meetra".length) || "/";
  let f = path.join(out, p); if (!f.startsWith(out)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) { const nf = path.join(out, "404.html"); res.writeHead(404, { "content-type": types[".html"] }); return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : "not found"); }
  const type = types[path.extname(f)] || "application/octet-stream";
  if (path.extname(f) === ".html") {
    // The production CSP says "upgrade-insecure-requests"; on plain http://localhost WebKit then turns every request into https and fails.
    // The real site is https, so this only removes a local-testing problem.
    res.writeHead(200, { "content-type": type }); return res.end(fs.readFileSync(f, "utf8").replace(/;?\s*upgrade-insecure-requests/g, ""));
  }
  res.writeHead(200, { "content-type": type }); fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log("QA site on http://localhost:" + port + "/meetra/"));
