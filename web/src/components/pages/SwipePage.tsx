"use client";
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { deviceId, useAuth } from "../AuthProvider";
import { Poster } from "../ui";
import { burst, buzz } from "../fx";
import { type MeetEvent, eventUrl, hostLine, hostNames, priceLabel, priceShort, relDay } from "@/lib/events";
import { store } from "@/lib/store";

type Reaction = "interested" | "skip";
const KEY = "mt-swipes";

function SwipeCard({ e, top, depth, onDecide, onOpen, today }: {
  e: MeetEvent; top: boolean; depth: number; onDecide: (r: Reaction) => void; onOpen: () => void; today: Date;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-14, 14]);
  const yes = useTransform(x, [20, 110], [0, 1]);
  const no = useTransform(x, [-110, -20], [1, 0]);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 110 || info.velocity.x > 600) onDecide("interested");
    else if (info.offset.x < -110 || info.velocity.x < -600) onDecide("skip");
    else if (info.offset.y < -130) onOpen();
  };
  return (
    <motion.article className="scard" style={{ x, rotate, zIndex: 10 - depth, cursor: top ? "grab" : "default" }}
      drag={top ? true : false} dragSnapToOrigin dragElastic={0.6} onDragEnd={onDragEnd} whileDrag={{ cursor: "grabbing", scale: 1.02 }}
      onTap={() => top && Math.abs(x.get()) < 4 && onOpen()}
      initial={{ scale: 0.9, y: 30, opacity: 0 }}
      animate={{ scale: 1 - depth * 0.05, y: depth * 14, opacity: depth > 2 ? 0 : 1 - depth * 0.15 }}
      variants={{ gone: (custom: Reaction) => ({ x: custom === "interested" ? 600 : -600, rotate: custom === "interested" ? 28 : -28, opacity: 0, transition: { duration: 0.35 } }) }}
      exit="gone"
      transition={{ type: "spring", stiffness: 260, damping: 24 }}>
      <motion.span className="stamp-lbl yes" style={{ opacity: yes }}>INTERESTED</motion.span>
      <motion.span className="stamp-lbl no" style={{ opacity: no }}>SKIP</motion.span>
      <Poster e={e} title />
      <div className="sbody">
        <span className="when">{relDay(e.date, today)} · {e.time} · {e.area}</span>
        <h2>{e.title}</h2>
        <p>{e.blurb}</p>
        <div className="row"><span><b>{priceShort(e)}</b> {priceLabel(e)}</span><span className="muted">{hostLine(e)}</span></div>
      </div>
    </motion.article>
  );
}

