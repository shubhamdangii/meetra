"use client";
import { motion, type HTMLMotionProps } from "framer-motion";
import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { useApp } from "./AppProvider";
import { burstFrom, buzz, useTilt } from "./fx";
import { CONFIG } from "@/lib/config";
import { CATEGORIES } from "@/lib/data";
import { DOW, MON, type MeetEvent, bookingState, dayPart, eventUrl, hostLine, hostNames, hostTba, palette, priceLabel, priceShort } from "@/lib/events";
import { usePlanCount } from "@/lib/eventMedia";

export const ease = [0.2, 0.8, 0.2, 1] as const;

/** Fades + lifts in when scrolled into view (once). */
export function Reveal({ delay = 0, y = 24, ...props }: HTMLMotionProps<"div"> & { delay?: number; y?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -40px 0px" }} transition={{ duration: 0.6, ease, delay }} {...props} />
  );
}

export function DateBadge({ date }: { date: Date }) {
  return (
    <div className="dbadge"><b>{DOW[date.getDay()].toUpperCase()}</b><i>{date.getDate()}</i><small>{MON[date.getMonth()].toUpperCase()}</small></div>
  );
}

export function Poster({ e, title = false, badge = true, className = "" }: { e: MeetEvent; title?: boolean; badge?: boolean; className?: string }) {
  const [bg, ac] = palette(e.pal);
  const dark = bg === "#16122B" || bg === "#6C4CF5";
  return (
    <div className={`poster p-${e.pattern}${dark ? " dark" : ""} ${className}`} style={{ ["--bg" as string]: bg, ["--ac" as string]: ac }}>
      {e.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="photo" src={e.image} alt="" loading="lazy" />
      ) : (
        <>
          <div className="blob" />
          <span className="em" aria-hidden="true">{e.emoji}</span>
        </>
      )}
      {title && !e.image && <span className="ptitle">{e.title.split(" · ")[0]}</span>}
      {badge && <DateBadge date={e.date} />}
    </div>
  );
}

/** Host avatar: photo from the database when there is one, else a coloured initial. */
export function HostAv({ h }: { h: { name: string; color: string; photo_url?: string | null } }) {
  return (
    <div className="av" style={{ background: h.color }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {h.photo_url ? <img src={h.photo_url} alt={h.name} loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : h.name[0]}
    </div>
  );
}

export function SaveButton({ id, label = false, className = "" }: { id: string; label?: boolean; className?: string }) {
  const { isSaved, toggleSave } = useApp();
  const on = isSaved(id);
  return (
    <motion.button whileTap={{ scale: 0.85 }} className={`${label ? "btn btn-white btn-sm" : "save-btn"} ${on ? "on" : ""} ${className}`}
      aria-label={on ? "Remove from saved" : "Save"} aria-pressed={on}
      onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); if (!on) { burstFrom(ev.currentTarget, ["💖", "💕", "✨"], 9); buzz(); } toggleSave(id); }}>
      <motion.span key={String(on)} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
        {on ? "♥" : "♡"}
      </motion.span>
      {label && (on ? " Saved" : " Save")}
    </motion.button>
  );
}

/* Lines in the same `group` (e.g. every card title on the page) share one size, so cards look even.
   A line that needs to go below the group's `floor` shrinks on its own; it never drags the whole group down. */
const FIT_GROUPS = new Map<string, { els: Set<HTMLElement>; floor: number }>();
const FIT_PENDING = new Set<string>();
function fitGroup(g: string) {
  if (FIT_PENDING.has(g)) return; FIT_PENDING.add(g);
  requestAnimationFrame(() => {
    FIT_PENDING.delete(g);
    const grp = FIT_GROUPS.get(g); if (!grp) return;
    let size = Infinity;
    grp.els.forEach((el) => { const n = Number(el.dataset.fit); if (n >= grp.floor) size = Math.min(size, n); });
    grp.els.forEach((el) => { const n = Number(el.dataset.fit); el.style.fontSize = `${n < size ? n : size === Infinity ? n : size}px`; });
  });
}

