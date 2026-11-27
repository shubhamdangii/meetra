"use client";
// Site header (nav, city picker, account menu), mobile tab bar, profile nudge and footer.
import { AnimatePresence, motion } from "framer-motion";
import { lockScroll } from "@/lib/scrollLock";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { InstallMenuItem } from "./InstallApp";
import { NotificationsSheet, useNotifications } from "./Notifications";
import { NotHost, useHostStatus, useIsHost } from "./host/useIsHost";
import { InviteClaimer } from "./Quests";
import { useApp } from "./AppProvider";
import { useAuth } from "./AuthProvider";
import { CONFIG } from "@/lib/config";
import { cityName } from "@/lib/events";
import { store } from "@/lib/store";
import { buzz } from "./fx";

const LINKS = [
  { key: "events", href: "/events/", label: "Explore", icon: "🔍" },
  { key: "swipe", href: "/swipe/", label: "Discover", icon: "🔥" },
  { key: "past", href: "/past/", label: "Past nights", icon: "📸" },
  { key: "games", href: "/games/", label: "Games", icon: "🎲" },
  { key: "saved", href: "/saved/", label: "Your plans", icon: "♥" },
  { key: "host", href: "/host/", label: "Host", icon: "✨" },
];

/** Desktop nav: secondary pages grouped under "More" so the bar stays clean. */
const MORE_KEYS = ["swipe", "past", "games"];
const MORE = [
  ["/swipe/", "🔥", "Discover", "Swipe through plans"], ["/past/", "📸", "Past nights", "Photo diaries"], ["/games/", "🎲", "Party games", "Decks, Mafia, Undercover…"],
  ["/partners/", "🤝", "For brands & venues", "Host a series, sponsor, partner"], ["/about/", "💬", "How it works", "Safety, payments, rules"],
] as const;
function MoreMenu({ active }: { active: string }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  const on = MORE_KEYS.includes(active) || /^\/(partners|about)/.test(path ?? "");
  return (
    <div className="more-nav" ref={ref}>
      <button type="button" className={on ? "active" : ""} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>More <span aria-hidden="true">▾</span></button>
      <AnimatePresence>{open && (
        <motion.div className="more-pop" role="menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
          {MORE.map(([href, ic, t, s]) => <Link key={href} href={href} role="menuitem"><span aria-hidden="true">{ic}</span><div><b>{t}</b><small>{s}</small></div></Link>)}
        </motion.div>
      )}</AnimatePresence>
    </div>
  );
}

/* Line icons for the phone tab bar. */
const I = {
  home: <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />,
  explore: <><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2.2 5-4.8 2 2.2-5z" /></>,
  plans: <><path d="M4 8.5V7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v1.5a2 2 0 0 0 0 4V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4.5a2 2 0 0 0 0-4z" /><path d="M14 6v12" strokeDasharray="2 2" /></>,
  me: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h10" />,
};
const Icon = ({ d }: { d: React.ReactNode }) => <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;

