"use client";
// Profile quests (three words, a prompt) and "bring your people" invites with points.
// Hosts read these when you ask for a seat, so they know who's coming to their table.
import { useCallback, useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { useAuth } from "./AuthProvider";
import { burstFrom } from "./fx";
import { CONFIG } from "@/lib/config";

export const WORDS = ["Curious", "Warm", "Witty", "Calm", "Adventurous", "Thoughtful", "Loyal", "Spontaneous", "Goofy", "Kind", "Bold", "Chill",
  "Creative", "Driven", "Funny", "Grounded", "Honest", "Optimistic", "Playful", "Quirky", "Sporty", "Nerdy", "Foodie", "Dreamy", "Easy-going",
  "Energetic", "Storyteller", "Great listener", "Night owl", "Early bird", "Wholesome", "Organised"];
export const PROMPTS = [
  `A perfect Sunday in ${"your city"} looks like…`, "Ask me about…", "My go-to karaoke song is…", "I'm weirdly good at…",
  "The best chai/coffee spot I know is…", "A small thing that makes my day…", "I'm learning…", "My comfort movie is…",
];
const promptText = (q: string, city: string) => q.replace("your city", city);

export type QuestData = { three_words: string[]; prompt_q: string | null; prompt_a: string | null };
export function useQuestData() {
  const auth = useAuth();
  const [d, setD] = useState<QuestData | null>(null);
  const load = useCallback(() => {
    if (!auth.client || !auth.me) return;
    auth.client.from("users").select("three_words,prompt_q,prompt_a").eq("id", auth.me.id).maybeSingle()
      .then(({ data }) => setD((data as QuestData) ?? { three_words: [], prompt_q: null, prompt_a: null }));
  }, [auth.client, auth.me]);
  useEffect(() => { load(); }, [load]);
  return { data: d, reload: load, setData: setD };
}

export function Quests({ q }: { q: ReturnType<typeof useQuestData> }) {
  const auth = useAuth(); const { toast, city } = useApp();
  const cityName = CONFIG.cities[city]?.name ?? "your city";
  const d = q.data;
  const [words, setWords] = useState<string[]>([]);
  const [pq, setPq] = useState(PROMPTS[0]); const [pa, setPa] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<"words" | "prompt" | null>(null);
  useEffect(() => { if (d) { setWords(d.three_words ?? []); setPq(d.prompt_q || PROMPTS[0]); setPa(d.prompt_a ?? ""); } }, [d]);
  if (!d || !auth.client || !auth.me) return null;
  const wordsDone = (d.three_words?.length ?? 0) === 3, promptDone = !!d.prompt_a?.trim();
  const done = Number(wordsDone) + Number(promptDone);

  async function save(patch: Partial<QuestData>, btn: HTMLElement | null, msg: string) {
    setBusy(true);
    const { error } = await auth.client!.from("users").update(patch).eq("id", auth.me!.id);
    setBusy(false);
    if (error) return toast("⚠️ " + error.message);
    q.setData({ ...d!, ...patch }); setEdit(null);
    burstFrom(btn, ["✨", "⭐", "💜"], 12); toast(msg);
  }

  return (
    <section className="quests" id="quests">
      <div className="q-head"><b>Profile quests</b><small>{done}/2 done · +10 XP each · hosts read these when you ask for a seat</small></div>

      <div className={`q-card ${wordsDone && edit !== "words" ? "done" : ""}`}>
        <span className="q-tag">Quest 1 · 10 sec</span>
        <h3>Describe yourself in three words</h3>
        {wordsDone && edit !== "words" ? <div className="q-done"><div className="q-words">{d.three_words.map((w) => <span key={w}>{w}</span>)}</div><button className="linkish" onClick={() => setEdit("words")}>Change</button></div> : <>
          <p className="muted">Tap three that feel like you. <b>{words.length} of 3</b></p>
          <div className="q-chips">{WORDS.map((w) => {
            const on = words.includes(w);
            return <button key={w} type="button" aria-pressed={on} className={on ? "on" : ""} disabled={!on && words.length >= 3}
              onClick={() => setWords((x) => on ? x.filter((y) => y !== w) : [...x, w].slice(0, 3))}>{w}</button>;
          })}</div>
          <button className="btn btn-ink btn-sm" disabled={busy || words.length !== 3} onClick={(e) => save({ three_words: words }, e.currentTarget, "Three words locked in ✓ +10 XP")}>Lock them in</button>
        </>}
      </div>

      <div className={`q-card ${promptDone && edit !== "prompt" ? "done" : ""}`}>
        <span className="q-tag">Quest 2 · 30 sec</span>
        <h3>Answer a prompt</h3>
        {promptDone && edit !== "prompt" ? <div className="q-done"><blockquote><small>{promptText(d.prompt_q || PROMPTS[0], cityName)}</small>{d.prompt_a}</blockquote><button className="linkish" onClick={() => setEdit("prompt")}>Change</button></div> : <>
          <div className="q-row">
            <select value={pq} onChange={(e) => setPq(e.target.value)} aria-label="Prompt">{PROMPTS.map((p) => <option key={p} value={p}>{promptText(p, cityName)}</option>)}</select>
            <button type="button" className="btn btn-white btn-sm" onClick={() => setPq(PROMPTS[(PROMPTS.indexOf(pq) + 1 + Math.floor(Math.random() * (PROMPTS.length - 1))) % PROMPTS.length])}>🎲 Spin</button>
          </div>
          <textarea rows={2} maxLength={160} value={pa} placeholder="Keep it short and real…" onChange={(e) => setPa(e.target.value)} />
          <button className="btn btn-ink btn-sm" disabled={busy || pa.trim().length < 3} onClick={(e) => save({ prompt_q: pq, prompt_a: pa.trim() }, e.currentTarget, "Prompt saved ✓ +10 XP")}>Save answer</button>
        </>}
      </div>
    </section>
  );
}

/* ---------- bring your people ---------- */
type Inv = { code: string; joined: number; completed: number; came: number; points: number };
export function useInvites() {
  const auth = useAuth();
  const [inv, setInv] = useState<Inv | null>(null);
  useEffect(() => {
    if (!auth.client || !auth.me) return;
    auth.client.rpc("my_invites").then(({ data }) => setInv((data as Inv) ?? null));
  }, [auth.client, auth.me]);
  return inv;
}

export function InviteCard({ inv }: { inv: Inv | null }) {
  const { toast } = useApp();
  if (!inv) return null;
  const link = `${CONFIG.siteUrl}/?ref=${inv.code}`;
  const msg = `Come to a ${CONFIG.brand} plan with me! Small hosted meetups for people coming solo. Join here: ${link}`;
  const tier = inv.points >= 50 ? "Tier 1 ⭐" : `${50 - inv.points} pts to Tier 1`;
  return (
    <section className="invite-card">
      <span className="eyebrow">Bring your people</span>
      <h3>Plans are better with your friends.</h3>
      <div className="inv-stats"><span><b>{inv.joined}</b> joined</span><span><b>{inv.came}</b> came</span><span><b>{inv.points}</b> pts</span><span className="muted">{tier}</span></div>
      <p className="muted">+10 when a friend joins and fills their profile, +20 when they come to a plan. The team may use points when picking from a waiting list. Points have no cash value.</p>
      <div className="inv-acts">
        <a className="btn btn-sun btn-sm" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <button className="btn btn-white btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(link); toast("Invite link copied ✓"); } catch { toast(link); } }}>Copy link</button>
        {typeof navigator !== "undefined" && "share" in navigator && <button className="btn btn-white btn-sm" onClick={() => navigator.share({ title: CONFIG.brand, text: msg, url: link }).catch(() => {})}>Share ↗</button>}
      </div>
    </section>
  );
}

/** Remembers ?ref=CODE from an invite link and, once the person has an account, credits their friend. */
export function InviteClaimer() {
  const auth = useAuth();
  useEffect(() => {
    try { const r = new URL(location.href).searchParams.get("ref"); if (r && /^[a-z0-9]{5,12}$/i.test(r)) localStorage.setItem("mt-ref", r.toLowerCase()); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (!auth.client || !auth.me) return;
    let code: string | null = null;
    try { code = localStorage.getItem("mt-ref"); } catch { /* ignore */ }
    if (!code) return;
    auth.client.rpc("claim_invite", { p_code: code }).then(() => { try { localStorage.removeItem("mt-ref"); } catch { /* ignore */ } });
  }, [auth.client, auth.me]);
  return null;
}