export default function SwipePage() {
  const { ready, upcoming, inCity, today, isSaved, toggleSave, city } = useApp();
  const auth = useAuth();
  const router = useRouter();
  const [swipes, setSwipes] = useState<Record<string, Reaction>>({});
  const [undo, setUndo] = useState<string[]>([]);
  const [lastDir, setLastDir] = useState<Reaction>("skip");
  useEffect(() => { setSwipes(store.get(KEY, {})); }, []);
  useEffect(() => { setUndo([]); }, [city]);

  // One card per plan (its next date) in the chosen city.
  const deck = useMemo(() => {
    const seen = new Set<string>();
    return upcoming.filter(inCity).filter((e) => { const k = e.key + e.city; if (seen.has(k)) return false; seen.add(k); return true; });
  }, [upcoming, inCity]);
  const left = deck.filter((e) => !swipes[e.id]);
  const top = left[0];

  const decide = useCallback((r: Reaction) => {
    if (!top) return;
    setLastDir(r); buzz(r === "interested" ? 18 : 8);
    setSwipes((s) => { const n = { ...s, [top.id]: r }; store.set(KEY, n); return n; });
    setUndo((u) => [...u, top.id]);
    if (r === "interested" && !isSaved(top.id)) toggleSave(top.id);
    if (r === "interested") burst(window.innerWidth / 2, window.innerHeight * 0.45, ["💖", "🔥", "✨", "😍"], 14);
    if (auth.client) auth.client.rpc("record_interest", { p_device: deviceId(), p_plan_ref: top.id, p_reaction: r }).then(() => {}, () => {});
  }, [top, isSaved, toggleSave, auth.client]);
  const open = useCallback(() => { if (top) router.push(eventUrl(top)); }, [top, router]);
  const back = () => {
    const id = undo[undo.length - 1]; if (!id) return;
    setUndo((u) => u.slice(0, -1));
    setSwipes((s) => { const n = { ...s }; delete n[id]; store.set(KEY, n); return n; });
  };

  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement).closest("input,textarea,select")) return;
      if (ev.key === "ArrowRight") decide("interested");
      else if (ev.key === "ArrowLeft") decide("skip");
      else if (ev.key === "ArrowUp") open();
      else if (ev.key === "Backspace") { ev.preventDefault(); back(); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });

  const liked = deck.filter((e) => swipes[e.id] === "interested");
  return (
    <div className="wrap">
      <div className="swipe-wrap">
        <div className="swipe-top">
          <div><span className="eyebrow">Discover</span><h1>Swipe your <span className="serif">week.</span></h1></div>
          <span className="muted" style={{ fontWeight: 700, fontSize: 14 }}>{ready && deck.length ? `${Math.min(deck.length - left.length + 1, deck.length)} of ${deck.length}` : ""}</span>
        </div>

        <div className="deck" style={!left.length && ready ? { height: "auto" } : undefined} aria-live="polite">
          {!ready && <div className="skeleton" style={{ position: "absolute", inset: 0 }} />}
          <AnimatePresence custom={lastDir}>
            {left.slice(0, 3).map((e, i) => (
              <SwipeCard key={e.id} e={e} top={i === 0} depth={i} onDecide={decide} onOpen={open} today={today} />
            )).reverse()}
          </AnimatePresence>
          {ready && !left.length && (
            <motion.div className="done-card" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 20 }}>
              <div style={{ fontSize: 44 }}>🎉</div><h2>That&apos;s every plan for now</h2>
              <p className="muted">{liked.length ? `You're interested in ${liked.length} plan${liked.length > 1 ? "s" : ""}. Request a seat before they fill up.` : "Nothing caught your eye? New plans are added every week."}</p>
              {liked.length > 0 && <ul className="liked-list">{liked.map((e) => <li key={e.id}><Link href={eventUrl(e)}><span>{e.emoji} {e.title}</span><span className="muted">{relDay(e.date, today)} →</span></Link></li>)}</ul>}
              <button className="btn btn-white btn-sm" onClick={() => { setSwipes({}); setUndo([]); store.set(KEY, {}); }}>Start over</button>
            </motion.div>
          )}
        </div>

        <div className="swipe-btns">
          <motion.button whileTap={{ scale: 0.85 }} whileHover={{ y: -3 }} className="sbtn small" disabled={!undo.length} onClick={back} title="Undo (Backspace)" aria-label="Undo last swipe">↩</motion.button>
          <motion.button whileTap={{ scale: 0.85 }} whileHover={{ y: -3 }} className="sbtn no" disabled={!top} onClick={() => decide("skip")} title="Skip (←)" aria-label="Skip this plan">✕</motion.button>
          <motion.button whileTap={{ scale: 0.85 }} whileHover={{ y: -3, scale: 1.05 }} className="sbtn yes" disabled={!top} onClick={() => decide("interested")} title="Interested (→)" aria-label="I'm interested">♥</motion.button>
          <motion.button whileTap={{ scale: 0.85 }} whileHover={{ y: -3 }} className="sbtn small" disabled={!top} onClick={open} title="Details (↑)" aria-label="Open plan details">ⓘ</motion.button>
        </div>
        <p className="swipe-hint">Swipe right if you&apos;re interested, left to skip. Your ♥ plans are saved to <Link href="/saved/" style={{ textDecoration: "underline" }}>Your plans</Link>.</p>
      </div>
    </div>
  );
}
