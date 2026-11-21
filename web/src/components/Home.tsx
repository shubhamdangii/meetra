"use client";
// Interactive parts of the home page.
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import { Chips, Empty, EventCard, Poster, Reveal, ease } from "./ui";
import { buzz, CountUp, Gallery, Wavy } from "./fx";
import { CONFIG } from "@/lib/config";
import { HOSTS, REVIEWS } from "@/lib/data";
import { MON, PRICE_BANDS, priceOk, type MeetEvent, cityName, eventUrl, hostNames, relDay } from "@/lib/events";

/* ---------- hero: a stack of upcoming plans that shuffles itself ---------- */
const STACK_POS = [
  { x: 110, y: 30, rotate: -3, scale: 1, z: 3, opacity: 1 },
  { x: 220, y: 0, rotate: 8, scale: 0.92, z: 2, opacity: 1 },
  { x: 0, y: 10, rotate: -11, scale: 0.88, z: 1, opacity: 1 },
  { x: 110, y: 60, rotate: 0, scale: 0.8, z: 0, opacity: 0 },
];
export function HeroStack() {
  const { ready, upcoming, inCity, today } = useApp();
  const picks = useMemo(() => {
    const out: MeetEvent[] = []; const seen = new Set<string>();
    for (const e of upcoming.filter(inCity)) { if (!seen.has(e.cat)) { seen.add(e.cat); out.push(e); } if (out.length === 4) break; }
    return out;
  }, [upcoming, inCity]);
  const [turn, setTurn] = useState(0);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const m = () => setMobile(window.innerWidth <= 720); m(); window.addEventListener("resize", m);
    const t = setInterval(() => { if (!document.hidden) setTurn((x) => x + 1); }, 3600);
    return () => { clearInterval(t); window.removeEventListener("resize", m); };
  }, []);
  const k = mobile ? 0.55 : 1;
  const dragged = useRef(false);
  return (
    <motion.div className="hero-stage" aria-label="Featured upcoming plans (swipe the top card)">
      <span className="doodle" style={{ left: -6, top: -6 }}>✨</span>
      <span className="doodle" style={{ right: 20, top: -10, animationDelay: "-2s" }}>🎉</span>
      {!ready && <div className="skeleton" style={{ position: "absolute", left: 110 * k, top: 30, width: mobile ? 230 : 300, height: 380 }} />}
      {picks.map((e, i) => {
        const p = STACK_POS[(i - turn % picks.length + picks.length) % picks.length];
        return (
          <motion.div key={e.id} className="stack-card" style={{ zIndex: p.z, width: mobile ? 230 : 300 }}
            initial={{ opacity: 0, y: 80, rotate: 0 }}
            animate={{ x: p.x * k, y: p.y, rotate: p.rotate, scale: p.scale, opacity: p.opacity }}
            transition={{ type: "spring", stiffness: 120, damping: 18, mass: 0.9 }}
            whileHover={p.z === 3 ? { rotate: 0, scale: 1.03 } : undefined}
            drag={p.z === 3 ? "x" : false} dragSnapToOrigin dragElastic={0.6}
            onDragStart={() => { dragged.current = true; }}
            onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 50 || Math.abs(info.velocity.x) > 400) { setTurn((x) => x + 1); buzz(12); } setTimeout(() => { dragged.current = false; }, 50); }}
            whileDrag={{ scale: 1.05, rotate: 0, cursor: "grabbing" }}>
            <Link href={eventUrl(e)} style={{ display: "block" }} draggable={false} onClickCapture={(ev) => { if (dragged.current) { ev.preventDefault(); ev.stopPropagation(); } }}>
              <Poster e={e} />
              <div className="sc-body"><div className="meta">{relDay(e.date, today)} · {e.time} · {e.area}</div><h3>{e.title}</h3></div>
            </Link>
          </motion.div>
        );
      })}
      <svg className="stamp" viewBox="0 0 200 200" aria-hidden="true">
        <defs><path id="circ" d="M100,100 m-74,0 a74,74 0 1,1 148,0 a74,74 0 1,1 -148,0" /></defs>
        <circle cx="100" cy="100" r="98" fill="#FFC93C" stroke="#16122B" strokeWidth="3" />
        <text fontWeight="800" fontSize="21" letterSpacing="3" fill="#16122B" style={{ fontFamily: "var(--display)" }}><textPath href="#circ">COME SOLO ✦ MAKE FRIENDS ✦ EVERY DAY ✦</textPath></text>
      </svg>
      <span className="stamp-core">👋</span>
      <span className="stack-hint" aria-hidden="true">← swipe →</span>
    </motion.div>
  );
}

