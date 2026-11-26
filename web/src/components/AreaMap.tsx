"use client";
// Lightweight map: OpenStreetMap tiles laid out by hand (no map library,
// no iframe). Drag to pan; pinch, double-tap, ctrl/trackpad scroll or +/- to zoom. Pins are areas, never exact venues.
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
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number } | null>(null);
  const lastTap = useRef(0);
  const st = useRef({ z: z0, off: { x: 0, y: 0 }, w: 0 });

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
  st.current = { z, off, w };
  /** Zoom by d levels keeping the point (px, py) inside the map where it is (default: the middle). */
  const zoomAt = (d: number, px?: number, py?: number) => {
    const { z: cz, off: o, w: cw } = st.current;
    const nz = Math.max(8, Math.min(17, cz + d)); const k = 2 ** (nz - cz);
    if (nz === cz) return;
    const x = px ?? cw / 2, y = py ?? height / 2;
    const no = { x: k * (o.x + cw / 2 - x) + x - cw / 2, y: k * (o.y + height / 2 - y) + y - height / 2 };
    st.current = { z: nz, off: no, w: cw };
    setZ(nz); setOff(no);
  };
  const zoomBy = (d: number) => zoomAt(d);
  const local = (e: { clientX: number; clientY: number }) => { const r = box.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  // ctrl/⌘ + wheel and trackpad pinch zoom the map (plain scrolling still scrolls the page)
  useEffect(() => {
    const el = box.current; if (!el) return;
    let acc = 0;
    const onWheel = (ev: WheelEvent) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      acc += -ev.deltaY;
      if (Math.abs(acc) >= 40) { const p = local(ev); zoomAt(acc > 0 ? 1 : -1, p.x, p.y); acc = 0; }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const mPerPx = (40075016 * Math.cos((center[0] * Math.PI) / 180)) / (256 * 2 ** z);

  return (
    <div className="amap" ref={box} style={{ height }}
      onPointerDown={(e) => {
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.current.size === 2) {
          const [a, b] = [...pts.current.values()];
          pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag.current = null; return;
        }
        // double-tap / double-click zooms in where you tapped
        const now = Date.now();
        if (now - lastTap.current < 300) { const p = local(e); zoomAt(1, p.x, p.y); lastTap.current = 0; return; }
        lastTap.current = now;
        drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y, moved: false };
      }}
      onPointerMove={(e) => {
        if (!pts.current.has(e.pointerId)) return;
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch.current && pts.current.size === 2) {
          const [a, b] = [...pts.current.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const ratio = dist / Math.max(1, pinch.current.d);
          if (ratio > 1.6 || ratio < 0.62) {
            const mid = local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
            zoomAt(ratio > 1 ? 1 : -1, mid.x, mid.y); pinch.current = { d: dist };
          }
          return;
        }
        const d = drag.current; if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) { d.moved = true; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* pointer already gone */ } }
        setOff({ x: d.ox + dx, y: d.oy + dy });
      }}
      onPointerUp={(e) => { pts.current.delete(e.pointerId); if (pts.current.size < 2) pinch.current = null; drag.current = null; }}
      onPointerCancel={(e) => { pts.current.delete(e.pointerId); pinch.current = null; drag.current = null; }}>
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
