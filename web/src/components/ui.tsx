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

/** One line, always: the text shrinks (down to `min` px) until it fits its box, on every screen size. */
export function FitLine({ as: Tag = "span", className = "", min = 11, children }: { as?: "span" | "h3" | "b" | "p" | "div"; className?: string; min?: number; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      let fs = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth + 0.5 && fs > min) { fs -= 0.5; el.style.fontSize = `${fs}px`; }
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [children, min]);
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
        <FitLine className="when">{e.time} · {e.area}{city === "all" ? " · " + CONFIG.cities[e.city].name : ""}</FitLine>
        <FitLine as="h3" min={13}>{e.title}</FitLine>
        <FitLine className={`by ${hostTba(e) ? "tba" : ""}`}>{hostTba(e) ? "🎙️ " : ""}{hostLine(e)}</FitLine>
        <div className="price">
          <FitLine><b>{priceShort(e)}</b> {priceLabel(e)}</FitLine>
          {left === 0 && <span className="seats-left">Waitlist</span>}
        </div>
        {st !== "open" ? <FitLine as="p" className="card-stats closed"><b>{st === "ended" ? "🏁 Event ended" : "🔒 Registration closed"}</b></FitLine> :
        <FitLine as="p" className={`card-stats${low ? " low" : ""}`}><b>{left === 0 ? "Full · join the waitlist" : `${left} of ${e.seats} seats left`}</b>
          {cnt && cnt.approved_seats > 0 && <> · {cnt.approved_seats} accepted</>}
          {cnt && cnt.waitlisted > 0 && <> · {cnt.waitlisted} waiting</>}</FitLine>}
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
export function SortBar({ v, onChange, withCat = true }: { v: SortF; onChange: (f: SortF) => void; withCat?: boolean }) {
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
            {v.part === k && <motion.span layoutId={`part-on-${withCat ? "a" : "b"}`} className="seg-bg" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}<span>{l}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