export function HeroCount() {
  const { ready, upcoming, inCity, city } = useApp();
  const n = upcoming.filter(inCity).filter((e) => e.day < 30).length;
  return <span className="tag" style={{ marginBottom: 18, background: "var(--mint)" }}>● {ready ? `${n}+` : "100+"} plans this month in {ready ? cityName(city).replace("All cities", "your city") : "Jaipur"}</span>;
}

export function Faces() {
  const { city } = useApp();
  return (
    <div className="faces">
      {Object.values(HOSTS as Record<string, any>).filter((h) => city === "all" || h.city === city).slice(0, 5).map((h: any, i) => (
        <motion.span key={h.name} style={{ background: h.color }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 + i * 0.08, type: "spring", stiffness: 400, damping: 14 }}>{h.name[0]}</motion.span>
      ))}
    </div>
  );
}

export function Marquee() {
  const { upcoming, inCity } = useApp();
  const items = [...new Set(upcoming.filter(inCity).slice(0, 24).map((e) => `${e.emoji} ${e.title.split(" · ")[0]}`))].slice(0, 12);
  const list = items.length ? items : ["🍝 Introverts' Dinner", "🎲 Board Games & Chai", "🌄 Sunrise Trek", "🧠 Quiz Night", "🎤 Open Mic"];
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">{[...list, ...list].map((t, i) => <span key={i}>{t}</span>)}</div>
    </div>
  );
}

