"use client";
// Lightweight map: OpenStreetMap tiles laid out by hand (no map library,
// no iframe). Drag to pan, +/- to zoom. Pins are areas, never exact venues.
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { project } from "@/lib/geo";

export type Pin = { id: string; lat: number; lon: number; label: string; emoji?: string; count?: number };

const tile = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

export function AreaMap({ center, zoom: z0 = 13, pins = [], radius = 0, height = 260, onPin, selected, fit = false }: {
  center: [number, number]; zoom?: number; pins?: Pin[]; radius?: number; height?: number;
  onPin?: (p: Pin) => void; selected?: string | null; fit?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [z, setZ] = useState(z0);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // Zoom to fit all pins once the width is known.
  useEffect(() => {
    if (!fit || !w || pins.length < 2) return;
    for (let zz = 15; zz >= 8; zz--) {
      const ps = pins.map((p) => project(p.lat, p.lon, zz));
      const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
      if (Math.max(...xs) - Math.min(...xs) < w - 70 && Math.max(...ys) - Math.min(...ys) < height - 80) { setZ(zz); break; }
    }
  }, [fit, w, height, pins]);

  const c = useMemo(() => {
    if (fit && pins.length > 1) {
      const ps = pins.map((p) => project(p.lat, p.lon, z));
      const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    }
    return project(center[0], center[1], z);
  }, [center, z, fit, pins]);
  const cx = c.x - off.x, cy = c.y - off.y;
  const left = cx - w / 2, top = cy - height / 2;
  const tiles: { k: string; x: number; y: number; src: string }[] = [];
  if (w) {
    const max = 2 ** z;
    for (let tx = Math.floor(left / 256); tx <= Math.floor((left + w) / 256); tx++)
      for (let ty = Math.floor(top / 256); ty <= Math.floor((top + height) / 256); ty++)
        if (ty >= 0 && ty < max) tiles.push({ k: `${z}/${tx}/${ty}`, x: tx * 256 - left, y: ty * 256 - top, src: tile(z, ((tx % max) + max) % max, ty) });
  }
  const zoomBy = (d: number) => { setZ((v) => Math.max(8, Math.min(17, v + d))); setOff((o) => ({ x: o.x * 2 ** d, y: o.y * 2 ** d })); };
  const mPerPx = (40075016 * Math.cos((center[0] * Math.PI) / 180)) / (256 * 2 ** z);

  return (
    <div className="amap" ref={box} style={{ height }}
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y, moved: false }; }}
      onPointerMove={(e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 4) { d.moved = true; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } setOff({ x: d.ox + dx, y: d.oy + dy }); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {tiles.map((t) => <img key={t.k} src={t.src} alt="" draggable={false} className="amap-tile" style={{ transform: `translate(${t.x}px,${t.y}px)` }} />)}
      {radius > 0 && w > 0 && (() => { const p = project(center[0], center[1], z); const r = radius / mPerPx; return (
        <motion.span className="amap-area" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 120, damping: 14 }}
          style={{ left: p.x - left - r, top: p.y - top - r, width: r * 2, height: r * 2 }} />); })()}
      {w > 0 && pins.map((p, i) => {
        const q = project(p.lat, p.lon, z);
        return (
          <motion.button key={p.id} type="button" className={`amap-pin ${selected === p.id ? "on" : ""}`} style={{ left: q.x - left, top: q.y - top }}
            initial={{ y: -30, opacity: 0, scale: 0.4 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 15, delay: 0.03 * i }}
            onClick={(e) => { e.stopPropagation(); if (!drag.current?.moved) onPin?.(p); }} aria-label={p.label}>
            <span>{p.emoji ?? "📍"}</span>{p.count && p.count > 1 ? <i>{p.count}</i> : null}
          </motion.button>
        );
      })}
      <div className="amap-zoom"><button type="button" aria-label="Zoom in" onClick={() => zoomBy(1)}>+</button><button type="button" aria-label="Zoom out" onClick={() => zoomBy(-1)}>−</button></div>
      <AnimatePresence>{(off.x || off.y) ? <motion.button type="button" className="amap-reset" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOff({ x: 0, y: 0 })}>Re-centre</motion.button> : null}</AnimatePresence>
      <small className="amap-attr">© OpenStreetMap contributors</small>
    </div>
  );
}