/** One line, always: the text shrinks (down to `min` px) until it fits its box, on every screen size. */
export function FitLine({ as: Tag = "span", className = "", min = 10, group, floor = 0, children }: { as?: "span" | "h3" | "b" | "p" | "div"; className?: string; min?: number; group?: string; floor?: number; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    if (group) { const g = FIT_GROUPS.get(group) ?? { els: new Set<HTMLElement>(), floor }; g.els.add(el); FIT_GROUPS.set(group, g); }
    let last = -1;
    const fit = () => {
      const w = el.clientWidth; if (w === last) return; last = w;   // only when the box width changes (not on our own font change)
      el.style.fontSize = "";
      let fs = parseFloat(getComputedStyle(el).fontSize);
      // real text width (sub-pixel), not scrollWidth: a 0.4px overflow still shows "…"
      const rg = document.createRange(); rg.selectNodeContents(el);
      const over = () => rg.getBoundingClientRect().width > el.getBoundingClientRect().width - 0.75;
      while (over() && fs > min) { fs -= 0.5; el.style.fontSize = `${fs}px`; }
      el.dataset.fit = String(fs);
      if (group) fitGroup(group);
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    // the web font arrives after the first paint and makes text wider: measure again once it's in
    let alive = true;
    const refit = () => { if (alive) { last = -1; fit(); } };
    document.fonts?.ready.then(refit);
    document.fonts?.addEventListener?.("loadingdone", refit);
    return () => { alive = false; document.fonts?.removeEventListener?.("loadingdone", refit); ro.disconnect(); if (group) { FIT_GROUPS.get(group)?.els.delete(el); fitGroup(group); } };
  }, [children, min, group, floor]);
  const T = Tag as React.ElementType;
  return <T ref={ref} className={`fit1 ${className}`}>{children}</T>;
}