/* ---------- explore: one swipeable row per time bucket ---------- */
export function ExplorePreview() {
  const { ready, upcoming, inCity, today, city } = useApp();
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [price, setPrice] = useState("all");
  const base = upcoming.filter(inCity).filter((e) => (cat === "all" || e.cat === cat) && (!q || `${e.title} ${e.area} ${hostNames(e)}`.toLowerCase().includes(q)));
  const list = base.filter((e) => priceOk(e, price));
  const td = today.getDay(), satOff = (6 - td + 7) % 7, sunOff = td === 0 ? 0 : 7 - td;
  const weekend = (e: MeetEvent) => (e.day === satOff || e.day === sunOff) && e.day <= 6;
  const buckets = [
    { t: "This weekend", em: "🔥", w: "weekend", f: weekend },
    { t: "This week", em: "📅", w: "week", f: (e: MeetEvent) => e.day <= 6 && !weekend(e) },
    { t: "Next week", em: "👀", w: "next", f: (e: MeetEvent) => e.day > 6 && e.day <= 13 },
  ];
  const fmt = (d: Date) => `${d.getDate()} ${MON[d.getMonth()]}`;
  return (
    <section className="wrap sec" id="explore">
      <div className="sec-head">
        <div>
          <span className="eyebrow">What&apos;s on</span>
          <h2 className="h2"><Wavy text="Find your" /> <span className="serif" style={{ color: "var(--violet)" }}><Wavy text="next" /></span> <Wavy text="meetup" /></h2>
          <p>{ready ? `${upcoming.filter(inCity).length} hosted plans in and around ${cityName(city).replace("All cities", "our cities")}. ` : "Hosted plans every day."}</p>
        </div>
        <div className="toolbar">
          <label className="search"><span>🔍</span><input type="search" placeholder="Search dinners, treks, quiz…" aria-label="Search meetups" onChange={(e) => setQ(e.target.value.trim().toLowerCase())} /></label>
        </div>
      </div>
      <Chips value={cat} onChange={setCat} />
      <div className="price-seg" role="radiogroup" aria-label="Price">
        <span className="price-seg-label">💸 Price</span>
        {PRICE_BANDS.map(([v, l]) => {
          const n = base.filter((e) => priceOk(e, v)).length;
          return (
            <motion.button key={v} type="button" role="radio" aria-checked={price === v} whileTap={{ scale: 0.9 }} className={`pseg ${price === v ? "on" : ""}`} onClick={() => { setPrice(v); buzz(); }}>
              {price === v && <motion.span layoutId="price-on" className="pseg-bg" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
              <span className="pseg-txt">{v === "all" ? "All" : l}{ready && <i>{n}</i>}</span>
            </motion.button>
          );
        })}
      </div>
      {!ready ? (
        <div className="grid">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" />)}</div>
      ) : (
        <AnimatePresence mode="popLayout">
          {buckets.map((b) => {
            const items = list.filter(b.f); if (!items.length) return null;
            const more = `/events/?when=${b.w}${cat !== "all" ? `&cat=${cat}` : ""}${price !== "all" ? `&price=${price}` : ""}`;
            return (
              <motion.div key={b.t + cat + q + price} className="group" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="group-head"><h3>{b.em} {b.t}</h3><span>{fmt(items[0].date)}{items.length > 1 ? " – " + fmt(items[items.length - 1].date) : ""} · <Link href={more} style={{ textDecoration: "underline" }}>{items.length} plans</Link></span></div>
                <div className="grid">{items.slice(0, 4).map((e, i) => <EventCard key={e.id} e={e} index={i} />)}</div>
                {items.length > 4 && <div className="more-row"><Link className="btn btn-white btn-sm" href={more}>See all {items.length} plans →</Link></div>}
              </motion.div>
            );
          })}
          {!list.length && <Empty key="empty" title="Nothing matches that.">Try another category or search.</Empty>}
        </AnimatePresence>
      )}
      {ready && <div className="more-row"><Link className="btn btn-white" href="/events/">See every plan, day by day →</Link></div>}
    </section>
  );
}

export function Hosts() {
  const { city, upcoming } = useApp();
  const firstPlan: Record<string, string> = {};
  upcoming.forEach((e) => e.hosts.forEach((h) => { firstPlan[h] = firstPlan[h] || e.title.split(" · ")[0]; }));
  const list = Object.entries(HOSTS as Record<string, any>).filter(([k, h]) => k !== "team" && (city === "all" || h.city === city));
  return (
    <Gallery label="Hosts" className="on-dark">
      {list.map(([k, h], i) => (
        <motion.div key={k} className="host" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          transition={{ delay: Math.min(i, 5) * 0.07, duration: 0.5, ease }} whileHover={{ y: -6, rotate: -2 }}>
          <div className="av" style={{ background: h.color }}>{h.name[0]}</div>
          <b>{h.name}<span className="verified">✓</span></b><small>{firstPlan[k] || ""}</small>
        </motion.div>
      ))}
    </Gallery>
  );
}

export function Wall() {
  const rots = [-2, 1.5, -1, 2.2, -1.6, 0.8];
  return (
    <>
      <Gallery label="Reviews" auto={4200}>
        {(REVIEWS as any[]).map((r, i) => {
          const parts = r.head.split(r.hl);
          return (
            <motion.figure key={r.name} className={`quote c${i % 6}`}
              initial={{ opacity: 0, y: 30, rotate: 0 }} whileInView={{ opacity: 1, y: 0, rotate: rots[i % rots.length] }}
              viewport={{ once: true }} transition={{ duration: 0.6, ease, delay: Math.min(i, 3) * 0.08 }}
              whileHover={{ rotate: 0, scale: 1.02 }}>
              <div className="who"><span className="av">{r.name[0]}</span>{r.name}</div>
              <span className="tag">{r.plan}</span>
              <h4>“{parts[0]}<span className="hl">{r.hl}</span>{parts.slice(1).join(r.hl)}”</h4>
              <p>“{r.text}”</p>
            </motion.figure>
          );
        })}
      </Gallery>
      {CONFIG.showSampleNotice && <span className="notice">✏️ Sample reviews: replace them in src/lib/data.ts with real ones after your first meetups.</span>}
    </>
  );
}

export function Stats() {
  const { upcoming, inCity } = useApp();
  const evs = upcoming.filter(inCity);
  const month = evs.filter((e) => e.day < 30).length;
  const hosts = new Set(evs.flatMap((e) => e.hosts)).size;
  const cats = new Set(evs.map((e) => e.cat)).size;
  const rows: [number, string, string][] = [[month, "+", "plans in the next 4 weeks"], [hosts, "", "verified hosts"], [cats, "", "kinds of plans"]];
  return (
    <div className="stats">
      {rows.map(([n, suf, l]) => (
        <Reveal key={l} className="stat"><b><CountUp to={n} suffix={suf} /></b><span>{l}</span></Reveal>
      ))}
    </div>
  );
}

/* ---------- how it works, as swipeable cards ---------- */
export function Steps({ items }: { items: string[][] }) {
  return (
    <Gallery label="How it works">
      {items.map(([n, t, d], i) => (
        <Reveal key={n} delay={i * 0.1} className="step"><span className="num">{n}</span><h3>{t}</h3><p>{d}</p></Reveal>
      ))}
    </Gallery>
  );
}
