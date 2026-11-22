"use client";
// /saved/ — "Your plans": seat requests with their status, door passes,
// calendar files, past plans and saved-for-later.
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { CalendarButton, InviteBox, STATUS_UI, useMyRequests, type MyRequest } from "../plans";
import { Empty, EventCard, Poster } from "../ui";
import { burstFrom, buzz } from "../fx";
import { useEffect, useState } from "react";
import { type MeetEvent, addressDropAt, eventUrl, fmtWhen, startsAt } from "@/lib/events";

export default function SavedPage() {
  const { ready, upcoming, byId, requests, savedIds, toast } = useApp();
  const auth = useAuth();
  const { rows, setRows } = useMyRequests();
  const now = Date.now();

  // Logged in: the database is the truth. Logged out: requests saved on this device.
  const mine: { e: MeetEvent; r: MyRequest | null }[] = rows
    ? rows.filter((r) => r.status !== "cancelled").map((r) => ({ e: byId(r.plan_ref)!, r })).filter((x) => x.e)
    : requests.map((q) => ({ e: byId(q.id)!, r: null })).filter((x) => x.e);
  const live = mine.filter((x) => endTime(x.e) > now).sort((a, b) => a.e.date.getTime() - b.e.date.getTime());
  const past = mine.filter((x) => endTime(x.e) <= now).sort((a, b) => b.e.date.getTime() - a.e.date.getTime());
  const nextPass = live.find((x) => x.r?.status === "approved" || x.r?.status === "attended");
  const saved = upcoming.filter((e) => savedIds.includes(e.id));
  const find = <Link className="btn btn-sun btn-sm" href="/events/" style={{ marginTop: 16 }}>Find a plan →</Link>;

  async function cancel(r: MyRequest) {
    if (!auth.client || !confirm("Cancel your spot on this plan?")) return;
    const { error } = await auth.client.from("plan_requests").update({ status: "cancelled" }).eq("id", r.id);
    if (error) return toast("Couldn't cancel: " + error.message);
    setRows((l) => l && l.map((x) => (x.id === r.id ? { ...x, status: "cancelled" } : x))); toast("Spot cancelled"); buzz();
  }

  return (
    <div className="wrap">
      <section className="page-hero">
        <span className="eyebrow">Your plans</span>
        <h1>Your little <span className="serif">calendar.</span></h1>
        <p>{rows ? "Requests, waitlists and door passes live here." : "Seats you've asked for and plans you've saved. Log in to see your door passes."}</p>
        {nextPass && (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", delay: 0.3 }}>
            <Link className="pass-chip" href={`/ticket/?id=${nextPass.e.id}`}><b>🎫 Open door pass</b><span>{nextPass.e.title}</span></Link>
          </motion.div>
        )}
      </section>

      <div className="group">
        <div className="group-head"><h3>Coming up</h3><span>{live.length ? `${live.length} plan${live.length > 1 ? "s" : ""}` : ""}</span></div>
        {!ready || (auth.session && !rows && auth.enabled) ? <div className="skeleton" style={{ minHeight: 140 }} /> : live.length ? (
          <div className="plan-list">
            <AnimatePresence>
              {live.map(({ e, r }, i) => <PlanRow key={e.id} e={e} r={r} i={i} onCancel={cancel} />)}
            </AnimatePresence>
          </div>
        ) : <Empty title="No plans yet.">Request a seat on any plan and it shows up here with its status.<div>{find}</div></Empty>}
      </div>

      {live.some((x) => x.r?.status === "approved") && <div className="group"><InviteBox e={nextPass?.e} /></div>}

      <div className="group">
        <div className="group-head"><h3>Saved for later ♥</h3><span>{saved.length ? `${saved.length} saved` : ""}</span></div>
        <div className="grid">
          {!ready ? <div className="skeleton" /> : saved.length ? saved.map((e, i) => <EventCard key={e.id} e={e} index={i} />)
            : <Empty title="Nothing saved yet.">Tap the ♡ on any plan, or swipe right on <Link href="/swipe/" style={{ textDecoration: "underline" }}>Discover</Link>.<div>{find}</div></Empty>}
        </div>
      </div>

      {past.length > 0 && (
        <div className="group">
          <div className="group-head"><h3>Past plans</h3><span>{past.length}</span></div>
          <div className="plan-list past">{past.map(({ e, r }, i) => <PlanRow key={e.id} e={e} r={r} i={i} past />)}</div>
        </div>
      )}
    </div>
  );
}

const endTime = (e: MeetEvent) => startsAt(e).getTime() + 3 * 36e5;

