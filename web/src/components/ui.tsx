"use client";
import { motion, type HTMLMotionProps } from "framer-motion";
import Link from "next/link";
import { useApp } from "./AppProvider";
import { burstFrom, buzz, useTilt } from "./fx";
import { CONFIG } from "@/lib/config";
import { CATEGORIES } from "@/lib/data";
import { DOW, MON, type MeetEvent, eventUrl, hostLine, hostNames, hostTba, palette, priceLabel, priceShort } from "@/lib/events";
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

export function EventCard({ e, index = 0, extra }: { e: MeetEvent; index?: number; extra?: React.ReactNode }) {
  const { city } = useApp();
  const real = e.key.startsWith("x");
  const cnt = usePlanCount(e.id, real);
  const left = cnt ? Math.max(0, e.seats - cnt.approved_seats) : e.left;
  const low = left <= 4;
  const tilt = useTilt(6);
  return (
    <motion.article className="card" style={{ ...tilt.style, ["--gx" as string]: tilt.glareX }} {...tilt.handlers}
      initial={{ opacity: 0, y: 48, scale: 0.92, rotate: index % 2 ? 3 : -3 }} whileInView={{ opacity: 1, y: 0, scale: 1, rotate: 0 }} viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={{ type: "spring", stiffness: 170, damping: 19, delay: (index % 2) * 0.08 }}
      whileHover={{ y: -4, boxShadow: "7px 7px 0 #16122B" }} whileTap={{ scale: 0.97 }}>
      <span className="glare" aria-hidden="true" />
      <Poster e={e} />
      <SaveButton id={e.id} />
      {e.tags.length > 0 && <div className="tagrow">{e.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
      <div className="card-body">
        {extra}
        <span className="when">{e.time} · {e.area}{city === "all" ? " · " + CONFIG.cities[e.city].name : ""}</span>
        <h3>{e.title}</h3>
        <span className={`by ${hostTba(e) ? "tba" : ""}`}>{hostTba(e) ? "🎙️ " : ""}{hostLine(e)}</span>
        <div className="price">
          <span><b>{priceShort(e)}</b> {priceLabel(e)}</span>
          {left === 0 && <span className="seats-left">Waitlist</span>}
        </div>
        <p className={`card-stats${low ? " low" : ""}`}><b>{left === 0 ? "Full · join the waitlist" : `${left} of ${e.seats} seats left`}</b>
          {cnt && cnt.approved_seats > 0 && <> · {cnt.approved_seats} accepted</>}
          {cnt && cnt.waitlisted > 0 && <> · {cnt.waitlisted} waiting</>}</p>
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
