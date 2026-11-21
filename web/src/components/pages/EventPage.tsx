"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { EventCard, Poster, Reveal, SaveButton, WhatsAppDone } from "../ui";
import { burstFrom } from "../fx";
import { CONFIG } from "@/lib/config";
import { HOSTS } from "@/lib/data";
import { catOf, fmtDay, hostNames, priceLabel, priceShort, whatsappLink } from "@/lib/events";

type MyReq = { id: number; status: "pending" | "approved" | "waitlisted" | "declined" | "cancelled"; party_size: number } | null;

const STATUS = {
  pending: ["⏳", "Request sent", "The team is reviewing requests. Seats go to the most complete profiles first."],
  approved: ["🎉", "You're in!", "We'll share the exact spot on WhatsApp. See you there."],
  waitlisted: ["🕒", "You're on the waiting list", "If a seat opens up, the highest-priority person on the list gets it. Complete your profile to move up."],
  declined: ["🙏", "Not this time", "This plan is full. Try another date — there's something on every day."],
} as const;

const MOBILE_STATUS: Record<string, string> = { pending: "⏳ Requested", approved: "✅ You're in", waitlisted: "🕒 On waiting list", declined: "Not this time" };

export default function EventPage() {
  const params = useSearchParams();
  const { ready, byId, upcoming, today, addRequest, toast } = useApp();
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

  const [counts, setCounts] = useState<{ approved_seats: number; waitlisted: number; interested: number } | null>(null);
  const [myReq, setMyReq] = useState<MyReq>(null);
  const [pos, setPos] = useState<number | null>(null);
  const [name, setName] = useState(""); const [ice, setIce] = useState(""); const [friend, setFriend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waText, setWaText] = useState<string | null>(null);

  // Real numbers + my request, when login is on.
  useEffect(() => {
    if (!e || !auth.client) return;
    auth.client.rpc("plan_counts", { p_refs: [e.id] }).then(({ data }) => setCounts(data?.[0] ?? null));
  }, [e, auth.client]);
  useEffect(() => {
    if (!e || !auth.client || !auth.me) { setMyReq(null); return; }
    auth.client.from("plan_requests").select("id,status,party_size").eq("plan_ref", e.id).eq("user_id", auth.me.id).maybeSingle()
      .then(({ data }) => setMyReq(data as MyReq));
    if (auth.me.display_name && auth.me.display_name !== "New member") setName((n) => n || auth.me!.display_name);
  }, [e, auth.client, auth.me]);
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
  const cat = catOf(e.cat);
  const hosts = e.hosts.map((h) => HOSTS[h]).filter(Boolean);
  const left = counts ? Math.max(0, e.seats - counts.approved_seats) : e.left;
  const full = left === 0;
  const pct = Math.round((1 - left / e.seats) * 100);
  const sameKey = upcoming.filter((x) => x.key === e.key && x.city === e.city && x.id !== e.id).slice(0, 4);
  const others = upcoming.filter((x) => x.city === e.city && x.key !== e.key && x.day <= e.day + 7).filter((x, i, a) => a.findIndex((y) => y.key === x.key) === i).slice(0, 4);
  const payNote = e.priceType === "reservation" ? "Food and drinks are ordered separately." : e.priceType === "per person" ? "Covers everything listed in the plan." : e.priceType === "estimate" ? "Final inclusions and price shared before you pay." : "Free — just show up on time.";
  const score = auth.me?.profile_score;

  async function request(ev: React.FormEvent) {
    ev.preventDefault();
    if (!e) return;
    const submitBtn = (ev.currentTarget as HTMLFormElement).querySelector("button[type=submit]");
    if (auth.enabled) {
      if (!auth.requireLogin(`/event/?id=${e.id}`)) return;
      if (!auth.client || !auth.me) return toast("Still loading your account — try again in a second.");
      setBusy(true);
      const row = { plan_ref: e.id, party_size: friend ? 2 : 1, icebreaker: ice.trim() || null, status: full ? "waitlisted" : "pending" };
      let res = await auth.client.from("plan_requests").insert(row).select("id,status,party_size").single();
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
    if (!myReq || !auth.client) return;
    const { error } = await auth.client.from("plan_requests").update({ status: "cancelled" }).eq("id", myReq.id);
    if (error) return toast("Couldn't cancel: " + error.message);
    setMyReq({ ...myReq, status: "cancelled" }); toast("Request cancelled");
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
            <span className="faces" style={{ display: "inline-flex" }}>{hosts.map((h: any) => <span key={h.name} style={{ background: h.color, width: 28, height: 28, fontSize: 12 }}>{h.name[0]}</span>)}</span>
            hosted by <b>{hostNames(e)}</b><span className="verified">✓</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}><SaveButton id={e.id} label /><button className="btn btn-white btn-sm" onClick={share}>↗ Share</button></div>
      </div>

      <div className="ev-layout">
        <div>
          <motion.div className="ev-hero" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}><Poster e={e} title /></motion.div>
          <p className="lede">{e.blurb}</p>
          <div className="anchor-links"><a href="#unfolds">How it unfolds</a><a href="#host">Your host</a><a href="#before">Before you go</a></div>

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

          <section className="ev-sec" id="host">
            <h2>Your <span className="serif" style={{ color: "var(--violet)" }}>host</span></h2>
            {hosts.map((h: any) => (
              <Reveal key={h.name} className="host-row" style={{ marginBottom: 14 }}>
                <div className="av" style={{ background: h.color }}>{h.name[0]}</div>
                <div><span className="eyebrow">{CONFIG.brand} host · verified</span><h3>{h.name} <span className="verified">✓</span></h3><p className="muted">{h.bio}</p></div>
              </Reveal>
            ))}
          </section>

          <section className="ev-sec" id="before" style={{ border: 0 }}>
            <h2>Before <span className="serif" style={{ color: "var(--violet)" }}>you go</span></h2>
            <details className="acc" open><summary>Price &amp; what it covers</summary><div className="acc-body"><b>{priceShort(e)} {priceLabel(e)}.</b> {payNote} {e.priceType === "reservation" ? `The ${priceShort(e)} reservation is non-refundable once confirmed.` : ""}</div></details>
            <details className="acc"><summary>Where to meet</summary><div className="acc-body">{e.area}, {city}. The exact spot is shared on WhatsApp after your seat is confirmed.</div></details>
            <details className="acc"><summary>Who can come</summary><div className="acc-body">{e.tags.includes("Women only") ? "This plan is for women only." : "Open to everyone 18+."} Most people come alone — that&apos;s the point.</div></details>
            <details className="acc"><summary>Cancellations</summary><div className="acc-body">If you can&apos;t make it, cancel here as early as you can so someone on the waiting list gets your seat. If we cancel, you get a full refund.</div></details>
            <details className="acc"><summary>Help at the meetup</summary><div className="acc-body">Your host is there from start to finish. You can also message us on WhatsApp any time.</div></details>
          </section>
        </div>

        <aside className="book" id="book">
          <div className="book-top"><div className="amt">{priceShort(e)}</div><small>{priceLabel(e)}{e.priceType === "reservation" ? " · pay after approval" : ""}</small></div>
          <div className="book-body">
            <ul className="facts">
              <li><span className="ic">📅</span><div><small>Date</small><b>{fmtDay(e.date)}</b></div></li>
              <li><span className="ic">⏰</span><div><small>Time</small><b>{e.time} – {e.end}</b></div></li>
              <li><span className="ic">📍</span><div><small>Area</small><b>{e.area}, {city}</b></div></li>
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
                  <motion.div className="st-ic" initial={{ rotate: -20, scale: 0.5 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 10, delay: 0.1 }}>{STATUS[myReq!.status as keyof typeof STATUS][0]}</motion.div>
                  <b>{myReq!.status === "waitlisted" && pos ? `You're #${pos} on the waiting list` : STATUS[myReq!.status as keyof typeof STATUS][1]}</b>
                  <p>{STATUS[myReq!.status as keyof typeof STATUS][2]}</p>
                  {myReq!.status !== "declined" && <button className="linkish" type="button" onClick={cancel}>Cancel my request</button>}
                </motion.div>
              ) : (
                <motion.form key="form" onSubmit={request} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="field"><label htmlFor="nm">Your name</label><input id="nm" required autoComplete="given-name" placeholder="First name is fine" value={name} onChange={(x) => setName(x.target.value)} /></div>
                  <div className="field"><label htmlFor="ice">What could someone ask you about that makes you forget the small talk?</label><textarea id="ice" maxLength={300} placeholder="Football, old Hindi songs, startups, cats…" value={ice} onChange={(x) => setIce(x.target.value)} /></div>
                  <label className="check"><input type="checkbox" checked={friend} onChange={(x) => setFriend(x.target.checked)} /> I&apos;m bringing a friend</label>
                  <motion.button whileTap={{ scale: 0.96 }} className="btn btn-sun btn-block" type="submit" disabled={busy}>{full ? "Join the waiting list" : "Request a seat"} →</motion.button>
                  {auth.enabled && (
                    <div className="priority">
                      <b>Seats go to the most complete profiles first.</b>
                      {score == null ? "Fill in your profile after logging in to move up the list." : <>Your profile score: <span className="score-pill">{score}/100</span> {score < 100 ? <Link href="/profile/">Add details to move up →</Link> : "Top priority ✓"}</>}
                    </div>
                  )}
                  <p className="fine">{!auth.enabled ? "Opens WhatsApp with your request. Your host confirms there, then you pay. Only your host sees your number."
                    : auth.session ? "Your request is saved. The team confirms on WhatsApp, then you pay. Only your host sees your number."
                    : (CONFIG.loginWithWhatsApp ? "You'll log in with Google or WhatsApp first (takes 10 seconds)." : "You'll log in with Google first (takes 10 seconds).")}</p>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </aside>
      </div>

      {sameKey.length > 0 && <section className="sec" style={{ paddingBottom: 0 }}><div className="group-head"><h3>More dates for {e.title.split(" · ")[0]}</h3></div><div className="grid">{sameKey.map((x, i) => <EventCard key={x.id} e={x} index={i} />)}</div></section>}
      <section className="sec"><div className="group-head"><h3>More plans to try</h3><Link className="btn btn-white btn-sm" href="/events/">Explore all →</Link></div><div className="grid">{others.map((x, i) => <EventCard key={x.id} e={x} index={i} />)}</div></section>

      <div className="mobile-book"><div><b>{priceShort(e)}</b> <small className="muted">{priceLabel(e)}</small><br /><small className="muted">{fmtDay(e.date)} · {e.time}</small></div><a className={`btn btn-sm ${showStatus ? "btn-white" : "btn-sun"}`} href="#book">{showStatus ? MOBILE_STATUS[myReq!.status] ?? "Your request" : full ? "Join waiting list" : "Request a seat"}</a></div>
    </div>
  );
}
