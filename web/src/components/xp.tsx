"use client";
// XP, levels and badges on the profile. Earned from the profile, plans asked for /
// confirmed / attended (database) and swipes, games and invites (this device).
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "./AppProvider";
import { burst } from "./fx";
import { useMyRequests } from "./plans";
import { CONFIG } from "@/lib/config";
import { DECKS } from "@/lib/games";
import { store } from "@/lib/store";

export const LEVELS: [number, string, string][] = [
  [0, "New in town", "🌱"], [60, "Curious", "👀"], [140, "Table Starter", "🍽️"], [250, "Regular-in-making", "☕"],
  [400, "Social Butterfly", "🦋"], [600, "City Insider", "🗺️"], [850, "Local Legend", "🌟"], [1200, `${CONFIG.brand} Icon`, "👑"],
];

/** Call when a game starts, so it counts for XP. */
export function noteGamePlayed(id: string) {
  const s = store.get<string[]>("mt-games", []);
  if (!s.includes(id)) store.set("mt-games", [...s, id]);
}
export function noteInvite() { store.set("mt-invited", 1); }

type Input = { score: number; hasPhoto: boolean; bio: number; phoneVerified: boolean; words?: boolean; prompt?: boolean; friends?: number; friendsCame?: number };

export function XpCard({ score, hasPhoto, bio, phoneVerified, words = false, prompt = false, friends = 0, friendsCame = 0 }: Input) {
  const { savedIds } = useApp();
  const { rows } = useMyRequests();
  const [local, setLocal] = useState({ right: 0, games: [] as string[], invited: false });
  useEffect(() => {
    const sw = store.get<Record<string, string>>("mt-swipes", {});
    setLocal({ right: Object.values(sw).filter((v) => v === "right" || v === "yes" || v === "interested").length, games: store.get<string[]>("mt-games", []), invited: !!store.get("mt-invited", 0) });
  }, []);

  const asked = rows?.filter((r) => r.status !== "cancelled").length ?? 0;
  const inn = rows?.filter((r) => r.status === "approved" || r.status === "attended").length ?? 0;
  const went = rows?.filter((r) => r.status === "attended").length ?? 0;
  const decks = local.games.filter((g) => DECKS.some((d) => d.id === g)).length;

  const xp = score + Math.min(asked, 5) * 10 + inn * 25 + went * 50 + Math.min(local.right, 20) * 2
    + Math.min(local.games.length, 12) * 5 + (local.invited ? 15 : 0) + Math.min(savedIds.length, 10) * 2
    + (words ? 10 : 0) + (prompt ? 10 : 0) + Math.min(friends, 10) * 10 + Math.min(friendsCame, 10) * 20;
  const li = LEVELS.reduce((a, l, i) => (xp >= l[0] ? i : a), 0);
  const [lvMin, lvName, lvEm] = LEVELS[li];
  const next = LEVELS[li + 1];
  const pct = next ? ((xp - lvMin) / (next[0] - lvMin)) * 100 : 100;

  const badges = useMemo(() => [
    { id: "face", em: "📸", name: "Face card", how: "Add a clear photo", ok: hasPhoto, href: "#photo" },
    { id: "story", em: "✍️", name: "Storyteller", how: "Write a bio of 80+ characters", ok: bio >= 80, href: "#bio" },
    { id: "verified", em: "✅", name: "Verified", how: "Verify your WhatsApp", ok: phoneVerified, href: "#phone" },
    { id: "complete", em: "💯", name: "All in", how: "Reach a priority score of 70", ok: score >= 70, href: "#bio" },
    { id: "picker", em: "🔥", name: "Plan picker", how: "Swipe right on 10 plans", ok: local.right >= 10, href: "/swipe/" },
    { id: "saver", em: "💖", name: "Collector", how: "Save 5 plans", ok: savedIds.length >= 5, href: "/events/" },
    { id: "ask", em: "🙋", name: "First ask", how: "Request a seat on any plan", ok: asked >= 1, href: "/events/" },
    { id: "in", em: "🎟️", name: "You're in", how: "Get confirmed for a plan", ok: inn >= 1, href: "/events/" },
    { id: "went", em: "🚪", name: "Showed up", how: "Get checked in at a plan", ok: went >= 1, href: "/saved/" },
    { id: "regular", em: "🏆", name: "Regular", how: "Come to 3 plans", ok: went >= 3, href: "/events/" },
    { id: "games", em: "🎲", name: "Game night", how: "Play 3 games from the Games page", ok: local.games.length >= 3, href: "/games/" },
    { id: "decks", em: "🃏", name: "Deck master", how: `Play all ${DECKS.length} card decks`, ok: decks >= DECKS.length, href: "/games/" },
    { id: "connector", em: "🤝", name: "Connector", how: "Invite a friend from your plans", ok: local.invited || friends > 0, href: "#invite" },
    { id: "self", em: "🪞", name: "Self-aware", how: "Pick your three words", ok: words, href: "#quests" },
    { id: "words", em: "💬", name: "Wordsmith", how: "Answer a prompt", ok: prompt, href: "#quests" },
    { id: "magnet", em: "🧲", name: "Friend magnet", how: "A friend joins with your link", ok: friends > 0, href: "#invite" },
    { id: "crew", em: "👯", name: "Brought the crew", how: "A friend comes to a plan", ok: friendsCame > 0, href: "#invite" },
  ], [hasPhoto, bio, phoneVerified, score, local, savedIds.length, asked, inn, went, decks, words, prompt, friends, friendsCame]);
  const got = badges.filter((b) => b.ok).length;
  const quests = badges.filter((b) => !b.ok).slice(0, 3);

  // Celebrate a level-up once per level.
  useEffect(() => {
    if (!rows) return;
    const seen = store.get("mt-level", -1);
    if (li > seen) { store.set("mt-level", li); if (seen >= 0) setTimeout(() => burst(innerWidth / 2, innerHeight / 3, ["🎉", lvEm, "✨", "⭐"], 22), 600); }
  }, [li, lvEm, rows]);

  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="xp">
      <div className="xp-top">
        <motion.span className="xp-lv" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 12 }}>{lvEm}</motion.span>
        <div className="xp-txt">
          <span className="eyebrow" style={{ color: "var(--sun)" }}>Level {li + 1} · {lvName}</span>
          <b><motion.span key={xp} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{xp}</motion.span> XP</b>
          <small>{next ? `${next[0] - xp} XP to ${next[2]} ${next[1]}` : "Max level. Absolute legend."}</small>
        </div>
      </div>
      <div className="xp-bar"><motion.i initial={{ width: 0 }} animate={{ width: `${Math.max(4, pct)}%` }} transition={{ type: "spring", stiffness: 60, damping: 16, delay: 0.2 }} /></div>
      <p className="xp-perk">⚡ Earn XP by filling your profile, coming to plans, playing games and bringing friends.</p>

      {quests.length > 0 && <>
        <h3 className="xp-h">Next quests</h3>
        <div className="xp-quests">
          {quests.map((q, i) => (
            <motion.div key={q.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.08 }}>
              {q.href.startsWith("#") ? <a className="xp-q" href={q.href}><span>{q.em}</span><b>{q.how}</b><i>→</i></a>
                : <Link className="xp-q" href={q.href}><span>{q.em}</span><b>{q.how}</b><i>→</i></Link>}
            </motion.div>
          ))}
        </div>
      </>}

      <h3 className="xp-h">Badges <small>{got}/{badges.length}</small></h3>
      <div className="xp-badges">
        {badges.map((b, i) => (
          <motion.button type="button" key={b.id} className={`xp-b ${b.ok ? "on" : ""}`} onClick={() => setOpen(open === b.id ? null : b.id)}
            initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 14, delay: 0.05 * i }}
            whileTap={{ scale: 0.88, rotate: -8 }} aria-label={`${b.name}: ${b.ok ? "earned" : b.how}`}>
            <span>{b.ok ? b.em : "🔒"}</span><small>{b.name}</small>
          </motion.button>
        ))}
      </div>
      <AnimatePresence>
        {open && (() => { const b = badges.find((x) => x.id === open)!; return (
          <motion.p key={open} className="xp-tip" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <b>{b.em} {b.name}</b> · {b.ok ? "Earned ✓" : b.how}
          </motion.p>); })()}
      </AnimatePresence>
    </section>
  );
}
