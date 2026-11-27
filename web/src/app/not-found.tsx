"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const ROUTES = ["event", "events", "ticket", "saved", "profile", "host", "host-profile", "login", "admin", "swipe", "games", "game", "about", "past", "partners"];

export default function NotFound() {
  const [path, setPath] = useState("");
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    // repair common broken links: missing trailing slash, doubled base path, missing base path
    let p = pathname.replace(new RegExp(`^(${BASE})+`), BASE);
    if (BASE && !p.startsWith(BASE + "/")) p = BASE + (p.startsWith("/") ? p : "/" + p);
    const seg = p.slice(BASE.length).split("/").filter(Boolean)[0] ?? "";
    if (ROUTES.includes(seg) && !p.endsWith("/")) p += "/";
    if (p !== pathname && ROUTES.includes(seg)) { window.location.replace(p + search + hash); return; }
    setPath(pathname + search);
  }, []);
  return (
    <div className="wrap">
      <section className="page-hero" style={{ textAlign: "center", padding: "90px 0" }}>
        <div style={{ fontSize: 110, lineHeight: 1, marginBottom: 20 }}>🫥</div>
        <h1>404. This table&apos;s <span className="serif">empty.</span></h1>
        <p style={{ margin: "18px auto 28px" }}>The page you&apos;re looking for isn&apos;t here, but there&apos;s a plan on tonight.</p>
        <Link className="btn btn-sun" href="/events/">See what&apos;s on →</Link>
        {path && <p className="muted" style={{ marginTop: 22, fontSize: 12, overflowWrap: "anywhere" }}>Missing page: {path}</p>}
      </section>
    </div>
  );
}
