"use client";
// Motion toolkit: swipeable galleries, emoji bursts, 3D tilt, magnetic buttons, scroll progress.
// Everything respects "reduce motion" in the visitor's phone/computer settings.
import { animate, motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- emoji burst: little emojis fly out from a point ---------- */
export function burst(x: number, y: number, emojis = ["🎉", "✨", "💖", "🥳", "⭐"], count = 18) {
  if (typeof document === "undefined" || reducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "burst-bit";
    el.textContent = emojis[i % emojis.length];
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    document.body.appendChild(el);
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 70 + Math.random() * 110;
    const anim = el.animate([
      { transform: "translate(-50%,-50%) scale(.4) rotate(0deg)", opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist - 40}px)) scale(1.15) rotate(${Math.random() * 120 - 60}deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(calc(-50% + ${Math.cos(angle) * dist * 1.2}px), calc(-50% + ${Math.sin(angle) * dist + 60}px)) scale(.8)`, opacity: 0 },
    ], { duration: 900 + Math.random() * 400, easing: "cubic-bezier(.2,.8,.2,1)" });
    anim.onfinish = () => el.remove();
  }
}
export const burstFrom = (el: Element | null, emojis?: string[], count?: number) => {
  if (!el) return; const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, emojis, count);
};

/* ---------- thin gradient bar showing how far you've scrolled ---------- */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30, mass: 0.3 });
  return <motion.div className="scroll-progress" style={{ scaleX }} aria-hidden="true" />;
}

/* ---------- 3D tilt that follows the cursor (desktop only) ---------- */
export function useTilt(max = 8) {
  const rx = useMotionValue(0), ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 250, damping: 20 }), sry = useSpring(ry, { stiffness: 250, damping: 20 });
  const glareX = useTransform(sry, [-max, max], ["0%", "100%"]);
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse" || reducedMotion()) return;
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * max * 2);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * max * 2);
  }, [max, rx, ry]);
  const onPointerLeave = useCallback(() => { rx.set(0); ry.set(0); }, [rx, ry]);
  return { style: { rotateX: srx, rotateY: sry, transformPerspective: 900 }, glareX, handlers: { onPointerMove, onPointerLeave } };
}

/* ---------- buttons that lean toward the cursor ---------- */
export function Magnetic({ children, strength = 0.25 }: { children: React.ReactNode; strength?: number }) {
  const x = useMotionValue(0), y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 18 }), sy = useSpring(y, { stiffness: 300, damping: 18 });
  return (
    <motion.span style={{ x: sx, y: sy, display: "inline-block" }}
      onPointerMove={(e) => { if (e.pointerType !== "mouse" || reducedMotion()) return; const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left - r.width / 2) * strength); y.set((e.clientY - r.top - r.height / 2) * strength); }}
      onPointerLeave={() => { x.set(0); y.set(0); }}>
      {children}
    </motion.span>
  );
}

/* ---------- headline that pops in word by word ---------- */
export function WordReveal({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <span className={className}>
      {text.split(" ").map((w, i) => (
        <motion.span key={i} style={{ display: "inline-block", whiteSpace: "pre" }}
          initial={reduce ? false : { opacity: 0, y: "0.6em", rotate: -4 }} animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 18, delay: delay + i * 0.07 }}>
          {w}{" "}
        </motion.span>
      ))}
    </span>
  );
}

/* ---------- swipeable horizontal gallery (right ↔ left) ----------
   Touch: native swipe with snap. Mouse: drag, wheel, or the arrow buttons. */
export function Gallery({ children, label, auto = 0, className = "" }: { children: React.ReactNode; label: string; auto?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const [progress, setProgress] = useState(0);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const hover = useRef(false);

  const update = useCallback(() => {
    const el = ref.current; if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft > max - 8 });
    setProgress(max > 0 ? el.scrollLeft / max : 0);
  }, []);
  useEffect(() => { update(); const el = ref.current; if (!el) return; const ro = new ResizeObserver(update); ro.observe(el); return () => ro.disconnect(); }, [update]);

  const step = (dir: 1 | -1) => {
    const el = ref.current; if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    el.scrollBy({ left: dir * ((card?.offsetWidth ?? 280) + 16) * (window.innerWidth > 720 ? 2 : 1), behavior: reducedMotion() ? "auto" : "smooth" });
  };
  // gentle auto-advance (pauses on hover/touch, loops back at the end)
  useEffect(() => {
    if (!auto || reducedMotion()) return;
    const t = setInterval(() => {
      const el = ref.current; if (!el || hover.current || document.hidden) return;
      if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 8) el.scrollTo({ left: 0, behavior: "smooth" }); else step(1);
    }, auto);
    return () => clearInterval(t);
  }, [auto]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`gallery ${className}`} onPointerEnter={() => { hover.current = true; }} onPointerLeave={() => { hover.current = false; }}>
      <div ref={ref} className={`gallery-track ${edge.start ? "at-start" : ""} ${edge.end ? "at-end" : ""}`} role="region" aria-label={label} tabIndex={0}
        onScroll={update}
        onPointerDown={(e) => { if (e.pointerType !== "mouse") return; drag.current = { x: e.clientX, left: ref.current!.scrollLeft, moved: false }; }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x; if (Math.abs(dx) > 5) { d.moved = true; ref.current!.classList.add("dragging"); } ref.current!.scrollLeft = d.left - dx; }}
        onPointerUp={() => { setTimeout(() => ref.current?.classList.remove("dragging"), 0); drag.current = null; }}
        onPointerLeave={() => { ref.current?.classList.remove("dragging"); drag.current = null; }}
        onClickCapture={(e) => { if (ref.current?.classList.contains("dragging")) { e.preventDefault(); e.stopPropagation(); } }}
        onKeyDown={(e) => { if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); }}>
        {children}
      </div>
      <div className="gallery-foot">
        <div className="gallery-bar" aria-hidden="true"><motion.i animate={{ width: `${Math.max(12, progress * 100)}%` }} transition={{ type: "spring", stiffness: 200, damping: 30 }} /></div>
        <div className="gallery-arrows">
          <motion.button whileTap={{ scale: 0.85 }} type="button" className="g-arrow" disabled={edge.start} onClick={() => step(-1)} aria-label={`Scroll ${label} left`}>←</motion.button>
          <motion.button whileTap={{ scale: 0.85 }} type="button" className="g-arrow" disabled={edge.end} onClick={() => step(1)} aria-label={`Scroll ${label} right`}>→</motion.button>
        </div>
      </div>
    </div>
  );
}

/* ---------- number that counts up when it scrolls into view ---------- */
export function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reducedMotion()) { setN(to); return; }
    const c = animate(0, to, { duration: 1.4, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [inView, to]);
  return <span ref={ref}>{n}{suffix}</span>;
}

/* ---------- tiny vibration on Android phones (ignored elsewhere) ---------- */
export function buzz(ms = 10) {
  try { if (!reducedMotion() && "vibrate" in navigator) navigator.vibrate(ms); } catch {}
}

/* ---------- headings & highlights animate in as you scroll (works great on phones) ---------- */
export function ScrollFX() {
  const path = usePathname();
  useEffect(() => {
    if (reducedMotion() || !("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("fx-ready");
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("fx-in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -12% 0px" });
    const t = setTimeout(() => document.querySelectorAll(".h2, .group-head, .eyebrow, .faq-big h2, .cta-band h2, .page-hero h1").forEach((el) => io.observe(el)), 50);
    return () => { clearTimeout(t); io.disconnect(); };
  }, [path]);
  return null;
}
