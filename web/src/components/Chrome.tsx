"use client";
// Site header (nav, city picker, account menu), mobile tab bar, profile nudge and footer.
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import { useAuth } from "./AuthProvider";
import { CONFIG } from "@/lib/config";
import { cityName } from "@/lib/events";
import { store } from "@/lib/store";

const LINKS = [
  { key: "events", href: "/events/", label: "Explore", icon: "🔍" },
  { key: "swipe", href: "/swipe/", label: "Discover", icon: "🔥" },
  { key: "past", href: "/past/", label: "Past nights", icon: "📸" },
  { key: "saved", href: "/saved/", label: "Your plans", icon: "♥" },
  { key: "host", href: "/host/", label: "Host", icon: "✨" },
];

function activeKey(path: string) {
  const p = path.replace(/\/+$/, "/");
  if (p === "/" ) return "home";
  if (p.startsWith("/event")) return "events";
  if (p.startsWith("/profile")) return "saved";
  return LINKS.find((l) => p.startsWith(l.href))?.key ?? "";
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open, close]);
  return ref;
}

const menuMotion = {
  initial: { opacity: 0, y: -8, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -6, scale: 0.98 },
  transition: { duration: 0.16 },
};

function CityPicker() {
  const { city, setCity, toast, ready } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="city-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        📍 <span>{ready ? cityName(city) : CONFIG.cities[CONFIG.defaultCity].name}</span> ▾
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="city-menu open" role="menu" style={{ top: 50, right: 0 }} {...menuMotion}>
            {Object.entries(CONFIG.cities).map(([k, c]) => (
              <button key={k} role="menuitem" disabled={!c.live} className={city === k ? "on" : ""}
                onClick={() => { setCity(k); setOpen(false); toast(`📍 Showing ${c.name}`); }}>
                <span>{c.name}</span><small>{c.live ? c.tag : "coming soon"}</small>
              </button>
            ))}
            <button role="menuitem" className={city === "all" ? "on" : ""} onClick={() => { setCity("all"); setOpen(false); toast("📍 Showing all cities"); }}>
              <span>All cities</span><small>everything</small>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AccountSlot() {
  const { enabled, session, me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  if (!enabled) return null;
  if (!session) return <Link className="btn btn-ink btn-sm login-btn" href="/login/">Log in</Link>;
  const name = me?.display_name || "Your account";
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <motion.button whileTap={{ scale: 0.92 }} className={`avatar-btn ${me && me.profile_score < 70 ? "todo" : ""}`} aria-haspopup="menu" aria-expanded={open} aria-label="Your account" onClick={() => setOpen((o) => !o)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {me?.avatar_url ? <img src={me.avatar_url} alt="" /> : name[0]}
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div className="city-menu account-menu open" role="menu" {...menuMotion}>
            <div className="acct-head"><b>{name}</b><small>Profile score {me?.profile_score ?? 0}/100{me?.profile_complete ? " · complete ✓" : ""}</small></div>
            <Link href="/profile/" role="menuitem" onClick={() => setOpen(false)}><span>My profile</span>{me && !me.profile_complete && <small className="dot">●</small>}</Link>
            <Link href="/saved/" role="menuitem" onClick={() => setOpen(false)}><span>Your plans</span></Link>
            <Link href="/swipe/" role="menuitem" onClick={() => setOpen(false)}><span>Discover plans</span></Link>
            {me?.role === "admin" && <Link href="/admin/" role="menuitem" onClick={() => setOpen(false)}><span>Admin</span></Link>}
            <button role="menuitem" onClick={() => { setOpen(false); logout(); }}><span>Log out</span></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProfileNudge() {
  const { session, me } = useAuth();
  const path = usePathname();
  const [hidden, setHidden] = useState(true);
  useEffect(() => { setHidden(store.get("mt-nudge-off", 0) > Date.now()); }, []);
  if (hidden || !session || !me || me.profile_score >= 70 || /\/(profile|admin|login|swipe)\/?$/.test(path)) return null;
  const close = () => { store.set("mt-nudge-off", Date.now() + 3 * 864e5); setHidden(true); }; // back in 3 days
  return (
    <motion.div className="nudge" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}>
      <div className="wrap">
        <span>⭐ Profile {me.profile_score}/100 · fuller profiles get seats first</span>
        <Link className="btn btn-sun btn-sm" href="/profile/">Boost it →</Link>
        <button type="button" className="nudge-x" onClick={close} aria-label="Hide this reminder">×</button>
      </div>
    </motion.div>
  );
}

export function Header() {
  const path = usePathname();
  const active = activeKey(path);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 8);
    f(); window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  return (
    <>
      <header className={`site-header ${scrolled ? "scrolled" : ""}`}>
        <div className="wrap nav">
          <Link className="logo" href="/" aria-label={`${CONFIG.brand} home`}>{CONFIG.brand}<i>.</i></Link>
          <nav className="nav-links" aria-label="Main">
            {LINKS.map((l) => (
              <Link key={l.key} href={l.href} className={active === l.key ? "active" : ""} style={{ position: "relative" }}>
                {active === l.key && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                <span style={{ position: "relative" }}>{l.label}</span>
              </Link>
            ))}
          </nav>
          <div className="nav-right"><CityPicker /><AccountSlot /></div>
        </div>
      </header>
      <ProfileNudge />
      <nav className="tabbar" aria-label="Main (mobile)">
        {[{ key: "home", href: "/", label: "Home", icon: "⌂" }, ...LINKS.filter((l) => l.key !== "past")].map((l) => (
          <Link key={l.key} href={l.href} className={active === l.key ? "active" : ""}><span>{l.icon}</span>{l.label}</Link>
        ))}
      </nav>
    </>
  );
}

export function Footer() {
  const live = Object.values(CONFIG.cities).filter((c) => c.live).map((c) => c.name).join(" & ");
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="foot-grid">
          <div><Link className="logo" href="/" style={{ color: "#fff" }}>{CONFIG.brand}<i>.</i></Link><p>{CONFIG.tagline} Now in {live}.</p></div>
          <div><h5>Explore</h5><Link href="/events/">Find a meetup</Link><Link href="/events/?when=weekend">This weekend</Link><Link href="/swipe/">Discover</Link><Link href="/past/">Past nights</Link></div>
          <div><h5>{CONFIG.brand}</h5><Link href="/about/">How it works</Link><Link href="/about/#safety">Help &amp; safety</Link><Link href="/host/">Host a meetup</Link><Link href="/partners/">For brands &amp; venues</Link></div>
          <div><h5>Say hi</h5><a href={CONFIG.instagram} target="_blank" rel="noopener noreferrer">Instagram</a><a href={CONFIG.whatsappCommunity} target="_blank" rel="noopener noreferrer">WhatsApp community</a><a href={`mailto:${CONFIG.email}`}>{CONFIG.email}</a></div>
        </div>
        <motion.div className="wordmark" aria-hidden="true" initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.9 }}>
          {CONFIG.brand}<i>.</i>
        </motion.div>
        <div className="foot-bottom"><span>© {new Date().getFullYear()} {CONFIG.brand}. Made with chai in {live}.</span><span><Link href="/about/#terms">Terms</Link> · <Link href="/about/#privacy">Privacy</Link></span></div>
      </div>
    </footer>
  );
}
