"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { EventCard, HostAv, Poster, Reveal, SaveButton, WhatsAppDone } from "../ui";
import { burstFrom } from "../fx";
import { CONFIG } from "@/lib/config";
import { addressDropAt, catOf, fmtDay, typeImages, hostTba, fmtWhen, hostNames, priceLabel, priceShort, whatsappLink } from "@/lib/events";
import { CalendarButton, useLiveRefresh, useSeatStream } from "../plans";
import { payForSeat, rupees } from "@/lib/razorpay";
import { PhotoStrip } from "../Photos";
import { AreaMap } from "../AreaMap";
import { areaPoint } from "@/lib/geo";
import { ExactLocation, WhoComing } from "../EventBits";
import { useTypeUploads } from "@/lib/eventMedia";

type MyReq = { id: number; status: "pending" | "approved" | "waitlisted" | "declined" | "cancelled" | "attended"; party_size: number; paid_at?: string | null; paid_amount?: number | null; refund_status?: string | null } | null;

const STATUS = {
  pending: ["⏳", "Request sent", "The team is reviewing requests. Seats go to the most complete profiles first."],
  approved: ["🎉", "You're in!", "Your door pass is ready. Show its QR code at the door."],
  waitlisted: ["🕒", "You're on the waiting list", "If a seat opens up, the highest-priority person on the list gets it. Complete your profile to move up."],
  declined: ["🙏", "Not this time", "This plan is full. Try another date — there's something on every day."],
  attended: ["✅", "You're checked in!", "Have the best time. You can rate your host 30 minutes after the plan starts, in Your plans."],
} as const;
// any status we don't know yet shows a neutral card instead of crashing the page
const statusText = (s: string) => (STATUS as Record<string, readonly [string, string, string]>)[s] ?? ["📌", "Your request", "Check Your plans for the latest status."];

const MOBILE_STATUS: Record<string, string> = { pending: "⏳ Requested", approved: "✅ You're in", waitlisted: "🕒 On waiting list", declined: "Not this time", attended: "✅ Checked in" };