function PlanRow({ e, r, i, past = false, onCancel }: { e: MeetEvent; r: MyRequest | null; i: number; past?: boolean; onCancel?: (r: MyRequest) => void }) {
  const st = r ? STATUS_UI[r.status] : null;
  const label = !r ? "Sent on WhatsApp 💬" : past ? st?.past : st?.label;
  const tone = !r ? "#E7F9EF" : past ? (r.status === "approved" || r.status === "attended" ? "#C9F5E4" : "#F1EEF6") : st?.tone;
  const drop = addressDropAt(e);
  const dropped = Date.now() >= drop.getTime();
  return (
    <motion.article className={`plan-row ${past ? "is-past" : ""}`} layout initial={{ opacity: 0, y: 24, rotate: i % 2 ? 1.5 : -1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }}
      exit={{ opacity: 0, x: -60 }} transition={{ type: "spring", stiffness: 220, damping: 22, delay: Math.min(i, 6) * 0.05 }}>
      <Link href={eventUrl(e)} className="plan-main">
        <Poster e={e} badge={false} className="plan-thumb" />
        <span className="plan-txt">
          <small>{fmtWhen(startsAt(e))}</small>
          <b>{e.title}</b>
          <small>{e.area}</small>
          <motion.span className="plan-status" style={{ background: tone }} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 12, delay: 0.2 }}>{label}</motion.span>
        </span>
      </Link>
      {!past && r?.status === "approved" && (
        <div className="plan-acts">
          <span className="drop">{dropped ? "📍 Exact spot sent on WhatsApp" : `📍 Exact spot drops ${fmtWhen(drop)}`}</span>
          <div className="plan-btns">
            <Link className="btn btn-ink btn-sm" href={`/ticket/?id=${e.id}`}>My door pass 🎫</Link>
            <CalendarButton e={e} />
          </div>
        </div>
      )}
      {!past && r?.status === "waitlisted" && <p className="plan-note">We&apos;ll WhatsApp you the moment a seat opens up.</p>}
      {!past && r?.status === "pending" && <p className="plan-note">The team is building the table. You&apos;ll hear back on WhatsApp.</p>}
      {!past && r?.status === "attended" && <p className="plan-note">You&apos;re checked in. Have the best time 💜</p>}
      {r?.status === "attended" && <RateBox planRef={e.id} />}
      {!past && r && r.status !== "declined" && r.status !== "attended" && onCancel && <button className="linkish plan-cancel" onClick={() => onCancel(r)}>{r.status === "approved" ? "I can't make it" : "Cancel my spot"}</button>}
    </motion.article>
  );
}

/* Only people who were checked in can rate the host (the database checks this too). */
function RateBox({ planRef }: { planRef: string }) {
  const auth = useAuth(); const { toast } = useApp();
  const [stars, setStars] = useState(0); const [hover, setHover] = useState(0); const [text, setText] = useState("");
  const [done, setDone] = useState<number | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!auth.client || !auth.me) return;
    auth.client.from("host_reviews").select("rating,comment").eq("plan_ref", planRef).eq("user_id", auth.me.id).maybeSingle()
      .then(({ data }) => { if (data) { setDone((data as { rating: number }).rating); setText((data as { comment: string }).comment ?? ""); } });
  }, [auth.client, auth.me, planRef]);
  async function send(ev: React.MouseEvent<HTMLButtonElement>) {
    if (!stars || !auth.client) return;
    const btn = ev.currentTarget; setBusy(true);
    const { error } = await auth.client.rpc("submit_review", { p_plan_ref: planRef, p_rating: stars, p_comment: text.trim() });
    setBusy(false);
    if (error) return toast(error.message);
    burstFrom(btn, ["⭐", "💜", "✨"], 14); buzz(); setDone(stars); toast("Thanks for the review ✓");
  }
  if (done) return <p className="plan-note">You rated your host {"★".repeat(done)}{"☆".repeat(5 - done)} · thank you!</p>;
  return (
    <div className="rate-box">
      <b>How was your host?</b>
      <div className="rate-stars" role="radiogroup" aria-label="Rating out of 5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <motion.button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className={(hover || stars) >= n ? "on" : ""} whileTap={{ scale: 1.4, rotate: 15 }} onMouseEnter={() => setHover(n)} onClick={() => { setStars(n); buzz(8); }}>★</motion.button>
        ))}
      </div>
      {stars > 0 && <textarea rows={2} maxLength={600} placeholder="Anything to share? (optional)" value={text} onChange={(e) => setText(e.target.value)} />}
      {stars > 0 && <button type="button" className="btn btn-ink btn-sm" disabled={busy} onClick={send}>Send review</button>}
    </div>
  );
}
