"use client";
// /game/?id=… — plays one deck or one party game on a single phone.
// Everything runs on this device; names are kept only in this browser.
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { burst, burstFrom, buzz } from "../fx";
import { noteGamePlayed } from "../xp";
import { CONFIG } from "@/lib/config";
import { store } from "@/lib/store";
import {
  ANTAKSHARI_LETTERS, CHARADES, DECKS, TABOO, EMOJI_CLUES, HEADS_UP, HOT_SEAT, PARTY, SPEED_PROMPTS, SPIN_TASKS, STORY_STARTS,
  UNDERCOVER_PAIRS, VOTE_Q, WYR, type Deck, type Party,
} from "@/lib/games";

const shuffle = <T,>(a: T[]) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export default function GamePage() {
  const id = useSearchParams().get("id") ?? "";
  const deck = DECKS.find((d) => d.id === id);
  const party = PARTY.find((p) => p.id === id);
  useEffect(() => {
    const n = deck?.name ?? party?.name; if (!n) return;
    const t = `${n} · Games · ${CONFIG.brand}`; document.title = t; const k = setTimeout(() => { document.title = t; }, 60); return () => clearTimeout(k);
  }, [deck, party]);
  if (!deck && !party) return (
    <section className="wrap page-hero"><h1>That game <span className="serif">rolled away.</span></h1><p>Pick another one.</p>
      <div style={{ marginTop: 24 }}><Link className="btn btn-sun" href="/games/">All games →</Link></div></section>
  );
  return (
    <div className="wrap game-wrap">
      <Link className="btn btn-white btn-sm back-btn" href="/games/">‹ All games</Link>
      {deck ? <DeckGame d={deck} /> : <PartyGame p={party!} />}
    </div>
  );
}

/* ---------------- shared bits ---------------- */
function usePlayers() {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => { setNames(store.get<string[]>("mt-players", [])); }, []);
  const save = (n: string[]) => { setNames(n); store.set("mt-players", n); };
  return { names, add: (n: string) => { const t = n.trim().slice(0, 18); if (t && !names.includes(t)) save([...names, t]); }, remove: (n: string) => save(names.filter((x) => x !== n)) };
}

function Players({ pl, min }: { pl: ReturnType<typeof usePlayers>; min: number }) {
  const [v, setV] = useState("");
  return (
    <div className="gm-players">
      <form className="gm-add" onSubmit={(e) => { e.preventDefault(); pl.add(v); setV(""); buzz(); }}>
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Add a name" aria-label="Player name" maxLength={18} />
        <button className="btn btn-ink btn-sm" type="submit">+ Add</button>
      </form>
      <div className="gm-names">
        <AnimatePresence>
          {pl.names.map((n) => (
            <motion.button key={n} layout initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="pill" type="button" onClick={() => pl.remove(n)} aria-label={`Remove ${n}`}>
              {n} <span className="muted">×</span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      <p className="fine">{pl.names.length < min ? `Add at least ${min} names. ` : `${pl.names.length} playing. `}Names stay on this phone only.</p>
    </div>
  );
}

function useTimer(onEnd?: () => void) {
  const [left, setLeft] = useState(0); const [run, setRun] = useState(false);
  const end = useRef(onEnd); end.current = onEnd;
  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => setLeft((s) => { if (s <= 1) { setRun(false); end.current?.(); buzz(200); return 0; } return s - 1; }), 1000);
    return () => clearInterval(t);
  }, [run]);
  return { left, run, start: (s: number) => { setLeft(s); setRun(true); }, stop: () => setRun(false) };
}

function Ring({ left, total }: { left: number; total: number }) {
  const r = 34, C = 2 * Math.PI * r;
  return (
    <div className={`gm-ring ${left <= 5 && left > 0 ? "hurry" : ""}`}>
      <svg viewBox="0 0 80 80"><circle cx="40" cy="40" r={r} className="bg" /><circle cx="40" cy="40" r={r} className="fg" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - left / total) }} /></svg>
      <b>{left}</b>
    </div>
  );
}

function Head({ eyebrow, title, line }: { eyebrow: string; title: string; line: string }) {
  return <section className="gm-head"><span className="eyebrow">{eyebrow}</span><h1>{title}<i style={{ color: "var(--pink)" }}>.</i></h1><p>{line}</p></section>;
}

function How({ steps }: { steps: string[] }) {
  return <details className="acc gm-how"><summary>How to play</summary><div className="acc-body"><ol>{steps.map((s) => <li key={s}>{s}</li>)}</ol></div></details>;
}