export function EventCard({ e, index = 0, extra }: { e: MeetEvent; index?: number; extra?: React.ReactNode }) {
  const { city } = useApp();
  const real = e.key.startsWith("x");
  const cnt = usePlanCount(e.id, real);
  const left = cnt ? Math.max(0, e.seats - cnt.approved_seats) : e.left;
  const low = left <= 4;
  const st = bookingState(e);
  const tilt = useTilt(6);
  return (
    <motion.article className={`card${st !== "open" ? " card-closed" : ""}`} style={{ ...tilt.style, ["--gx" as string]: tilt.glareX }} {...tilt.handlers}
      initial={{ opacity: 0, y: 48, scale: 0.92, rotate: index % 2 ? 3 : -3 }} whileInView={{ opacity: 1, y: 0, scale: 1, rotate: 0 }} viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={{ type: "spring", stiffness: 170, damping: 19, delay: (index % 2) * 0.08 }}
      whileHover={{ y: -4, boxShadow: "7px 7px 0 #16122B" }} whileTap={{ scale: 0.97 }}>
      <span className="glare" aria-hidden="true" />
      <Poster e={e} />
      {st !== "open" && <span className="closed-badge">{st === "ended" ? "Ended" : "Booking closed"}</span>}
      <SaveButton id={e.id} />
      {e.tags.length > 0 && <div className="tagrow">{e.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
      <div className="card-body">
        {extra}
        <FitLine group="card-when" floor={10.5} min={8.5} className="when"><b>{e.time}</b><i aria-hidden="true">·</i>{e.area}{city === "all" ? ` · ${CONFIG.cities[e.city].name}` : ""}</FitLine>
        <span className="card-tt" title={e.title}><FitLine group="card-title" floor={13.5} min={9} as="h3">{e.title.split(" · ")[0]}</FitLine></span>
        <FitLine group="card-by" floor={11} min={8.5} className={`by ${hostTba(e) ? "tba" : ""}`}><span className="by-ic" aria-hidden="true">{hostTba(e) ? "🎙️" : "✓"}</span>{hostLine(e)}</FitLine>
        <div className="card-foot">
          <FitLine group="card-price" floor={11} min={8.5} className="cf-price"><b>{priceShort(e)}</b><span>{priceLabel(e)}</span></FitLine>
          {st !== "open" ? <FitLine group="card-stats" floor={10.5} as="p" className="card-stats closed"><b>{st === "ended" ? "🏁 Event ended" : "🔒 Registration closed"}</b></FitLine> :
          <FitLine group="card-stats" floor={10.5} as="p" className={`card-stats${low ? " low" : ""}${left === 0 ? " full" : ""}`}><i className="dot" aria-hidden="true" /><b>{left === 0 ? "Full · join the waitlist" : `${left} of ${e.seats} seats left`}</b>
            {cnt && cnt.waitlisted > 0 && <> · {cnt.waitlisted} waiting</>}</FitLine>}
        </div>
      </div>
      <Link className="card-link" href={eventUrl(e)} aria-label={e.title} />
    </motion.article>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="empty" style={{ gridColumn: "1/-1" }}><b>{title}</b>{children}</div>;
}

export function Chips({ value, onChange, counts }: { value: string; onChange: (id: string) => void; counts?: Record<string, number> }) {
  return (
    <div className="chips" role="tablist">
      {(CATEGORIES as { id: string; label: string; icon: string }[]).map((c) => (
        <motion.button key={c.id} whileTap={{ scale: 0.9 }} className={`pill chip ${value === c.id ? "on" : ""}`} role="tab" aria-selected={value === c.id} onClick={() => { onChange(c.id); buzz(); }}>
          {value === c.id && <motion.span layoutId="chip-on" className="chip-bg" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
          <span className="chip-txt">{c.icon} {c.label}{counts && <span className="muted" style={{ marginLeft: 4, color: value === c.id ? "#BDB8D0" : undefined }}>{counts[c.id] ?? 0}</span>}</span>
        </motion.button>
      ))}
    </div>
  );
}

/** Opens WhatsApp with a pre-written message (the request goes to the meetra team). */
export function WhatsAppDone({ text, heading, link }: { text: string; heading: string; link: string }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
      style={{ textAlign: "center", padding: "8px 0" }}>
      <div style={{ fontSize: 44 }}>✅</div>
      <h3 style={{ fontSize: 22, letterSpacing: "-.03em", margin: "6px 0" }}>{heading}</h3>
      <p className="muted" style={{ marginBottom: 14 }}>Last step: send the message we&apos;ve written for you.</p>
      <a className="btn btn-sun btn-block" href={link} target="_blank" rel="noopener noreferrer">Send on WhatsApp →</a>
      <p className="fine" style={{ marginTop: 8 }}>{text.split("\n")[0]}</p>
    </motion.div>
  );
}

/* ---------- sorting events: type, who can come, day or night (Discover + Explore) ---------- */
export type SortF = { cat: string; aud: string; part: string };
export const SORT_ALL: SortF = { cat: "all", aud: "all", part: "all" };
export const sortOk = (e: MeetEvent, f: SortF) =>
  (f.cat === "all" || e.cat === f.cat) && (f.aud === "all" || e.audience === f.aud) && (f.part === "all" || dayPart(e) === f.part);
export function SortBar({ v, onChange, withCat = true, id }: { v: SortF; onChange: (f: SortF) => void; withCat?: boolean; id?: string }) {
  const set = (k: keyof SortF, x: string) => { onChange({ ...v, [k]: x }); buzz(); };
  return (
    <div className="sort-bar" role="group" aria-label="Sort plans">
      {withCat && <select className="select" value={v.cat} aria-label="Type of plan" onChange={(e) => set("cat", e.target.value)}>
        {(CATEGORIES as { id: string; label: string; icon: string }[]).map((c) => <option key={c.id} value={c.id}>{c.id === "all" ? "All types" : `${c.icon} ${c.label}`}</option>)}
      </select>}
      <select className="select" value={v.aud} aria-label="Who can come" onChange={(e) => set("aud", e.target.value)}>
        <option value="all">Everyone</option><option value="mixed">👫 Mixed</option><option value="women">👩 Girls only</option><option value="men">👨 Boys only</option>
      </select>
      <div className="seg sort-part" role="radiogroup" aria-label="Day or night">
        {([["all", "Any time"], ["day", "☀️ Day"], ["night", "🌙 Night"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={v.part === k} className={v.part === k ? "on" : ""} onClick={() => set("part", k)}>
            {v.part === k && <motion.span layoutId={`part-on-${id ?? (withCat ? "a" : "b")}`} className="seg-bg" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}<span>{l}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