function activeKey(path: string) {
  const p = path.replace(/\/+$/, "/");
  if (p === "/" ) return "home";
  if (p.startsWith("/event")) return "events";
  if (p.startsWith("/ticket")) return "saved";
  if (p.startsWith("/profile") || p.startsWith("/login") || p.startsWith("/admin")) return "me";
  if (p.startsWith("/game")) return "games";
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
        📍 <span>{ready ? cityName(city) : CONFIG.cities[CONFIG.defaultCity].name}</span> <i className="caret" aria-hidden="true">▾</i>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="city-menu open" role="menu" style={{ top: 50, right: 0 }} {...menuMotion}>
            {Object.entries(CONFIG.cities).filter(([, c]) => c.live).map(([k, c]) => (
              <button key={k} role="menuitem" disabled={!c.live} className={city === k ? "on" : ""}
                onClick={() => { setCity(k); setOpen(false); toast(`📍 Showing ${c.name}`); }}>
                <span>{c.name}</span><small>{c.live ? c.tag : "coming soon"}</small>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AccountSlot() {
  const { enabled, session, me, logout, team } = useAuth();
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const notes = useNotifications();
  const [sheet, setSheet] = useState(false);
  const isHost = useIsHost();
  const ref = useOutsideClose(open, () => setOpen(false));
  if (!enabled) return null;
  if (!session) return <Link className="btn btn-ink btn-sm login-btn" href="/login/">Log in</Link>;
  const name = me?.display_name || "Your account";
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <motion.button whileTap={{ scale: 0.92 }} className={`avatar-btn ${me && me.profile_score < 70 ? "todo" : ""}`} aria-haspopup="menu" aria-expanded={open} aria-label="Your account" onClick={() => setOpen((o) => !o)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {me?.avatar_url ? <img src={me.avatar_url} alt="" /> : name[0]}
        {notes.unread > 0 && <span className="avatar-badge" aria-label={`${notes.unread} new notifications`}>{notes.unread > 9 ? "9+" : notes.unread}</span>}
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div className="city-menu account-menu open" role="menu" {...menuMotion}>
            <div className="acct-head"><b>{name}</b><small>Profile score {me?.profile_score ?? 0}/100{me?.profile_complete ? " · complete ✓" : ""}</small></div>
            <button role="menuitem" onClick={() => { setOpen(false); setSheet(true); }}><span>🔔 Notifications</span>{notes.unread > 0 && <small className="nt-count">{notes.unread} new</small>}</button>
            {isHost && <Link href="/host/?new=1" role="menuitem" onClick={() => setOpen(false)}><span>＋ Add a plan</span><small>host desk</small></Link>}
            <Link href="/profile/" role="menuitem" onClick={() => setOpen(false)}><span>My profile</span>{me && !me.profile_complete && <small className="dot">●</small>}</Link>
            <Link href="/saved/" role="menuitem" onClick={() => setOpen(false)}><span>Your plans &amp; passes</span></Link>
            <Link href="/games/" role="menuitem" onClick={() => setOpen(false)}><span>Party games</span></Link>
            <Link href="/swipe/" role="menuitem" onClick={() => setOpen(false)}><span>Discover plans</span></Link>
            {team && <Link href="/admin/" role="menuitem" onClick={() => setOpen(false)}><span>{team.is_super ? "Admin desk" : "City desk"}</span><small>{team.is_super ? "main admin" : team.cities.map((c) => CONFIG.cities[c]?.name ?? c).join(", ")}</small></Link>}
            <button role="menuitem" onClick={async () => { setOpen(false); await logout(); toast("Logged out ✓ See you soon"); }}><span>Log out</span></button>
          </motion.div>
        )}
      </AnimatePresence>
      <NotificationsSheet open={sheet} onClose={() => setSheet(false)} n={notes} />
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

function TabBar({ active }: { active: string }) {
  const { session } = useAuth();
  const path = usePathname();
  // keyboard open (a text field focused) → hide the bar instead of letting it float up over the page
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.matches("input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),textarea,select") || t.isContentEditable);
    const on = (e: FocusEvent) => { if (isField(e.target)) setTyping(true); };
    const off = () => setTimeout(() => setTyping(isField(document.activeElement)), 60);
    document.addEventListener("focusin", on); document.addEventListener("focusout", off);
    return () => { document.removeEventListener("focusin", on); document.removeEventListener("focusout", off); };
  }, []);
  // every tab tap lands at the top of the page (same tab again = scroll up)
  const toTop = (href: string) => {
    const norm = (p: string) => p.replace(/\/$/, "") || "/";
    const same = norm(path) === norm(href);
    if (same) window.scrollTo({ top: 0, behavior: "smooth" });
    else requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
  };
  const tabs = [
    { key: "home", href: "/", label: "Home", d: I.home },
    { key: "events", href: "/events/", label: "Explore", d: I.explore },
    { key: "saved", href: "/saved/", label: "My plans", d: I.plans },
    { key: "me", href: session ? "/profile/" : "/login/", label: session ? "Account" : "Log in", d: I.me },
  ];
  return (
    <nav className={`tabbar${typing ? " typing" : ""}`} aria-label="Main (mobile)">
      {tabs.map((t) => {
        const on = active === t.key;
        return (
          <Link key={t.key} href={t.href} className={on ? "active" : ""} aria-current={on ? "page" : undefined} onClick={() => { buzz(); toTop(t.href); }}>
            {on && <motion.i layoutId="tab-on" className="tab-bg" transition={{ type: "spring", stiffness: 480, damping: 34 }} />}
            <motion.span key={String(on)} initial={on ? { scale: 0.5, y: 6 } : false} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 520, damping: 14 }}><Icon d={t.d} /></motion.span>
            <b>{t.label}</b>
          </Link>
        );
      })}
    </nav>
  );
}