/** Big card that flips in from the side every time `k` changes. */
function FlipCard({ k, children, color = "#fff", dir = 1 }: { k: string | number; children: React.ReactNode; color?: string; dir?: number }) {
  return (
    <div className="gm-stage">
      <AnimatePresence mode="popLayout" custom={dir}>
        <motion.div key={k} className="gm-card" style={{ ["--cc" as string]: color }}
          initial={{ x: dir * 260, rotate: dir * 14, opacity: 0, scale: 0.9 }} animate={{ x: 0, rotate: 0, opacity: 1, scale: 1 }}
          exit={{ x: -dir * 300, rotate: -dir * 16, opacity: 0, transition: { duration: 0.25 } }} transition={{ type: "spring", stiffness: 260, damping: 24 }}>
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ---------------- card decks ---------------- */
function DeckGame({ d }: { d: Deck }) {
  const pl = usePlayers();
  const kinds = Object.keys(d.kinds);
  const [on, setOn] = useState<string[]>(kinds);
  const [playing, setPlaying] = useState(false);
  const [order, setOrder] = useState<number[]>([]);
  const [i, setI] = useState(0); const [dir, setDir] = useState(1); const [kept, setKept] = useState(0);
  const pool = useMemo(() => d.cards.map((c, n) => [c, n] as const).filter(([c]) => on.includes(c.k)).map(([, n]) => n), [d, on]);
  const start = () => {
    if (!pool.length) return;
    // Warm-ups first, the rest shuffled.
    const warm = shuffle(pool.filter((n) => d.cards[n].k === "warm")), rest = shuffle(pool.filter((n) => d.cards[n].k !== "warm"));
    setOrder([...warm.slice(0, 3), ...shuffle([...warm.slice(3), ...rest])]); setI(0); setKept(0); setPlaying(true); buzz(); noteGamePlayed(d.id);
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  };
  const go = (n: number, keep = false) => { setDir(n); if (keep) setKept((k) => k + 1); setI((x) => Math.max(0, Math.min(order.length, x + n))); buzz(); };

  if (!playing) return (
    <>
      <Head eyebrow={`${d.name} · card deck`} title={d.name} line={d.blurb} />
      <div className="panel gm-setup">
        <h3>Who&apos;s playing? <small className="muted">(optional)</small></h3>
        <Players pl={pl} min={0} />
        {kinds.length > 1 && <>
          <h3 style={{ marginTop: 18 }}>Which cards?</h3>
          <div className="gm-kinds">
            {kinds.map((k) => (
              <motion.button key={k} type="button" whileTap={{ scale: 0.9 }} className={`pill ${on.includes(k) ? "on" : ""}`}
                onClick={() => setOn((o) => o.includes(k) ? (o.length > 1 ? o.filter((x) => x !== k) : o) : [...o, k])}>
                <i className="kdot" style={{ background: d.kinds[k].dot }} /> {d.kinds[k].label}
              </motion.button>
            ))}
          </div>
        </>}
        <button className="btn btn-sun btn-block" style={{ marginTop: 22 }} onClick={start}>▶ Start playing · {pool.length} cards</button>
      </div>
      <How steps={["Pull a card. Read it out. Answer it, or pass it on.", "Skipping is always allowed. No follow-ups unless they want them.", "One answer at a time. Phones face down (except this one).", "What's said at the table stays at the table."]} />
    </>
  );

  const done = i >= order.length;
  const card = d.cards[order[i]];
  const who = pl.names.length > 1 ? pl.names[i % pl.names.length] : null;
  return (
    <div className="gm-play">
      {done ? (
        <FlipCard k="done" color={d.color}>
          <div className="gm-card-in center"><span className="gm-big">🎉</span><h2>Deck finished!</h2><p>{kept} cards answered. Shuffle and go again?</p>
            <button className="btn btn-ink" onClick={() => { start(); burst(innerWidth / 2, innerHeight / 2); }}>Shuffle again</button></div>
        </FlipCard>
      ) : (
        <FlipCard k={order[i]} dir={dir} color={d.color}>
          <div className="gm-card-in">
            <div className="gm-card-top"><span><i className="kdot" style={{ background: d.kinds[card.k]?.dot }} /> {d.kinds[card.k]?.label}</span><span>{String(i + 1).padStart(2, "0")}</span></div>
            {who && <span className="gm-who">{who}&apos;s turn</span>}
            <h2 className="gm-q">{card.q}</h2>
            <span className="gm-foot serif">{card.note ?? `${CONFIG.brand} · ${d.name}`}</span>
          </div>
        </FlipCard>
      )}
      {!done && <>
        <button className="btn btn-sun btn-block gm-next" onClick={(e) => { go(1, true); if ((i + 1) % 8 === 0) burstFrom(e.currentTarget, ["✨", "🎉"], 8); }}>Next card →</button>
        <div className="gm-row">
          <button className="btn btn-white btn-sm" disabled={i === 0} onClick={() => go(-1)} aria-label="Previous card">‹ Back</button>
          <button className="btn btn-white btn-sm" onClick={() => go(1)}>⏭ Skip</button>
        </div>
      </>}
      <div className="gm-row small">
        <span className="tag">{Math.max(0, order.length - i)} cards left</span>
        <button className="pill" onClick={start}>🔀 Shuffle</button>
        <button className="pill" onClick={() => setPlaying(false)}>⚙︎ Setup</button>
      </div>
    </div>
  );
}

/* ---------------- party games ---------------- */
function PartyGame({ p }: { p: Party }) {
  const pl = usePlayers();
  const [go, setGo] = useState(false);
  const needs = !["heads-up", "emoji-charades", "would-you-rather", "antakshari", "hot-seat", "taboo", "dumb-charades"].includes(p.id);
  const ok = !needs || pl.names.length >= p.min;
  const Engine = ENGINES[p.id];
  if (go && ok) return (
    <div className="gm-play">
      <div className="gm-mini-head"><span className="party-ic sm" style={{ background: p.color, color: p.color === "#16122B" ? "#fff" : undefined }}>{p.icon}</span><b>{p.name}</b>
        <button className="pill" onClick={() => setGo(false)}>⚙︎ Setup</button></div>
      <Engine names={pl.names} p={p} />
    </div>
  );
  return (
    <>
      <Head eyebrow={`Party mode · ${p.players}`} title={p.name} line={p.line} />
      <div className="panel gm-setup">
        {needs ? <><h3>Who&apos;s playing?</h3><Players pl={pl} min={p.min} /></> : <p className="muted" style={{ marginBottom: 4 }}>No setup needed. Gather round.</p>}
        <button className="btn btn-sun btn-block" style={{ marginTop: 18 }} disabled={!ok} onClick={() => { setGo(true); buzz(); noteGamePlayed(p.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>▶ Start</button>
      </div>
      <How steps={p.how} />
    </>
  );
}

type EP = { names: string[]; p: Party };

/** Pass-the-phone secret reveal used by Undercover, Mafia and Secret Vote. */
function PassReveal({ names, secret, onDone, cta = "Got it, hide" }: { names: string[]; secret: (n: string, i: number) => React.ReactNode; onDone: () => void; cta?: string }) {
  const [i, setI] = useState(0); const [shown, setShown] = useState(false);
  const end = useRef(onDone); end.current = onDone;
  useEffect(() => { if (i >= names.length) end.current(); }, [i, names.length]);
  if (i >= names.length) return null;
  return (
    <FlipCard k={`${i}-${shown}`} color={shown ? "#fff" : "#16122B"}>
      {shown ? (
        <div className="gm-card-in center"><span className="eyebrow">{names[i]}, only you</span>{secret(names[i], i)}
          <button className="btn btn-ink" onClick={() => { setShown(false); setI(i + 1); buzz(); }}>{cta}</button></div>
      ) : (
        <div className="gm-card-in center dark"><span className="gm-big">🤫</span><h2>Pass to <span className="serif">{names[i]}</span></h2><p>Nobody else look.</p>
          <button className="btn btn-sun" onClick={() => { setShown(true); buzz(30); }}>I&apos;m {names[i]}, show me</button></div>
      )}
    </FlipCard>
  );
}

function Undercover({ names }: EP) {
  const [round, setRound] = useState(0);
  const deal = useMemo(() => { const [a, b] = shuffle(pick(UNDERCOVER_PAIRS)); return { civ: a, und: b, who: pick(names) }; }, [names, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const [stage, setStage] = useState<"deal" | "play" | "end">("deal");
  const [out, setOut] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const alive = names.filter((n) => !out.includes(n));
  const restart = () => { setRound((r) => r + 1); setStage("deal"); setOut([]); setMsg(""); };
  const vote = (n: string, el: Element) => {
    const nextOut = [...out, n]; setOut(nextOut);
    if (n === deal.who) { setMsg(`${n} was the undercover! Town wins 🎉`); setStage("end"); burstFrom(el, ["🎉", "🕵️", "✨"]); return; }
    const left = names.length - nextOut.length;
    if (left <= 3) { setMsg(`${deal.who} survived to the last three. Undercover wins 🕵️`); setStage("end"); return; }
    setMsg(`${n} was not the undercover. Keep going…`); buzz(60);
  };
  if (stage === "deal") return <PassReveal names={names} onDone={() => setStage("play")} secret={(n) => <h2 className="gm-word">{n === deal.who ? deal.und : deal.civ}</h2>} />;
  return (
    <div className="panel gm-panel">
      {stage === "end" ? <>
        <h2>{msg}</h2><p className="muted">Words were <b>{deal.civ}</b> and <b>{deal.und}</b> (undercover).</p>
        <button className="btn btn-sun btn-block" onClick={restart}>New round</button>
      </> : <>
        <h3>Everyone says one word about their word.</h3>
        <p className="muted">Start with <b>{alive[(round + out.length) % alive.length]}</b>, go clockwise. Then vote.</p>
        {msg && <p className="notice">{msg}</p>}
        <div className="gm-vote">{alive.map((n) => <button key={n} className="pill" onClick={(e) => vote(n, e.currentTarget)}>Vote out {n}</button>)}</div>
      </>}
    </div>
  );
}

function Mafia({ names }: EP) {
  const [round, setRound] = useState(0);
  const roles = useMemo(() => {
    const n = names.length, m = Math.max(1, Math.floor(n / 4));
    const list = [...Array(m).fill("Mafia"), "Doctor", ...(n >= 6 ? ["Detective"] : [])];
    while (list.length < n) list.push("Villager");
    return Object.fromEntries(shuffle(names).map((x, i) => [x, list[i]])) as Record<string, string>;
  }, [names, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const [stage, setStage] = useState<"deal" | "script">("deal");
  const [showAll, setShowAll] = useState(false);
  const ICON: Record<string, string> = { Mafia: "🔪", Doctor: "🩺", Detective: "🔎", Villager: "🏡" };
  const LINE: Record<string, string> = { Mafia: "Pick someone each night. Don't get caught.", Doctor: "Save one person each night (yourself too).", Detective: "Ask the narrator about one person each night.", Villager: "Find the mafia by day. Trust nobody." };
  if (stage === "deal") return <PassReveal names={names} onDone={() => setStage("script")} secret={(n) => <><span className="gm-big">{ICON[roles[n]]}</span><h2 className="gm-word">{roles[n]}</h2><p>{LINE[roles[n]]}</p></>} />;
  return (
    <div className="panel gm-panel">
      <h3>Narrator script 🎙️</h3>
      <ol className="gm-script">
        <li>&ldquo;Night falls over the city. Everyone, close your eyes.&rdquo;</li>
        <li>&ldquo;Mafia, open your eyes and silently pick someone.&rdquo; <small>(wait)</small> &ldquo;Mafia, close your eyes.&rdquo;</li>
        <li>&ldquo;Doctor, open your eyes. Who do you save?&rdquo; <small>(wait)</small> &ldquo;Close.&rdquo;</li>
        {names.length >= 6 && <li>&ldquo;Detective, open your eyes. Point at someone.&rdquo; <small>(thumbs up if mafia)</small></li>}
        <li>&ldquo;Morning! Everyone open your eyes.&rdquo; Announce who was picked (unless saved).</li>
        <li>Discuss for 2 minutes, then vote someone out. Repeat until one side wins.</li>
      </ol>
      <button className="btn btn-white btn-block" onClick={() => setShowAll((s) => !s)}>{showAll ? "Hide roles" : "Narrator only: show all roles"}</button>
      {showAll && <div className="gm-roles">{names.map((n) => <span key={n} className="tag">{ICON[roles[n]]} {n}: {roles[n]}</span>)}</div>}
      <button className="btn btn-sun btn-block" style={{ marginTop: 10 }} onClick={() => { setRound((r) => r + 1); setStage("deal"); setShowAll(false); }}>Deal new roles</button>
    </div>
  );
}

function HeadsUp() {
  const [cat, setCat] = useState<string | null>(null);
  const [words, setWords] = useState<string[]>([]); const [i, setI] = useState(0);
  const [score, setScore] = useState<{ w: string; ok: boolean }[]>([]);
  const [count, setCount] = useState(0);
  const t = useTimer();
  const begin = (c: string) => { setCat(c); setWords(shuffle(HEADS_UP[c])); setI(0); setScore([]); setCount(3); };
  useEffect(() => { if (count <= 0) return; const k = setTimeout(() => { setCount((c) => c - 1); if (count === 1) t.start(60); }, 800); return () => clearTimeout(k); }, [count]); // eslint-disable-line react-hooks/exhaustive-deps
  const mark = (ok: boolean, el: Element) => { setScore((s) => [...s, { w: words[i], ok }]); setI((x) => x + 1); buzz(ok ? 30 : 80); if (ok) burstFrom(el, ["✅", "✨"], 6); };
  if (!cat) return <div className="gm-cats">{Object.keys(HEADS_UP).map((c) => <button key={c} className="btn btn-white btn-block" onClick={() => begin(c)}>{c}</button>)}</div>;
  if (count > 0) return <FlipCard k={`c${count}`} color="#16122B"><div className="gm-card-in center dark"><p>Phone on your forehead!</p><span className="gm-count">{count}</span></div></FlipCard>;
  const over = !t.run || i >= words.length;
  if (over) return (
    <div className="panel gm-panel"><h2>{score.filter((s) => s.ok).length} correct 🎉</h2>
      <div className="gm-roles">{score.map((s, n) => <span key={n} className="tag" style={{ background: s.ok ? "#C9F5E4" : "#FFE3EC" }}>{s.ok ? "✓" : "✕"} {s.w}</span>)}</div>
      <button className="btn btn-sun btn-block" onClick={() => begin(cat)}>Next player</button>
      <button className="btn btn-white btn-block" style={{ marginTop: 8 }} onClick={() => setCat(null)}>Change category</button></div>
  );
  return (
    <>
      <Ring left={t.left} total={60} />
      <FlipCard k={i} color="#C9F5E4"><div className="gm-card-in center"><span className="eyebrow">{cat}</span><h2 className="gm-word">{words[i]}</h2></div></FlipCard>
      <div className="gm-row"><button className="btn btn-white" onClick={(e) => mark(false, e.currentTarget)}>⏭ Pass</button><button className="btn btn-sun" onClick={(e) => mark(true, e.currentTarget)}>✅ Got it</button></div>
    </>
  );
}

function HotSeat() {
  const [qs] = useState(() => shuffle(HOT_SEAT)); const [i, setI] = useState(0);
  const t = useTimer();
  return (
    <>
      {t.run || t.left > 0 ? <Ring left={t.left} total={60} /> : <button className="btn btn-pink btn-block" onClick={() => { t.start(60); buzz(); }}>🔥 Start 60 seconds</button>}
      <FlipCard k={i} color="#FFD6E3"><div className="gm-card-in center"><span className="eyebrow">Hot seat · question {i + 1}</span><h2 className="gm-q">{qs[i % qs.length]}</h2></div></FlipCard>
      <button className="btn btn-sun btn-block gm-next" onClick={() => { setI(i + 1); buzz(); }}>Next question →</button>
      {!t.run && t.left === 0 && i > 0 && <button className="btn btn-white btn-block" style={{ marginTop: 8 }} onClick={() => { setI(0); t.start(60); }}>Next person in the seat</button>}
    </>
  );
}

function WouldYouRather() {
  const [qs] = useState(() => shuffle(WYR)); const [i, setI] = useState(0);
  const [a, b] = qs[i % qs.length];
  return (
    <>
      <FlipCard k={i} color="#DDEBB8">
        <div className="gm-card-in center"><span className="eyebrow">Would you rather…</span>
          <div className="wyr"><motion.b whileTap={{ scale: 0.94 }}>{a}</motion.b><span className="serif">or</span><motion.b whileTap={{ scale: 0.94 }}>{b}</motion.b></div>
          <small className="muted">On 3, point left or right. Smaller side defends.</small></div>
      </FlipCard>
      <button className="btn btn-sun btn-block gm-next" onClick={() => { setI(i + 1); buzz(); }}>Next →</button>
    </>
  );
}

function EmojiCharades() {
  const [qs] = useState(() => shuffle(EMOJI_CLUES)); const [i, setI] = useState(0); const [show, setShow] = useState(false);
  const [e, ans] = qs[i % qs.length];
  return (
    <>
      <FlipCard k={i} color="#FFD7B0">
        <div className="gm-card-in center"><span className="eyebrow">Film or song</span><span className="gm-emoji">{e}</span>
          <AnimatePresence>{show && <motion.h2 initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>{ans}</motion.h2>}</AnimatePresence></div>
      </FlipCard>
      {show ? <button className="btn btn-sun btn-block gm-next" onClick={() => { setI(i + 1); setShow(false); buzz(); }}>Next →</button>
        : <button className="btn btn-ink btn-block gm-next" onClick={() => setShow(true)}>Reveal answer</button>}
    </>
  );
}

function TwoTruths({ names }: EP) {
  const [order] = useState(() => shuffle(names)); const [i, setI] = useState(0);
  const t = useTimer();
  const who = order[i % order.length];
  return (
    <>
      <FlipCard k={i} color="#C9E4EC"><div className="gm-card-in center"><span className="eyebrow">Round {Math.floor(i / order.length) + 1}</span><h2>{who}</h2><p>Two truths and one lie. Go!</p>
        {t.run || t.left > 0 ? <Ring left={t.left} total={30} /> : <button className="btn btn-white btn-sm" onClick={() => t.start(30)}>Start 30s to vote</button>}</div></FlipCard>
      <button className="btn btn-sun btn-block gm-next" onClick={() => { setI(i + 1); t.stop(); buzz(); }}>Next player →</button>
    </>
  );
}

function SecretVote({ names }: EP) {
  const [qs] = useState(() => shuffle(VOTE_Q)); const [qi, setQi] = useState(0);
  const [votes, setVotes] = useState<string[]>([]); const [stage, setStage] = useState<"vote" | "show">("vote");
  const [shown, setShown] = useState(false);
  const voter = names[votes.length];
  const next = () => { setQi(qi + 1); setVotes([]); setStage("vote"); setShown(false); };
  if (stage === "show") {
    const tally = names.map((n) => [n, votes.filter((v) => v === n).length] as const).sort((a, b) => b[1] - a[1]);
    return (
      <div className="panel gm-panel"><span className="eyebrow">{qs[qi % qs.length]}</span>
        <div className="gm-bars">{tally.map(([n, v], k) => (
          <div key={n} className="gm-bar"><span>{k === 0 && v > 0 ? "👑 " : ""}{n}</span>
            <motion.i initial={{ width: 0 }} animate={{ width: `${(v / names.length) * 100}%` }} transition={{ delay: 0.15 * k, type: "spring", stiffness: 120 }} /><b>{v}</b></div>
        ))}</div>
        <button className="btn btn-sun btn-block" onClick={next}>Next question</button></div>
    );
  }
  return (
    <FlipCard k={`${qi}-${votes.length}-${shown}`} color={shown ? "#FFE9A8" : "#16122B"}>
      {!shown ? (
        <div className="gm-card-in center dark"><span className="gm-big">🗳️</span><h2>Pass to <span className="serif">{voter}</span></h2>
          <button className="btn btn-sun" onClick={() => setShown(true)}>I&apos;m {voter}, let me vote</button></div>
      ) : (
        <div className="gm-card-in center"><span className="eyebrow">{voter} votes · secret</span><h2 className="gm-q">{qs[qi % qs.length]}</h2>
          <div className="gm-vote">{names.map((n) => <button key={n} className="pill" onClick={() => {
            const v = [...votes, n]; setVotes(v); setShown(false); buzz(); if (v.length >= names.length) { setStage("show"); burst(innerWidth / 2, innerHeight / 3, ["🗳️", "👑", "✨"]); }
          }}>{n}</button>)}</div></div>
      )}
    </FlipCard>
  );
}

function Spin({ names }: EP) {
  const [rot, setRot] = useState(0); const [who, setWho] = useState<number | null>(null); const [task, setTask] = useState("");
  const [spinning, setSpinning] = useState(false);
  const n = names.length, step = 360 / n;
  const spin = () => {
    if (spinning) return;
    const target = Math.floor(Math.random() * n);
    const base = rot - (rot % 360) + 360 * 5;
    setRot(base + target * step); setSpinning(true); setWho(null); buzz();
    setTimeout(() => { setWho(target); setTask(pick(SPIN_TASKS)); setSpinning(false); buzz(60); }, 2600);
  };
  return (
    <>
      <div className="spin-table">
        {names.map((x, k) => { const a = (k * step - 90) * Math.PI / 180; return (
          <span key={x} className={`spin-name ${who === k ? "on" : ""}`} style={{ left: `${50 + 42 * Math.cos(a)}%`, top: `${50 + 42 * Math.sin(a)}%` }}>{x}</span>); })}
        <motion.button className="bottle" aria-label="Spin the bottle" onClick={spin} animate={{ rotate: rot }} transition={{ duration: 2.5, ease: [0.15, 0.7, 0.2, 1] }}>🍾</motion.button>
      </div>
      <AnimatePresence mode="wait">
        {who !== null ? (
          <motion.div key={task} className="panel gm-panel" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
            <span className="eyebrow">{names[who]}!</span><h3 style={{ margin: "6px 0 12px" }}>{task}</h3>
            <button className="btn btn-sun btn-block" onClick={spin}>Spin again</button></motion.div>
        ) : <button key="s" className="btn btn-sun btn-block" onClick={spin} disabled={spinning}>{spinning ? "Spinning…" : "Tap the bottle or here to spin"}</button>}
      </AnimatePresence>
    </>
  );
}

function SpeedFriending({ names }: EP) {
  // Circle method: everyone meets everyone once.
  const rounds = useMemo(() => {
    const list = names.length % 2 ? [...names, "☕ break"] : [...names];
    const m = list.length, out: [string, string][][] = [];
    for (let r = 0; r < m - 1; r++) {
      const pairs: [string, string][] = [];
      for (let k = 0; k < m / 2; k++) pairs.push([list[k], list[m - 1 - k]]);
      out.push(pairs); list.splice(1, 0, list.pop()!);
    }
    return out;
  }, [names]);
  const [r, setR] = useState(0);
  const t = useTimer();
  const done = r >= rounds.length;
  if (done) return <div className="panel gm-panel"><h2>Everyone has met everyone 🎉</h2><button className="btn btn-sun btn-block" onClick={() => setR(0)}>Start over</button></div>;
  return (
    <>
      <div className="gm-row small"><span className="tag">Round {r + 1} of {rounds.length}</span></div>
      {t.run || t.left > 0 ? <Ring left={t.left} total={120} /> : <button className="btn btn-pink btn-block" onClick={() => t.start(120)}>⏱ Start 2 minutes</button>}
      <FlipCard k={r} color="#FFE9A8">
        <div className="gm-card-in center"><span className="eyebrow">Prompt</span><h2 className="gm-q">{SPEED_PROMPTS[r % SPEED_PROMPTS.length]}</h2>
          <div className="gm-pairs">{rounds[r].map(([a, b]) => <span key={a + b} className="tag">{a} ↔ {b}</span>)}</div></div>
      </FlipCard>
      <button className="btn btn-sun btn-block gm-next" onClick={() => { setR(r + 1); t.stop(); buzz(); }}>Next round →</button>
    </>
  );
}

function Antakshari() {
  const [letter, setLetter] = useState(() => pick(ANTAKSHARI_LETTERS)); const [team, setTeam] = useState(0); const [score, setScore] = useState([0, 0]);
  const t = useTimer();
  const next = (point: boolean) => { if (point) setScore((s) => s.map((v, k) => (k === team ? v + 1 : v))); setTeam(1 - team); setLetter(pick(ANTAKSHARI_LETTERS)); t.start(30); buzz(); };
  return (
    <>
      <div className="gm-score">{["Team A", "Team B"].map((n, k) => <div key={n} className={k === team ? "on" : ""}><small>{n}</small><b>{score[k]}</b></div>)}</div>
      <FlipCard k={letter + team + score.join()} color="#FFD6E3"><div className="gm-card-in center"><span className="eyebrow">{team ? "Team B" : "Team A"}, sing a song starting with</span><span className="gm-letter">{letter}</span>
        {t.run || t.left > 0 ? <Ring left={t.left} total={30} /> : <button className="btn btn-white btn-sm" onClick={() => t.start(30)}>Start 30s</button>}</div></FlipCard>
      <div className="gm-row"><button className="btn btn-white" onClick={() => next(false)}>✕ Missed</button><button className="btn btn-sun" onClick={(e) => { burstFrom(e.currentTarget, ["🎤", "🎶"], 8); next(true); }}>🎶 Sang it!</button></div>
    </>
  );
}

function StoryChain({ names }: EP) {
  const [lines, setLines] = useState(() => [pick(STORY_STARTS)]); const [v, setV] = useState(""); const [end, setEnd] = useState(false);
  const turns = names.length * 2;
  const who = names[(lines.length - 1) % names.length];
  const add = useCallback(() => { if (!v.trim()) return; const l = [...lines, v.trim()]; setLines(l); setV(""); buzz(); if (l.length > turns) setEnd(true); }, [v, lines, turns]);
  if (end) return (
    <div className="panel gm-panel"><h3>The whole story 📜</h3><ol className="gm-script">{lines.map((l, k) => <motion.li key={k} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.25 }}>{l}</motion.li>)}</ol>
      <button className="btn btn-sun btn-block" onClick={() => { setLines([pick(STORY_STARTS)]); setEnd(false); }}>New story</button></div>
  );
  return (
    <FlipCard k={lines.length} color="#DDEBB8">
      <div className="gm-card-in"><span className="eyebrow">{who}&apos;s line · {lines.length}/{turns}</span>
        <p className="gm-last serif">&ldquo;…{lines[lines.length - 1]}&rdquo;</p>
        <textarea value={v} onChange={(e) => setV(e.target.value)} rows={3} maxLength={160} placeholder="Add the next line…" className="gm-input" />
        <div className="gm-row"><button className="btn btn-white btn-sm" onClick={() => setEnd(true)}>End story</button><button className="btn btn-ink btn-sm" onClick={add} disabled={!v.trim()}>Add &amp; pass →</button></div></div>
    </FlipCard>
  );
}

/** Shared by Taboo and Dumb Charades: two teams, a word, a timer, points. */
function TeamRound({ secs, deck, render }: { secs: number; deck: () => number; render: (i: number) => React.ReactNode }) {
  const [team, setTeam] = useState(0); const [score, setScore] = useState([0, 0]); const [i, setI] = useState(() => deck()); const [live, setLive] = useState(false);
  const [played, setPlayed] = useState(false);
  const t = useTimer(() => { setLive(false); setPlayed(true); });
  const point = (ok: boolean, el?: Element) => { if (ok) { setScore((s) => s.map((v, k) => (k === team ? v + 1 : v))); if (el) burstFrom(el, ["✅", "✨"], 6); } else buzz(120); setI(deck()); };
  return (
    <>
      <div className="gm-score">{["Team A", "Team B"].map((n, k) => <div key={n} className={k === team ? "on" : ""}><small>{n}</small><b>{score[k]}</b></div>)}</div>
      {live ? <Ring left={t.left} total={secs} /> : played ? (
        <button className="btn btn-sun btn-block" onClick={() => { setTeam(1 - team); setPlayed(false); buzz(); }}>Time! Switch to {team ? "Team A" : "Team B"} →</button>
      ) : (
        <button className="btn btn-pink btn-block" onClick={() => { setLive(true); t.start(secs); buzz(); }}>▶ {team ? "Team B" : "Team A"}: start {secs}s</button>
      )}
      <FlipCard k={live ? i : `wait-${team}-${played}`} color="#FFD7B0">{live ? render(i) : <div className="gm-card-in center dark"><span className="gm-big">🤫</span><h2>Only the actor looks!</h2><p>Hand the phone to someone from {team ? "Team B" : "Team A"}.</p></div>}</FlipCard>
      {live && <div className="gm-row"><button className="btn btn-white" onClick={() => point(false)}>⏭ Skip / buzz</button><button className="btn btn-sun" onClick={(e) => point(true, e.currentTarget)}>✅ Got it</button></div>}
    </>
  );
}

function Taboo() {
  const order = useRef(shuffle(TABOO.map((_, k) => k))); const n = useRef(0);
  return <TeamRound secs={60} deck={() => order.current[n.current++ % order.current.length]} render={(i) => (
    <div className="gm-card-in center"><span className="eyebrow">Describe</span><h2 className="gm-word">{TABOO[i][0]}</h2>
      <div className="taboo-no"><small>Don&apos;t say</small>{TABOO[i][1].map((w) => <s key={w}>{w}</s>)}</div></div>)} />;
}

function DumbCharades() {
  const order = useRef(shuffle(CHARADES.map((_, k) => k))); const n = useRef(0);
  return <TeamRound secs={90} deck={() => order.current[n.current++ % order.current.length]} render={(i) => {
    const words = CHARADES[i].split(" ").length;
    return <div className="gm-card-in center"><span className="eyebrow">Act out this film · {words} word{words > 1 ? "s" : ""}</span><h2 className="gm-word">{CHARADES[i]}</h2><p className="muted">No talking. Fingers for words. Tug your ear for &ldquo;sounds like&rdquo;.</p></div>;
  }} />;
}

const ENGINES: Record<string, (p: EP) => React.ReactNode> = {
  taboo: Taboo, "dumb-charades": DumbCharades,
  "speed-friending": SpeedFriending, undercover: Undercover, mafia: Mafia, "heads-up": HeadsUp, "hot-seat": HotSeat,
  "would-you-rather": WouldYouRather, "emoji-charades": EmojiCharades, "two-truths": TwoTruths, "secret-vote": SecretVote,
  spin: Spin, antakshari: Antakshari, "story-chain": StoryChain,
};
