"use client";
// Pick the part of a photo that goes in the round profile picture: drag to move, slider (or pinch / wheel) to zoom.
// Only the chosen square (shown as a circle) is uploaded, never the whole photo.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lockScroll } from "@/lib/scrollLock";

const OUT = 512;   // final size in px (square; shown as a circle everywhere)

export function PhotoCropper({ file, onCancel, onDone }: { file: File | null; onCancel: () => void; onDone: (img: File) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });   // image centre offset from the circle centre, in box px
  const [box, setBox] = useState(300);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; px: number; py: number } | null>(null);
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file); setSrc(u);
    const im = new Image(); im.onload = () => { setImg(im); setZoom(1); setPos({ x: 0, y: 0 }); }; im.src = u;
    setBox(Math.min(320, window.innerWidth - 64));
    const unlock = lockScroll();
    return () => { URL.revokeObjectURL(u); setImg(null); setSrc(null); unlock(); };
  }, [file]);

  // the photo always covers the circle: base scale fills the box on the short side
  const base = img ? box / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const s = base * zoom;
  const w = img ? img.naturalWidth * s : 0, h = img ? img.naturalHeight * s : 0;
  const clamp = (p: { x: number; y: number }, ww = w, hh = h) => ({
    x: Math.max(-(ww - box) / 2, Math.min((ww - box) / 2, p.x)),
    y: Math.max(-(hh - box) / 2, Math.min((hh - box) / 2, p.y)),
  });
  const setZoomSafe = (z: number) => {
    const nz = Math.max(1, Math.min(4, z));
    if (!img) return setZoom(nz);
    const ns = base * nz;
    setZoom(nz); setPos((p) => clamp(p, img.naturalWidth * ns, img.naturalHeight * ns));
  };

  function down(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; drag.current = null;
    } else drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  }
  function move(e: React.PointerEvent) {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      setZoomSafe(pinch.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.current.d)));
    } else if (drag.current && drag.current.id === e.pointerId) {
      setPos(clamp({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }));
    }
  }
  function up(e: React.PointerEvent) { pts.current.delete(e.pointerId); if (pts.current.size < 2) pinch.current = null; if (drag.current?.id === e.pointerId) drag.current = null; }

  async function save() {
    if (!img || !file) return;
    setBusy(true);
    // the circle's square in original-image pixels
    const side = box / s;
    const cx = img.naturalWidth / 2 - pos.x / s, cy = img.naturalHeight / 2 - pos.y / s;
    const c = document.createElement("canvas"); c.width = c.height = OUT;
    const g = c.getContext("2d")!; g.imageSmoothingQuality = "high";
    g.fillStyle = "#fff"; g.fillRect(0, 0, OUT, OUT);
    g.drawImage(img, cx - side / 2, cy - side / 2, side, side, 0, 0, OUT, OUT);
    const webp = c.toDataURL("image/webp").startsWith("data:image/webp");
    const type = webp ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, type, 0.85));
    setBusy(false);
    if (blob) onDone(new File([blob], `profile.${webp ? "webp" : "jpg"}`, { type }));
  }

  if (!file || typeof document === "undefined") return null;
  return createPortal(
    <div className="crop-bg" role="dialog" aria-modal="true" aria-label="Crop your profile photo" onClick={onCancel}>
      <div className="crop-card" onClick={(e) => e.stopPropagation()}>
        <b>Position your photo</b>
        <small className="muted">Drag to move · pinch or use the slider to zoom</small>
        <div className="crop-box" style={{ width: box, height: box }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onWheel={(e) => setZoomSafe(zoom * (e.deltaY < 0 ? 1.08 : 0.93))}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src && img && <img src={src} alt="" draggable={false} style={{ width: w, height: h, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }} />}
          {!img && <div className="skeleton" style={{ position: "absolute", inset: 0 }} />}
          <i className="crop-ring" aria-hidden="true" />
        </div>
        <label className="crop-zoom"><span aria-hidden="true">－</span>
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoomSafe(Number(e.target.value))} aria-label="Zoom" />
          <span aria-hidden="true">＋</span></label>
        <div className="crop-acts">
          <button type="button" className="btn btn-white btn-sm" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-ink btn-sm" disabled={!img || busy} onClick={save}>{busy ? "Saving…" : "Use this photo"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