/** Phone menu (☰): everything that isn't in the tab bar. */
function MobileMenu() {
  const [open, setOpen] = useState(false);
  const hostSt = useHostStatus(); const isHost = hostSt === "active";
  const [mounted, setMounted] = useState(false);
  const path = usePathname();
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => { if (!open) return; return lockScroll(); }, [open]);
  const items = [
    ["🔥", "Discover", "Swipe through plans", "/swipe/"], ["🎲", "Party games", "Decks, Mafia, Undercover…", "/games/"],
    ["📸", "Past nights", "Photos and stories", "/past/"],
    isHost ? ["＋", "Add a plan", "Propose your next event", "/host/?new=1"] : hostSt === "none" ? ["✨", "Host a meetup", "Join the host waiting list", "/host/"] : ["🎙️", "Host desk", "Your events", "/host/"],
    ["💬", "How it works", "Safety, payments, rules", "/about/"], ["🤝", "Brands & venues", "Partner with us", "/partners/"],
  ];
  return (
    <>
      <button className="menu-btn" aria-label="Menu" aria-expanded={open} onClick={() => { setOpen((o) => !o); buzz(); }}><Icon d={I.menu} /></button>
      {mounted && createPortal(<AnimatePresence>
        {open && (
          <motion.div className="sheet-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.nav className="sheet" aria-label="More" onClick={(e) => e.stopPropagation()}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 36 }}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} onDragEnd={(_, i) => { if (i.offset.y > 90) setOpen(false); }}>
              <span className="sheet-grab" aria-hidden="true" />
              {items.map(([em, t, sub, href], i) => (
                <motion.div key={href} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i + 0.08 }}>
                  <Link href={href} className="sheet-item"><span>{em}</span><b>{t}<small>{sub}</small></b><i>→</i></Link>
                </motion.div>
              ))}
              <InstallMenuItem />
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </>
  );
}

export function Header() {
  const path = usePathname();
  const active = activeKey(path);
  const hostSt = useHostStatus();
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
            {LINKS.filter((l) => !MORE_KEYS.includes(l.key)).map((l) => (
              <Link key={l.key} href={l.href} className={active === l.key ? "active" : ""} style={{ position: "relative" }}>
                {active === l.key && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                <span style={{ position: "relative" }}>{l.key === "host" && hostSt && hostSt !== "none" ? "Host desk" : l.label}</span>
              </Link>
            ))}
            <MoreMenu active={active} />
          </nav>
          <div className="nav-right"><CityPicker /><AccountSlot /><MobileMenu /></div>
        </div>
      </header>
      <ProfileNudge />
      <TabBar active={active} />
      <InviteClaimer />
    </>
  );
}

const FOOT_GAMES: [string, string][] = [["two-truths", "Two Truths & a Lie"], ["would-you-rather", "Would You Rather"], ["dumb-charades", "Dumb Charades"], ["antakshari", "Antakshari"], ["trivia", "Table Trivia"], ["word-chain", "Word Chain"]];
export function Footer() {
  const live = Object.values(CONFIG.cities).filter((c) => c.live).map((c) => c.name).join(" & ");
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="foot-grid">
          <div><Link className="logo" href="/" style={{ color: "#fff" }}>{CONFIG.brand}<i>.</i></Link><p>{CONFIG.tagline} Now in {live}.</p></div>
          <div><h5>Explore</h5><Link href="/events/">Find a meetup</Link><Link href="/events/?when=weekend">This weekend</Link><Link href="/swipe/">Discover</Link><Link href="/past/">Past nights</Link></div>
          <div><h5>Games</h5>{FOOT_GAMES.map(([id, t]) => <Link key={id} href={`/game/?id=${id}`}>{t}</Link>)}<Link href="/games/" className="foot-more">All games →</Link></div>
          <div><h5>Help</h5><Link href="/safety/">Help &amp; safety</Link><Link href="/safety/#report">Report someone</Link><Link href="/safety/#faq">FAQ</Link><Link href="/about/">How it works</Link><Link href="/safety/#contact">Contact support</Link></div>
          <div><h5>{CONFIG.brand}</h5><NotHost><Link href="/host/">Host a meetup</Link></NotHost><Link href="/partners/">For brands &amp; venues</Link><a href={CONFIG.instagram} target="_blank" rel="noopener noreferrer">Instagram</a><a href={CONFIG.whatsappCommunity} target="_blank" rel="noopener noreferrer">WhatsApp community</a><a href={`mailto:${CONFIG.email}`}>{CONFIG.email}</a></div>
        </div>
        <motion.div className="wordmark" aria-hidden="true" initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.9 }}>
          {CONFIG.brand}<i>.</i>
        </motion.div>
        <div className="foot-bottom"><span>© February 2026 {CONFIG.brand}. Made with chai in {live}.</span><span><Link href="/about/#terms">Terms</Link> · <Link href="/about/#privacy">Privacy</Link></span></div>
      </div>
    </footer>
  );
}
