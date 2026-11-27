"use client";
// Interactive parts of the home page.
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import { Chips, Empty, EventCard, FitLine, HostAv, Poster, Reveal, ease } from "./ui";
import { buzz, CountUp, Gallery, Wavy } from "./fx";
import { CONFIG } from "@/lib/config";
import { REVIEWS } from "@/lib/data";
import { NotHost } from "./host/useIsHost";
import { MON, PRICE_BANDS, priceOk, type MeetEvent, cityName, eventUrl, hostLine, hostNames, momentPhotos, relDay } from "@/lib/events";
import { PinnedPhotoStrip } from "./Photos";
import { atLeast, isReal, useFeaturedReviews, useHostCount, usePublicHosts, type PublicHost } from "@/lib/publicData";
import { CITY_CENTER, areaPoint, kmBetween } from "@/lib/geo";
import { AreaMap } from "./AreaMap";

/* ---------- hero: a stack of upcoming plans that shuffles itself ---------- */
const STACK_POS = [
  { x: 0.5, y: 30, rotate: -3, scale: 1, z: 3, opacity: 1 },
  { x: 1, y: 0, rotate: 8, scale: 0.92, z: 2, opacity: 1 },
  { x: 0, y: 10, rotate: -11, scale: 0.88, z: 1, opacity: 1 },
  { x: 0.5, y: 60, rotate: 0, scale: 0.8, z: 0, opacity: 0 },
];
export function HeroStack() {
  const { ready, upcoming, inCity, today } = useApp();
  const picks = useMemo(() => {
    const out: MeetEvent[] = []; const seen = new Set<string>();
    const pool = upcoming.filter(inCity); const sorted = [...pool.filter((e) => e.image), ...pool.filter((e) => !e.image)];
    for (const e of sorted) { if (!seen.has(e.cat)) { seen.add(e.cat); out.push(e); } if (out.length === 4) break; }
    return out;
  }, [upcoming, inCity]);
  const [turn, setTurn] = useState(0);
  const [mobile, setMobile] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(0);
  useEffect(() => {
    const m = () => { setMobile(window.innerWidth <= 720); setStageW(stage.current?.clientWidth ?? 0); }; m(); window.addEventListener("resize", m);
    const t = setInterval(() => { if (!document.hidden) setTurn((x) => x + 1); }, 3600);
    return () => { clearInterval(t); window.removeEventListener("resize", m); };
  }, []);
  // Cards always fit inside the stage: card width and spread come from the stage's real width.
  const cardW = mobile ? Math.min(230, Math.round((stageW || 330) * 0.66)) : 300;
  const spread = Math.max(0, (stageW || (mobile ? 330 : 520)) - cardW - (mobile ? 18 : 24));
  const xOf = (f: number) => Math.round(9 + f * spread);
  const dragged = useRef(false);
  return (
    <motion.div ref={stage} className="hero-stage" aria-label="Featured upcoming plans (swipe the top card)">
      <span className="doodle" style={{ left: -6, top: -6 }}>✨</span>
      <span className="doodle" style={{ right: 20, top: -10, animationDelay: "-2s" }}>🎉</span>
      {!ready && <div className="skeleton" style={{ position: "absolute", left: xOf(0.5), top: 30, width: cardW, height: 380 }} />}
      {picks.map((e, i) => {
        const p = STACK_POS[(i - turn % picks.length + picks.length) % picks.length];
        return (
          <motion.div key={e.id} className="stack-card" style={{ zIndex: p.z, width: cardW }}
            initial={{ opacity: 0, y: 80, rotate: 0 }}
            animate={{ x: xOf(p.x), y: p.y, rotate: p.rotate, scale: p.scale, opacity: p.opacity }}
            transition={{ type: "spring", stiffness: 120, damping: 18, mass: 0.9 }}
            whileHover={p.z === 3 ? { rotate: 0, scale: 1.03 } : undefined}
            drag={p.z === 3 ? "x" : false} dragSnapToOrigin dragElastic={0.6}
            onDragStart={() => { dragged.current = true; }}
            onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 50 || Math.abs(info.velocity.x) > 400) { setTurn((x) => x + 1); buzz(12); } setTimeout(() => { dragged.current = false; }, 50); }}
            whileDrag={{ scale: 1.05, rotate: 0, cursor: "grabbing" }}>
            <Link href={eventUrl(e)} style={{ display: "block" }} draggable={false} onClickCapture={(ev) => { if (dragged.current) { ev.preventDefault(); ev.stopPropagation(); } }}>
              <Poster e={e} />
              <div className="sc-body"><FitLine className="meta">{relDay(e.date, today)} · {e.time} · {e.area}</FitLine><FitLine as="h3">{e.title}</FitLine><FitLine className="meta by-line">{hostLine(e)}</FitLine></div>
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
  const n = upcoming.filter(inCity).filter((e) => isReal(e) && e.day < 30).length;
  const where = ready ? cityName(city) : CONFIG.cities[CONFIG.defaultCity].name;
  return <span className="tag" style={{ marginBottom: 18, background: "var(--mint)" }}>● {atLeast(n, 30)} plans in {where}</span>;
}

const FACE_COLORS = ["#FF4F87", "#6C4CF5", "#FF7A3D", "#1BB78A", "#2E8BFF"];
export function Faces() {
  const { city } = useApp();
  const { data: hosts } = usePublicHosts(city, 10);
  if (!hosts.length) return null;
  return (
    <div className="faces">
      {hosts.slice(0, 5).map((h, i) => (
        <motion.span key={h.id} title={h.name} style={{ background: FACE_COLORS[i % FACE_COLORS.length], position: "relative", overflow: "hidden" }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 + i * 0.08, type: "spring", stiffness: 400, damping: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {h.photo_url ? <img src={h.photo_url} alt={h.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : h.name[0]}
        </motion.span>
      ))}
    </div>
  );
}

/* ---------- closing ribbon above the footer: a slim 3D conveyor of words with glowing orbs (transform-only animation) ---------- */
const RIBBON = ["Come alone", "Leave with a group chat", "Jaipur", "Hosted every day", "Ahmedabad", "No awkward small talk", "Real people, real nights"];
export function Ribbon() {
  // two identical groups, each wider than any screen, scrolled by exactly one group: seamless
  const group: string[] = []; while (group.length < 14) group.push(...RIBBON);
  return (
    <div className="rb" aria-hidden="true">
      <div className="rb-3d">
        <div className="rb-track">
          {[0, 1].map((g) => <div key={g} className="rb-group">{group.map((w, i) => <span key={i} className={`rb-w w${i % 3}`}>{w}<i className="rb-orb" /></span>)}</div>)}
        </div>
      </div>
      <span className="rb-sheen" />
    </div>
  );
}

/* ---------- price dropdown ---------- */
function PriceDrop({ value, onChange, counts, ready }: { value: string; onChange: (v: string) => void; counts: Record<string, number>; ready: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const cur = PRICE_BANDS.find(([v]) => v === value)!;
  return (
    <div className="pdrop" ref={ref}>
      <button type="button" className={`pdrop-btn ${value !== "all" ? "set" : ""}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen((o) => !o); buzz(); }}>
        💸 <span>{value === "all" ? "Price" : cur[1]}</span><motion.i animate={{ rotate: open ? 180 : 0 }}>▾</motion.i>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul className="pdrop-menu" role="listbox" initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.16 }}>
            {PRICE_BANDS.map(([v, l], i) => (
              <motion.li key={v} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.035 }}>
                <button type="button" role="option" aria-selected={value === v} className={value === v ? "on" : ""} onClick={() => { onChange(v); setOpen(false); buzz(); }}>
                  <span>{v === "all" ? "Any price" : l}</span>{ready && <i>{counts[v]}</i>}{value === v && <b>✓</b>}
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- map view: plans grouped by area ---------- */
export function PlansMap({ list }: { list: MeetEvent[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const soon = list.filter((e) => e.day <= 13);
  const groups = new Map<string, MeetEvent[]>();
  soon.forEach((e) => { const k = `${e.city}|${e.area}`; groups.set(k, [...(groups.get(k) ?? []), e]); });
  const all = [...groups.entries()].map(([k, es]) => { const p = areaPoint(es[0].area, es[0].city); return { id: k, lat: p.lat, lon: p.lon, label: `${es[0].area}: ${es.length} plans`, emoji: es[0].emoji, count: es.length, es }; });
  const cityCenter = CITY_CENTER[list[0]?.city] ?? CITY_CENTER.jaipur;
  const near = all.filter((p) => kmBetween([p.lat, p.lon], cityCenter) < 30);
  const far = all.length - near.length;
  const picked = all.find((p) => p.id === sel);
  return (
    <motion.div className="pmap" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      {near.length ? <AreaMap center={cityCenter} pins={near} fit height={380} onPin={(p) => { setSel(p.id); buzz(); }} selected={sel} /> : <div className="empty">No plans on the map for these filters.</div>}
      <p className="fine" style={{ marginTop: 8 }}>Approximate areas only. Exact spots go to confirmed guests.{far ? ` Plus ${far} trip${far > 1 ? "s" : ""} outside the city.` : ""}</p>
      <AnimatePresence mode="wait">
        {picked && (
          <motion.div key={picked.id} className="pmap-list" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="group-head"><h3 style={{ fontSize: 20 }}>📍 {picked.es[0].area}</h3><span>{picked.es.length} plan{picked.es.length > 1 ? "s" : ""} · next 2 weeks</span></div>
            <div className="grid">{picked.es.slice(0, 4).map((e, i) => <EventCard key={e.id} e={e} index={i} />)}</div>
          </motion.div>
        )}
      </AnimatePresence>
      {!picked && near.length > 0 && <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>Tap a pin to see what&apos;s on there.</p>}
    </motion.div>
  );
}

/* ---------- explore: one swipeable row per time bucket ---------- */
export function ExplorePreview() {
  const { ready, upcoming, inCity, today, city } = useApp();
  const { data: hostCount } = useHostCount(city);
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [price, setPrice] = useState("all");
  const [view, setView] = useState<"list" | "map">("list");
  const [when, setWhen] = useState("all");
  const td0 = today.getDay(), sat0 = (6 - td0 + 7) % 7, sun0 = td0 === 0 ? 0 : 7 - td0;
  const whenOk = (e: MeetEvent) => ({ all: true, today: e.day === 0, tomorrow: e.day === 1, weekend: (e.day === sat0 || e.day === sun0) && e.day <= 6,
    week: e.day <= 6, next: e.day > 6 && e.day <= 13 } as Record<string, boolean>)[when];
  const base = upcoming.filter(inCity).filter((e) => whenOk(e) && (cat === "all" || e.cat === cat) && (!q || `${e.title} ${e.area} ${hostNames(e)}`.toLowerCase().includes(q)));
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
          <p>{ready ? `${atLeast(hostCount, 15)} verified hosts in and around ${cityName(city)}.` : "Hosted plans every day."}</p>
        </div>
        <div className="toolbar">
          <label className="search"><span>🔍</span><input type="search" placeholder="Search dinners, treks, quiz…" aria-label="Search meetups" onChange={(e) => setQ(e.target.value.trim().toLowerCase())} /></label>
        </div>
      </div>
      <Chips value={cat} onChange={setCat} />
      <div className="ex-bar">
        <select className="select" value={when} aria-label="When" onChange={(e) => setWhen(e.target.value)}>
          <option value="all">All dates</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option>
          <option value="weekend">This weekend</option><option value="week">This week</option><option value="next">Next week</option>
        </select>
        <PriceDrop value={price} onChange={setPrice} counts={Object.fromEntries(PRICE_BANDS.map(([v]) => [v, base.filter((e) => priceOk(e, v)).length]))} ready={ready} />
        <div className="seg" role="tablist" aria-label="View">
          {(["list", "map"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => { setView(v); buzz(); }}>
              {view === v && <motion.span layoutId="view-on" className="seg-bg" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
              <span>{v === "list" ? "☰ List" : "🗺️ Map"}</span>
            </button>
          ))}
        </div>
      </div>
      {view === "map" && ready ? <PlansMap list={list} /> : null}
      {view === "map" ? null : !ready ? (
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
  const { city } = useApp();
  const { data: list, loaded } = usePublicHosts(city, 10);
  if (!loaded) return <div className="skeleton" style={{ minHeight: 220, opacity: 0.25 }} />;
  if (!list.length) return <div className="hosts-empty"><b>Our first {cityName(city)} hosts are joining now.</b><NotHost><span>Love bringing people together? You could be one of them.</span></NotHost></div>;
  return (
    <Gallery label="Hosts" className="on-dark">
      {list.map((h, i) => (
        <motion.div key={h.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          transition={{ delay: Math.min(i, 5) * 0.07, duration: 0.5, ease }} whileHover={{ y: -6, rotate: -2 }}>
          <Link href={`/host-profile/?id=${h.id}`} className="host" aria-label={`${h.name}, see profile`}>
            <HostPhoto h={h} i={i} />
            <b>{h.name}<span className="verified">✓</span></b>
            <small>{h.reviews ? `★ ${Number(h.avg_rating).toFixed(1)} · ${h.reviews} review${h.reviews > 1 ? "s" : ""}` : h.events ? `${h.events} plan${h.events > 1 ? "s" : ""} hosted` : "New host"}</small>
          </Link>
        </motion.div>
      ))}
    </Gallery>
  );
}

export function HostPhoto({ h, i = 0, className = "av" }: { h: Pick<PublicHost, "name" | "photo_url">; i?: number; className?: string }) {
  return (
    <div className={className} style={{ background: FACE_COLORS[i % FACE_COLORS.length], position: "relative", overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {h.photo_url ? <img src={h.photo_url} alt={h.name} loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : h.name[0]}
    </div>
  );
}

export function Wall() {
  const rots = [-2, 1.5, -1, 2.2, -1.6, 0.8];
  const { city, byId } = useApp();
  const { data: reviews, loaded } = useFeaturedReviews(city);
  if (!loaded) return <div className="skeleton" style={{ minHeight: 200, opacity: 0.4 }} />;
  if (!reviews.length) return <div className="reviews-empty"><span aria-hidden="true">💬</span><b>Real reviews land here every week.</b><p>Only guests who were checked in at a meetup can rate it, so every word here is from someone who was there.</p></div>;
  return (
    <Gallery label="Reviews" auto={4200}>
      {reviews.map((r, i) => {
        const title = r.event_title ?? byId(r.plan_ref)?.title.split(" · ")[0] ?? "a meetra plan";
        return (
          <motion.figure key={r.first_name + r.created_at} className={`quote c${i % 6}`}
            initial={{ opacity: 0, y: 30, rotate: 0 }} whileInView={{ opacity: 1, y: 0, rotate: rots[i % rots.length] }}
            viewport={{ once: true }} transition={{ duration: 0.6, ease, delay: Math.min(i, 3) * 0.08 }}
            whileHover={{ rotate: 0, scale: 1.02 }}>
            <div className="who"><span className="av">{(r.first_name || "?")[0]}</span>{r.first_name}{r.this_week && <small className="wk">this week</small>}</div>
            <span className="tag">{title}</span>
            <h4 aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}<span style={{ opacity: 0.25 }}>{"★".repeat(5 - r.rating)}</span></h4>
            <p>“{r.comment}”</p>
          </motion.figure>
        );
      })}
    </Gallery>
  );
}

/* ---------- real photos from past meetups ---------- */
export function Moments({ head }: { head?: React.ReactNode }) {
  const photos = useMemo(() => momentPhotos(12), []);
  return <PinnedPhotoStrip photos={photos} label="Photos from past meetups" head={head} />;
}

export function Stats() {
  const { upcoming, inCity, city } = useApp();
  const { data: hostCount } = useHostCount(city);
  const evs = upcoming.filter(inCity);
  const real = evs.filter((e) => isReal(e) && e.day < 28).length;
  const cats = new Set(evs.map((e) => e.cat)).size;
  // [number to count up to, suffix, label]: below the floor we show the floor with a "+"
  const rows: [number, string, string][] = [
    [Math.max(real, 30), real >= 30 ? "" : "+", "plans in the next 4 weeks"],
    [Math.max(hostCount, 15), hostCount >= 15 ? "" : "+", "verified hosts"],
    [cats, "", "kinds of plans"],
  ];
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
