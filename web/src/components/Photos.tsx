"use client";
// Real meetup photos: polaroid strip + tap-to-open lightbox. Files come from public/images (see image-manifest).
import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import { lockScroll } from "@/lib/scrollLock";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Gallery } from "./fx";

export type Photo = { src: string; caption?: string };
const ROT = [-3, 2, -1.5, 2.5, -2, 1.2];

export function PhotoStrip({ photos, label, auto = 0 }: { photos: Photo[]; label: string; auto?: number }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <Gallery label={label} auto={auto}>
        {photos.map((p, i) => (
          <motion.button key={p.src} type="button" className="polaroid" onClick={() => setOpen(i)} aria-label={`Open photo${p.caption ? `: ${p.caption}` : ""}`}
            initial={{ opacity: 0, y: 40, rotate: 0, scale: 0.9 }} whileInView={{ opacity: 1, y: 0, rotate: ROT[i % ROT.length], scale: 1 }}
            viewport={{ once: true, margin: "0px 0px -30px 0px" }} transition={{ type: "spring", stiffness: 160, damping: 18, delay: Math.min(i, 4) * 0.06 }}
            whileHover={{ rotate: 0, scale: 1.04, y: -6 }} whileTap={{ scale: 0.96 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.src} alt={p.caption || "meetra meetup photo"} loading="lazy" decoding="async" draggable={false} />
            {p.caption && <span className="cap">{p.caption}</span>}
          </motion.button>
        ))}
      </Gallery>
      <Lightbox photos={photos} index={open} onIndex={setOpen} />
    </>
  );
}

/** Photos move sideways as the page scrolls down: the section stays pinned until the last photo is in view, then the page carries on.
 *  It's plain page scroll (no wheel/touch hijacking), so mouse, trackpad, touch, keyboard and scrolling back up all just work.
 *  Reduced motion: a normal swipe strip. */
const SPEED = 1.6;   // photos move 1.6 px sideways per px of page scroll
export function PinnedPhotoStrip({ photos, label, head }: { photos: Photo[]; label: string; head?: React.ReactNode }) {
  const [open, setOpen] = useState<number | null>(null);
  const outer = useRef<HTMLDivElement>(null), view = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null);
  const [dist, setDist] = useState(0);
  const [still, setStill] = useState(false);
  useEffect(() => { setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  // the pinned range in page pixels: from "section reaches its sticky top" to "section bottom leaves", measured from the real layout
  const geo = useRef({ start: 0, len: 1 });
  useEffect(() => {
    const measure = () => {
      const t = track.current, v = view.current, o = outer.current; if (!t || !v || !o) return;
      // travel = track width minus the visible box (inside the padding), plus room for the last card's tilt; never past the screen edge
      const cs = getComputedStyle(v);
      const box = Math.min(v.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), window.innerWidth - 32);
      setDist(Math.max(0, t.scrollWidth - box + 14));
      const s = o.firstElementChild as HTMLElement;
      const stickyTop = parseFloat(getComputedStyle(s).top) || 0;
      geo.current = { start: o.getBoundingClientRect().top + window.scrollY - stickyTop, len: Math.max(1, o.offsetHeight - s.offsetHeight) };
    };
    measure();
    const ro = new ResizeObserver(measure); if (track.current) ro.observe(track.current); if (view.current) ro.observe(view.current); ro.observe(document.body);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [photos.length, still, dist]);
  const { scrollY } = useScroll();
  // read the live position every frame (content above can change height), so the last photo lands exactly when the section un-pins
  const prog = useTransform(scrollY, () => {
    const o = outer.current; if (!o) return 0;
    const sEl = o.firstElementChild as HTMLElement;
    const top = parseFloat(getComputedStyle(sEl).top) || 0;
    const len = Math.max(1, o.offsetHeight - sEl.offsetHeight);
    return Math.min(1, Math.max(0, (top - o.getBoundingClientRect().top) / len));
  });
  const x = useTransform(prog, (p) => -dist * p);
  const pct = useTransform(prog, (p) => `${p * 100}%`);
  if (!photos.length) return null;
  if (still) return <>{head}<PhotoStrip photos={photos} label={label} /></>;
  // keyboard: tabbing to a photo scrolls the page to the point where that photo is on screen
  const focusPhoto = (el: HTMLElement) => {
    const v = view.current; if (!v || !dist) return;
    v.scrollLeft = 0;
    const want = Math.min(dist, Math.max(0, el.offsetLeft - 24)) / dist;
    window.scrollTo({ top: geo.current.start + want * geo.current.len, behavior: "smooth" });
  };
  return (
    <>
      <div ref={outer} className="pin" style={{ height: `calc(var(--pin-h) + ${Math.round(dist / SPEED)}px)` }}>
        <div className="pin-sticky">
          {head}
          <div ref={view} className="pin-view" role="region" aria-label={label}>
            <motion.div ref={track} className="pin-track" style={{ x }}>
              {photos.map((p, i) => (
                <motion.button key={p.src} type="button" className="polaroid" onClick={() => setOpen(i)} onFocus={(e) => focusPhoto(e.currentTarget)}
                  aria-label={`Open photo ${i + 1} of ${photos.length}${p.caption ? `: ${p.caption}` : ""}`} style={{ rotate: ROT[i % ROT.length] }}
                  whileHover={{ rotate: 0, scale: 1.04, y: -6 }} whileTap={{ scale: 0.96 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt={p.caption || "meetra meetup photo"} loading={i < 6 ? "eager" : "lazy"} decoding="async" draggable={false} />
                  {p.caption && <span className="cap">{p.caption}</span>}
                </motion.button>
              ))}
            </motion.div>
          </div>
          <div className="pin-bar" aria-hidden="true"><motion.i style={{ width: pct }} /></div>
        </div>
      </div>
      <Lightbox photos={photos} index={open} onIndex={setOpen} />
    </>
  );
}

export function Lightbox({ photos, index, onIndex }: { photos: Photo[]; index: number | null; onIndex: (i: number | null) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (index === null) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onIndex(null);
      if (e.key === "ArrowRight") onIndex((index + 1) % photos.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + photos.length) % photos.length);
    };
    const unlock = lockScroll();
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); unlock(); };
  }, [index, photos.length, onIndex]);
  if (!mounted) return null;
  const p = index === null ? null : photos[index];
  return createPortal(
    <AnimatePresence>
      {p && index !== null && (
        <motion.div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={() => onIndex(null)}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.figure key={p.src} onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.85, rotate: -3, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            drag="x" dragSnapToOrigin dragElastic={0.5}
            onDragEnd={(_, info) => { if (info.offset.x < -60) onIndex((index + 1) % photos.length); else if (info.offset.x > 60) onIndex((index - 1 + photos.length) % photos.length); }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.src} alt={p.caption || "meetra meetup photo"} draggable={false} />
            <figcaption>{p.caption || " "}<span>{index + 1} / {photos.length}</span></figcaption>
          </motion.figure>
          <button type="button" className="lb-close" aria-label="Close" onClick={() => onIndex(null)}>✕</button>
          {photos.length > 1 && <>
            <button type="button" className="lb-nav prev" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); onIndex((index - 1 + photos.length) % photos.length); }}>‹</button>
            <button type="button" className="lb-nav next" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); onIndex((index + 1) % photos.length); }}>›</button>
          </>}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
