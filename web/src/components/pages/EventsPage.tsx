"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { Chips, Empty, EventCard } from "../ui";
import { CATEGORIES } from "@/lib/data";
import { DOW, PRICE_BANDS, type MeetEvent, addDays, cityName, fmtDay, hostNames, priceOk, relDay } from "@/lib/events";
import { NotHost } from "../host/useIsHost";
import { atLeast, isReal } from "@/lib/publicData";
import { PlansMap } from "../Home";

const WHENS = ["all", "today", "tomorrow", "weekend", "week", "next", "later"];

export default function EventsPage() {
  const { ready, upcoming, inCity, today, city } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") ?? "");
  const cat = CATEGORIES.some((c: any) => c.id === params.get("cat")) ? (params.get("cat") as string) : "all";
  const when = WHENS.includes(params.get("when") ?? "") ? (params.get("when") as string) : "all";
  const [price, setPrice] = useState(PRICE_BANDS.some(([v]) => v === params.get("price")) ? (params.get("price") as string) : "all");
  const [date, setDate] = useState<string | null>(null);
  const [shownDays, setShownDays] = useState(when === "all" ? 7 : 28);
  const [view, setView] = useState<"list" | "map">(params.get("view") === "map" ? "map" : "list");

  const setParam = (k: string, v: string) => {
    const u = new URLSearchParams(params.toString());
    v === "all" || !v ? u.delete(k) : u.set(k, v);
    router.replace(`/events/${u.toString() ? "?" + u : ""}`, { scroll: false });
  };

  const td = today.getDay(), satOff = (6 - td + 7) % 7, sunOff = td === 0 ? 0 : 7 - td;
  const whenOk = (e: MeetEvent) => ({ all: true, today: e.day === 0, tomorrow: e.day === 1, weekend: (e.day === satOff || e.day === sunOff) && e.day <= 6,
    week: e.day <= 6, next: e.day > 6 && e.day <= 13, later: e.day > 13 } as Record<string, boolean>)[when];
  const priceFits = (e: MeetEvent) => priceOk(e, price);
  const base = useMemo(() => upcoming.filter(inCity), [upcoming, inCity]);
  const list = base.filter((e) => (cat === "all" || e.cat === cat) && whenOk(e) && priceFits(e) && (!date || fmtDay(e.date) === date)
    && (!q || `${e.title} ${e.area} ${hostNames(e)} ${e.cat}`.toLowerCase().includes(q.toLowerCase())));

  const byDay = new Map<string, MeetEvent[]>();
  list.forEach((e) => { const k = fmtDay(e.date); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k)!.push(e); });
  const days = [...byDay.entries()];
  const visible = date ? days : days.slice(0, shownDays);

  const counts: Record<string, number> = { all: base.length };
  base.forEach((e) => { counts[e.cat] = (counts[e.cat] || 0) + 1; });
  const perDay: Record<string, number> = {};
  base.filter((e) => cat === "all" || e.cat === cat).forEach((e) => { const k = fmtDay(e.date); perDay[k] = (perDay[k] || 0) + 1; });

  return (
    <div className="wrap">
      <section className="page-hero">
        <span className="eyebrow">Explore</span>
        <h1>Something on, <span className="serif">every day.</span></h1>
        <p>{ready ? `${atLeast(base.filter((e) => isReal(e) && e.day < 28).length, 30)} hosted plans in the next 4 weeks in ${cityName(city)}. Pick a day, pick a vibe.` : "Hosted plans every day. Pick a day, pick a vibe."}</p>
      </section>

      <div className="sec-head" style={{ marginBottom: 16 }}>
        <div className="toolbar">
          <label className="search"><span>🔍</span><input type="search" value={q} placeholder="Search plans, areas, hosts…" aria-label="Search" onChange={(e) => setQ(e.target.value)} /></label>
          <select className="select" value={when} aria-label="When" onChange={(e) => { setDate(null); setShownDays(28); setParam("when", e.target.value); }}>
            <option value="all">All dates</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option>
            <option value="weekend">This weekend</option><option value="week">This week</option><option value="next">Next week</option><option value="later">Later</option>
          </select>
          <select className="select" value={price} aria-label="Price" onChange={(e) => setPrice(e.target.value)}>
            {PRICE_BANDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <button className="btn btn-white btn-sm" onClick={() => { setQ(""); setPrice("all"); setDate(null); setShownDays(7); router.replace("/events/", { scroll: false }); }}>Reset filters</button>
      </div>

      <div className="daystrip" aria-label="Pick a day">
        {ready && Array.from({ length: 28 }, (_, i) => {
          const d = addDays(today, i), k = fmtDay(d), n = perDay[k] || 0;
          return (
            <motion.button key={k} whileTap={{ scale: 0.92 }} whileHover={{ y: -2 }} className={`day ${date === k ? "on" : ""} ${n ? "" : "none"}`}
              onClick={() => { setDate(date === k ? null : k); if (when !== "all") setParam("when", "all"); }}>
              <small>{i === 0 ? "TODAY" : DOW[d.getDay()].toUpperCase()}</small><b>{d.getDate()}</b><em>{n} plan{n === 1 ? "" : "s"}</em>
            </motion.button>
          );
        })}
      </div>
      <Chips value={cat} onChange={(id) => setParam("cat", id)} counts={ready ? counts : undefined} />
      <div className="ex-bar">
        <span className="muted" style={{ fontSize: 13 }}>{ready ? `${list.length} plan${list.length === 1 ? "" : "s"}` : ""}{view === "map" ? " · approximate areas, exact spots stay private" : ""}</span>
        <div className="seg" role="tablist" aria-label="View">
          {(["list", "map"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => { setView(v); setParam("view", v === "map" ? "map" : ""); }}>
              {view === v && <motion.span layoutId="ex-view-on" className="seg-bg" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
              <span>{v === "list" ? "☰ List" : "🗺️ Map"}</span>
            </button>
          ))}
        </div>
      </div>
      {view === "map" && ready && <PlansMap list={list} />}

      {view === "map" ? null : !ready ? (
        <div className="grid">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} className="skeleton" />)}</div>
      ) : visible.length ? (
        <AnimatePresence mode="popLayout">
          {visible.map(([k, evs]) => (
            <motion.div key={k} className="group" layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="group-head">
                <h3>{relDay(evs[0].date, today)}{evs[0].day <= 1 && <span className="serif muted" style={{ fontSize: ".8em" }}> · {k}</span>}</h3>
                <span>{evs.length} plan{evs.length === 1 ? "" : "s"}</span>
              </div>
              <div className="grid">{evs.map((e, i) => <EventCard key={e.id} e={e} index={i} />)}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      ) : (
        <Empty title="No plans match those filters.">Try a different day or category<NotHost> — or <Link href="/host/" style={{ textDecoration: "underline" }}>host this one yourself</Link></NotHost>.</Empty>
      )}
      {ready && view === "list" && !date && days.length > shownDays && (
        <div className="more-row"><motion.button whileTap={{ scale: 0.95 }} className="btn btn-sun" onClick={() => setShownDays((n) => n + 7)}>Show more days ({days.length - shownDays} left) ↓</motion.button></div>
      )}
    </div>
  );
}
