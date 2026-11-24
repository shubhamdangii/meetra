"use client";
// Real meetup photos: polaroid strip + tap-to-open lightbox. Files come from public/images (see image-manifest).
import { AnimatePresence, motion } from "framer-motion";
import { lockScroll } from "@/lib/scrollLock";
import { useEffect, useState } from "react";
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

function Lightbox({ photos, index, onIndex }: { photos: Photo[]; index: number | null; onIndex: (i: number | null) => void }) {
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