export default function EventPage() {
  const params = useSearchParams();
  const { ready, byId, upcoming, today, addRequest, toast, confirm } = useApp();
  const auth = useAuth();
  const rawId = params.get("id") ?? "";

  // Old link to a past date? Show the next date of the same plan.
  const e = useMemo(() => {
    const found = byId(rawId);
    if (found && found.day >= 0) return found;
    const key = rawId.replace(/-\d{8}$/, "");
    return upcoming.find((x) => `${x.key}-${x.city}` === key) ?? found;
  }, [rawId, byId, upcoming]);
  useEffect(() => { if (ready && e && e.id !== rawId && byId(rawId)) toast("That date has passed — showing the next one"); }, [ready, e, rawId, byId, toast]);
  // Tab title ("Introverts' Dinner · Jaipur · meetra"). Set after Next applies its own page title.
  useEffect(() => {
    if (!e) return;
    const t = `${e.title} · ${CONFIG.cities[e.city].name} · ${CONFIG.brand}`;
    document.title = t; const id = setTimeout(() => { document.title = t; }, 60);
    return () => clearTimeout(id);
  }, [e]);

  const uploads = useTypeUploads();
  const [counts, setCounts] = useState<{ approved_seats: number; waitlisted: number; interested: number } | null>(null);
  const [myReq, setMyReq] = useState<MyReq>(null);
  const [pos, setPos] = useState<number | null>(null);
  const [name, setName] = useState(""); const [ice, setIce] = useState(""); const [friend, setFriend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waText, setWaText] = useState<string | null>(null);
  // hide the sticky phone bar while the booking card itself is on screen (it used to cover the form)
  const [bookOnScreen, setBookOnScreen] = useState(false);
  useEffect(() => {
    const el = document.getElementById("book"); if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([x]) => setBookOnScreen(x.isIntersecting), { rootMargin: "0px 0px -80px 0px" });
    io.observe(el); return () => io.disconnect();
  }, [e?.id, ready]);

  // Real numbers + my request, when login is on.
  useEffect(() => {
    if (!e || !auth.client) return;
    auth.client.rpc("plan_counts", { p_refs: [e.id] }).then(({ data }) => setCounts(data?.[0] ?? null));
  }, [e, auth.client]);
  const loadMine = useCallback(() => {
    if (!e || !auth.client || !auth.me) { setMyReq(null); return; }
    auth.client.from("plan_requests").select("id,status,party_size,paid_at,paid_amount,refund_status").eq("plan_ref", e.id).eq("user_id", auth.me.id).maybeSingle()
      .then(({ data }) => setMyReq(data as MyReq));
  }, [e, auth.client, auth.me]);
  useEffect(() => {
    loadMine();
    if (auth.me?.display_name && auth.me.display_name !== "New member") setName((n) => n || auth.me!.display_name);
  }, [loadMine, auth.me]);
  useLiveRefresh(loadMine, 60000);
  useSeatStream(loadMine);
  useEffect(() => {
    if (myReq?.status === "waitlisted" && auth.client && e) auth.client.rpc("my_waitlist_position", { p_plan_ref: e.id }).then(({ data }) => setPos(data ?? null));
  }, [myReq, auth.client, e]);

  if (!ready) return <div className="wrap" style={{ padding: "60px 0" }}><div className="skeleton" style={{ minHeight: 420 }} /></div>;
  if (!e) return (
    <section className="wrap page-hero">
      <h1>This plan has <span className="serif">wandered off.</span></h1><p>It may have finished or been renamed.</p>
      <div style={{ marginTop: 24 }}><Link className="btn btn-sun" href="/events/">See what&apos;s on →</Link></div>
    </section>
  );

  const city = CONFIG.cities[e.city].name;
  const pt = areaPoint(e.area, e.city);
  const cat = catOf(e.cat);
  const hosts = e.hosts.map((h) => ({ name: h, color: "#FFC93C", bio: `Verified ${CONFIG.brand} host.` }));
  const gallery = e.eventType ? [...(uploads[e.eventType] ?? []), ...typeImages(e.eventType)] : [];
  const left = counts ? Math.max(0, e.seats - counts.approved_seats) : e.left;
  const full = left === 0;
  // real events close for requests at their booking deadline; sample plans once their day has passed
  const closed = e.day < 0 || (!!e.bookingClosesAt && Date.now() >= e.bookingClosesAt.getTime());
  const pct = Math.round((1 - left / e.seats) * 100);
  const sameKey = upcoming.filter((x) => x.key === e.key && x.city === e.city && x.id !== e.id).slice(0, 4);
  const others = upcoming.filter((x) => x.city === e.city && x.key !== e.key && x.day <= e.day + 7).filter((x, i, a) => a.findIndex((y) => y.key === x.key) === i).slice(0, 4);
  const paid = e.priceType !== "free" && e.price > 0;
  const needsPay = !!myReq && myReq.status === "approved" && !myReq.paid_at && paid;
  async function payToConfirm(ev: React.MouseEvent<HTMLButtonElement>) {
    if (!auth.client || !myReq || !e) return;
    const btn = ev.currentTarget; setBusy(true);
    try {
      const seat = await payForSeat(auth.client, { plan_ref: e.id, request_id: myReq.id, price_hint: e.price });
      setBusy(false);
      if (!seat) return toast("Payment cancelled. Your seat is held for now, pay soon to keep it.");
      burstFrom(btn, ["🎉", "🎫", "✨"]); setMyReq({ ...myReq, paid_at: seat.paid_at ?? new Date().toISOString() });
      toast("Paid ✓ Your seat is confirmed and your door pass is ready");
    } catch (err) { setBusy(false); toast("⚠️ " + (err as Error).message); }
  }
  const payNote = e.priceType === "reservation" ? "Food and drinks are ordered separately." : e.priceType === "per person" ? "Covers everything listed in the plan." : e.priceType === "estimate" ? "Final inclusions and price shared before you pay." : "Free — just show up on time.";
  const score = auth.me?.profile_score;

  async function request(ev: React.FormEvent) {
    ev.preventDefault();
    if (!e) return;
    if (closed) return toast("Requests for this plan are closed.");
    const submitBtn = (ev.currentTarget as HTMLFormElement).querySelector("button[type=submit]");
    if (auth.enabled) {
      if (!auth.requireLogin(`/event/?id=${e.id}`)) return;
      if (!auth.client || !auth.me) return toast("Still loading your account — try again in a second.");
      // paid plans: pay first (Razorpay); the verified payment creates the seat request. Waiting list stays free.
      if (paid && !full) {
        setBusy(true);
        try {
          const seat = await payForSeat(auth.client, { plan_ref: e.id, party_size: friend ? 2 : 1, icebreaker: ice.trim() || null, price_hint: e.price });
          setBusy(false);
          if (!seat) return toast("Payment cancelled. No seat requested, nothing charged.");
          addRequest({ id: e.id, name, friend, at: Date.now() });
          burstFrom(submitBtn, ["🎉", "🥳", "✨", "💖", "💸"]);
          setMyReq({ id: seat.id, status: seat.status as NonNullable<MyReq>["status"], party_size: seat.party_size, paid_at: seat.paid_at ?? new Date().toISOString() });
          toast("Paid ✓ Request sent. Refunded automatically if you don't get a seat");
        } catch (err) { setBusy(false); toast("⚠️ " + (err as Error).message); }
        return;
      }
      setBusy(true);
      const row = { plan_ref: e.id, party_size: friend ? 2 : 1, icebreaker: ice.trim() || null, status: full ? "waitlisted" : "pending" };
      // asked before (and cancelled)? re-send that request instead of creating a duplicate
      let res = myReq
        ? await auth.client.from("plan_requests").update({ status: row.status, party_size: row.party_size, icebreaker: row.icebreaker }).eq("id", myReq.id).select("id,status,party_size").single()
        : await auth.client.from("plan_requests").insert(row).select("id,status,party_size").single();
      if (res.error && /duplicate|unique/i.test(res.error.message)) {
        res = await auth.client.from("plan_requests").update({ status: row.status, party_size: row.party_size, icebreaker: row.icebreaker })
          .eq("plan_ref", e.id).eq("user_id", auth.me.id).select("id,status,party_size").single();
      }
      setBusy(false);
      if (res.error) return toast("Couldn't send your request: " + res.error.message);
      addRequest({ id: e.id, name, friend, at: Date.now() });
      burstFrom(submitBtn, full ? ["⏳", "✨", "🙌"] : ["🎉", "🥳", "✨", "💖", "🍕"]);
      setMyReq(res.data as MyReq);
      toast(full ? "Added to the waiting list ✓" : "Request sent ✓");
      return;
    }
    const what = full ? `a place on the waiting list${friend ? " (2 people)" : ""}` : friend ? "2 seats" : "a seat";
    const msg = `Hi! I'd like ${what} at *${e.title}* on ${fmtDay(e.date)}, ${e.time} (${e.area}, ${city}).\n\nName: ${name}${ice ? `\nAsk me about: ${ice}` : ""}\n\nRef: ${e.id}`;
    addRequest({ id: e.id, name, friend, at: Date.now() });
    setWaText(msg);
    toast("Saved to Your plans ✓");
  }

  async function cancel() {
    if (!myReq || !auth.client || !e) return;
    const ok = await confirm({ title: myReq.status === "approved" ? "Give up your seat?" : "Cancel your request?", danger: true, ok: "Yes, cancel", cancel: "Keep my spot",
      body: `${e.title} · ${fmtDay(e.date)}${myReq.status === "approved" ? ". Your seat goes to the next person on the waiting list." : ""}` });
    if (!ok) return;
    const { error } = await auth.client.from("plan_requests").update({ status: "cancelled" }).eq("id", myReq.id);
    if (error) return toast("Couldn't cancel: " + error.message);
    setMyReq({ ...myReq, status: "cancelled" }); toast("Cancelled ✓");
  }

  const share = async () => {
    const data = { title: e.title, text: `${e.title} · ${fmtDay(e.date)}, ${e.time}`, url: location.href };
    try { if (navigator.share) { await navigator.share(data); return; } } catch (err) { if ((err as Error)?.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(data.url); toast("Link copied"); } catch { toast("Copy the link from your address bar"); }
  };

  const showStatus = myReq && myReq.status !== "cancelled";

  return (
    <div className="wrap">
      <nav className="crumbs"><Link href="/events/">Explore</Link> / <Link href={`/events/?cat=${e.cat}`}>{cat.label}</Link> / <span>{city}</span></nav>
      <div className="ev-head">
        <div>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>{e.title}</motion.h1>
          <div className="meta"><span>{fmtDay(e.date)}</span>·<span>{e.time} – {e.end}</span>·<span>{e.area}, {city}</span>{e.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
          <div className="meta" style={{ marginTop: 8 }}>
            {hostTba(e) ? <span className="host-tba">🎙️ Host announced soon</span> : <>
            <span className="faces" style={{ display: "inline-flex" }}>{hosts.map((h: any) => <span key={h.name} style={{ background: h.color, width: 28, height: 28, fontSize: 12 }}>{h.name[0]}</span>)}</span>
            hosted by {e.hostId ? <Link href={`/host-profile/?id=${e.hostId}`} style={{ fontWeight: 800, textDecoration: "underline" }}>{hostNames(e)}</Link> : <b>{hostNames(e)}</b>}<span className="verified">✓</span></>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}><SaveButton id={e.id} label /><button className="btn btn-white btn-sm" onClick={share}>↗ Share</button></div>
      </div>

      <div className="ev-layout">
        <div>
          <motion.div className="ev-hero" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}><Poster e={e} title /></motion.div>
          <p className="lede">{e.blurb}</p>
          <div className="anchor-links"><a href="#unfolds">How it unfolds</a><a href="#going">Who&apos;s coming</a><a href="#host">Your host</a><a href="#where">Location</a><a href="#before">Before you go</a></div>

          {gallery.length > 1 && (
            <section className="ev-sec" id="photos">
              <h2>From past <span className="serif" style={{ color: "var(--pink)" }}>meetups</span></h2>
              <p className="muted" style={{ marginBottom: 6 }}>Real photos from this plan. Tap to open.</p>
              <PhotoStrip photos={gallery.map((src) => ({ src }))} label={`Photos from ${e.title}`} />
            </section>
          )}

          <section className="ev-sec" id="unfolds">
            <h2>How it <span className="serif" style={{ color: "var(--violet)" }}>unfolds</span></h2>
            <ol className="timeline">
              {e.steps.map((s, i) => (
                <motion.li key={s} initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.12 }}>
                  <b>{s}</b><span className="muted">{["Everyone arrives, gets a name tag and a drink.", "This is where the table really starts talking.", "Most people stay longer than planned."][i] || ""}</span>
                </motion.li>
              ))}
            </ol>
          </section>

          <section className="ev-sec" id="going">
            <h2>Who&apos;s <span className="serif" style={{ color: "var(--pink)" }}>coming</span></h2>
            <WhoComing planRef={e.id} seats={e.seats} />
          </section>

          <section className="ev-sec" id="host">
            <h2>Your <span className="serif" style={{ color: "var(--violet)" }}>host</span></h2>
            {hostTba(e) ? <div className="host-row"><div className="av" style={{ background: "#16122B" }}>?</div><div><span className="eyebrow">{CONFIG.brand} host</span><h3>Announced soon</h3><p className="muted">The team is picking the perfect host for this plan. You&apos;ll see who it is here before the day.</p></div></div>
            : e.hostId ? <RealHost id={e.hostId} planRef={e.id} /> : hosts.map((h: any) => (
              <Reveal key={h.name} className="host-row" style={{ marginBottom: 14 }}>
                <HostAv h={h} />
                <div><span className="eyebrow">{CONFIG.brand} host · verified</span><h3>{h.name} <span className="verified">✓</span></h3><p className="muted">{h.bio}</p></div>
              </Reveal>
            ))}
          </section>

          <section className="ev-sec" id="where">
            <h2>Where we&apos;ll <span className="serif" style={{ color: "var(--violet)" }}>meet</span></h2>
            <p className="muted" style={{ marginBottom: 12 }}>{e.area}, {city}. The circle shows the area, not the venue. The exact spot unlocks in Your plans once your seat is confirmed and paid.</p>
            {(myReq?.status === "approved" || myReq?.status === "attended") && <ExactLocation planRef={e.id} />}
            <AreaMap center={[pt.lat, pt.lon]} zoom={pt.exact ? 14 : 12} radius={pt.exact ? 650 : 2500} height={240} />
            <a className="linkish" style={{ display: "inline-block", marginTop: 10 }} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.area}, ${city}`)}`} target="_blank" rel="noopener noreferrer">Explore the area ↗</a>
          </section>

          <section className="ev-sec" id="before" style={{ border: 0 }}>
            <h2>Before <span className="serif" style={{ color: "var(--violet)" }}>you go</span></h2>
            <details className="acc" open><summary>Price &amp; what it covers</summary><div className="acc-body"><b>{priceShort(e)} {priceLabel(e)}.</b> {payNote} {e.priceType === "reservation" ? `The ${priceShort(e)} reservation is non-refundable once confirmed.` : ""}</div></details>
            <details className="acc"><summary>Where to meet</summary><div className="acc-body">{e.area}, {city}. The exact spot (with a Google Maps link) shows in Your plans after your seat is confirmed and paid.</div></details>
            <details className="acc"><summary>Who can come</summary><div className="acc-body">{e.tags.includes("Women only") ? "This plan is for women only." : "Open to everyone 18+."} Most people come alone — that&apos;s the point.</div></details>
            <details className="acc"><summary>Cancellations</summary><div className="acc-body">If you can&apos;t make it, cancel here as early as you can so someone on the waiting list gets your seat. If we cancel, you get a full refund.</div></details>
            <details className="acc"><summary>Help at the meetup</summary><div className="acc-body">Your host is there from start to finish. You can also message us on WhatsApp any time.</div></details>
          </section>
        </div>

        <aside className="book" id="book">
          <div className="book-top"><div className="amt">{priceShort(e)}</div><small>{priceLabel(e)}{e.priceType !== "free" && e.price > 0 ? " · refunded if you don't get a seat" : ""}</small></div>
          <div className="book-body">
            <ul className="facts">
              <li><span className="ic">📅</span><div><small>Date</small><b>{fmtDay(e.date)}</b></div></li>
              <li><span className="ic">⏰</span><div><small>Time</small><b>{e.time} – {e.end}</b></div></li>
              <li><span className="ic">📍</span><div><small>Area</small><b>{e.area}, {city}</b></div></li>
              {e.bookingClosesAt && <li><span className="ic">⏳</span><div><small>Requests close</small><b>{e.bookingClosesAt.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}</b></div></li>}
              <li><span className="ic">👥</span><div style={{ flex: 1 }}><small>Group</small><b>Up to {e.seats} · {e.tags.includes("Women only") ? "women only" : "open to all"}</b>
                <div className="meter"><motion.i initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: "easeOut" }} /></div>
                <small style={{ color: left <= 4 ? "#B3134B" : "var(--muted)" }}>{full ? `Full${counts ? ` · ${counts.waitlisted} on the waiting list` : " — join the waiting list"}` : `${left} of ${e.seats} seats left`}</small>
                {counts && counts.interested > 0 && <small className="muted" style={{ display: "block" }}>♥ {counts.interested} {counts.interested === 1 ? "person" : "people"} interested</small>}
              </div></li>
            </ul>

            <AnimatePresence mode="wait">
              {waText ? (
                <WhatsAppDone key="wa" text={waText} heading={`Almost there, ${name}!`} link={whatsappLink(waText)} />
              ) : showStatus ? (
                <motion.div key="status" className={`status-card s-${myReq!.status}`} initial={{ opacity: 0, scale: 0.92, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
                  <motion.div className="st-ic" initial={{ rotate: -20, scale: 0.5 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 10, delay: 0.1 }}>{statusText(myReq!.status)[0]}</motion.div>
                  <b>{myReq!.status === "waitlisted" && pos ? `You're #${pos} on the waiting list` : statusText(myReq!.status)[1]}</b>
                  <p>{statusText(myReq!.status)[2]}</p>
                  {needsPay && <div className="pay-box"><b>One step left: pay {priceShort(e)}{myReq!.party_size > 1 ? " × 2" : ""} to confirm</b><small>UPI, QR, cards, netbanking or wallets via Razorpay.</small>
                    <motion.button whileTap={{ scale: 0.96 }} className="btn btn-sun btn-block" type="button" disabled={busy} onClick={payToConfirm}>{busy ? "Opening…" : "Pay & confirm my seat →"}</motion.button></div>}
                  {myReq!.paid_at && <p className="paid-tag">💳 Paid{myReq!.paid_amount ? " " + rupees(myReq!.paid_amount) : ""}{myReq!.refund_status === "refunded" ? " · refunded ↩" : myReq!.refund_status === "pending" ? " · refund on its way ↩" : ""}</p>}
                  {!needsPay && (myReq!.status === "approved" || myReq!.status === "attended") && <>
                    <p className="drop-note">{Date.now() >= addressDropAt(e).getTime() ? "📍 Exact spot is on your WhatsApp." : `📍 Exact spot drops ${fmtWhen(addressDropAt(e))}`}</p>
                    <div className="plan-btns" style={{ justifyContent: "center" }}><Link className="btn btn-ink btn-sm" href={`/ticket/?id=${e.id}`}>My door pass 🎫</Link><CalendarButton e={e} /></div>
                  </>}
                  {myReq!.status !== "declined" && myReq!.status !== "attended" && <button className="linkish" type="button" onClick={cancel}>{myReq!.status === "approved" ? "I can't make it" : "Cancel my request"}</button>}
                </motion.div>
              ) : (
                <motion.form key="form" onSubmit={request} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="field"><label htmlFor="nm">Your name</label><input id="nm" required autoComplete="given-name" placeholder="First name is fine" value={name} onChange={(x) => setName(x.target.value)} /></div>
                  <div className="field"><label htmlFor="ice">What could someone ask you about that makes you forget the small talk?</label><textarea id="ice" maxLength={300} placeholder="Football, old Hindi songs, startups, cats…" value={ice} onChange={(x) => setIce(x.target.value)} /></div>
                  <label className="check"><input type="checkbox" checked={friend} onChange={(x) => setFriend(x.target.checked)} /> I&apos;m bringing a friend</label>
                  <motion.button whileTap={{ scale: 0.96 }} className="btn btn-sun btn-block" type="submit" disabled={busy || closed}>{closed ? "Requests are closed" : busy ? "Opening payment…" : full ? "Join the waiting list (free)" : paid ? `Pay ${priceShort(e)}${friend ? " × 2" : ""} & request a seat` : "Request a seat"}{closed || busy ? "" : " →"}</motion.button>
                  {paid && !full && !closed && <p className="pay-hint">🔒 Secure payment by Razorpay: UPI / QR, cards, netbanking, wallets. <b>Full refund</b> if you don&apos;t get a seat.</p>}
                  {auth.enabled && (
                    <div className="priority">
                      <b>Seats go to the most complete profiles first.</b>
                      {score == null ? "Fill in your profile after logging in to move up the list." : <>Your profile score: <span className="score-pill">{score}/100</span> {score < 100 ? <Link href="/profile/">Add details to move up →</Link> : "Top priority ✓"}</>}
                    </div>
                  )}
                  <p className="fine">{!auth.enabled ? "Opens WhatsApp with your request. Your host confirms there, then you pay. Only your host sees your number."
                    : auth.session ? (paid && !full ? "You pay now to hold your place. The team confirms your seat, and if you don't get one, the full amount is refunded automatically. Only your host sees your number."
                      : paid ? "The waiting list is free. If a seat opens, you pay then to confirm it. Only your host sees your number."
                      : "Your request is saved. The team confirms your seat here and on WhatsApp. Only your host sees your number.")
                    : (CONFIG.loginWithWhatsApp ? "You'll log in with Google or WhatsApp first (takes 10 seconds)." : "You'll log in with Google first (takes 10 seconds).")}</p>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </aside>
      </div>

      {sameKey.length > 0 && <section className="sec" style={{ paddingBottom: 0 }}><div className="group-head"><h3>More dates for {e.title.split(" · ")[0]}</h3></div><div className="grid">{sameKey.map((x, i) => <EventCard key={x.id} e={x} index={i} />)}</div></section>}
      <section className="sec"><div className="group-head"><h3>More plans to try</h3><Link className="btn btn-white btn-sm" href="/events/">Explore all →</Link></div><div className="grid">{others.map((x, i) => <EventCard key={x.id} e={x} index={i} />)}</div></section>

      <div className={`mobile-book ${bookOnScreen ? "away" : ""}`} aria-hidden={bookOnScreen}><div><b>{priceShort(e)}</b> <small className="muted">{priceLabel(e)}</small><br /><small className="muted">{fmtDay(e.date)} · {e.time}</small></div><a className={`btn btn-sm ${showStatus ? "btn-white" : "btn-sun"}`} href="#book">{showStatus ? MOBILE_STATUS[myReq!.status] ?? "Your request" : full ? "Join waiting list" : "Request a seat"}</a></div>
    </div>
  );
}

/* Host of a real event (from the admin desk): photo, bio, rating out of 5 and what guests said. */
function RealHost({ id, planRef }: { id: number; planRef: string }) {
  const auth = useAuth();
  const [h, setH] = useState<{ name: string; bio: string; photo_url: string | null } | null>(null);
  const [r, setR] = useState<{ avg_rating: number; reviews: number } | null>(null);
  const [rev, setRev] = useState<{ rating: number; comment: string; first_name: string }[]>([]);
  useEffect(() => {
    if (!auth.client) return;
    auth.client.from("host_profiles").select("name,bio,photo_url").eq("id", id).maybeSingle().then(({ data }) => setH(data as typeof h));
    auth.client.rpc("host_ratings", { p_ids: [id] }).then(({ data }) => setR((data as (typeof r)[])?.[0] ?? null));
    auth.client.rpc("plan_reviews", { p_plan_ref: planRef }).then(({ data }) => setRev(((data as typeof rev) ?? []).filter((x) => x.comment).slice(0, 4)));
  }, [auth.client, id, planRef]);
  if (!h) return <div className="skeleton" style={{ minHeight: 90 }} />;
  return (
    <Reveal className="host-row" style={{ marginBottom: 14 }}>
      <div className="av" style={{ background: "#6C4CF5" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {h.photo_url ? <img src={h.photo_url} alt={h.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : h.name[0]}
      </div>
      <div><span className="eyebrow">{CONFIG.brand} host · verified</span><h3><Link href={`/host-profile/?id=${id}`} style={{ textDecoration: "underline", textDecorationThickness: 2, textUnderlineOffset: 4 }}>{h.name}</Link> <span className="verified">✓</span></h3>
        {r && r.reviews > 0 ? <p className="host-rating"><b>★ {Number(r.avg_rating).toFixed(1)}</b> / 5 · {r.reviews} review{r.reviews === 1 ? "" : "s"}</p> : <p className="host-rating muted">New host · no reviews yet</p>}
        {h.bio && <p className="muted">{h.bio}</p>}
        {rev.length > 0 && <ul className="host-reviews">{rev.map((x, i) => <li key={i}><b>{"★".repeat(x.rating)}</b> “{x.comment}” <small>– {x.first_name}</small></li>)}</ul>}
      </div>
    </Reveal>
  );
}
