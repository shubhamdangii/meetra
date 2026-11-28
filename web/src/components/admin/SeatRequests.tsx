"use client";
// Seat requests: one table for every plan, filtered by event, host and date.
// Approve / waitlist / decline per row; Auto-fill when a single event is picked.
import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { type MeetEvent, eventUrl, hostNames, relDay } from "@/lib/events";
import { Empty, Pager, cityName, fmtDT, usePaged } from "./shared";
import { rupees } from "@/lib/razorpay";
import { CONFIG } from "@/lib/config";

type R = {
  request_id: number; plan_ref: string; plan_date: string; city_slug: string; display_name: string; full_name: string | null; avatar_url: string | null;
  phone: string | null; instagram_url: string | null; linkedin_url: string | null; occupation: string | null; profile_score: number;
  phone_verified: boolean; email_verified: boolean; status: string; party_size: number; icebreaker: string | null; requested_at: string; decided_at: string | null; paid_amount: number | null; paid_at: string | null; refund_status: string | null;
};
const DATES = [["upcoming", "Upcoming"], ["today", "Today"], ["tomorrow", "Tomorrow"], ["week", "Next 7 days"], ["past", "Past"], ["all", "Any date"], ["pick", "Pick a date…"]] as const;
const STATUS = [["", "Any status"], ["pending", "Pending"], ["approved", "Approved"], ["waitlisted", "Waiting list"], ["attended", "Checked in"], ["declined", "Declined"], ["cancelled", "Cancelled"]] as const;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function SeatRequests({ cities }: { cities: string[] }) {
  const auth = useAuth(); const { byId, today, toast, confirm } = useApp();
  const [rows, setRows] = useState<R[] | null>(null);
  const [event, setEvent] = useState(""); const [host, setHost] = useState(""); const [date, setDate] = useState<(typeof DATES)[number][0]>("upcoming");
  const [day, setDay] = useState(""); const [status, setStatus] = useState(""); const [busy, setBusy] = useState(false);

  const [about, setAbout] = useState<Map<number, { three_words: string[]; prompt_a: string | null }>>(new Map());
  const load = useCallback(async () => {
    if (!auth.client) return;
    const { data, error } = await auth.client.rpc("admin_all_requests", { p_from: null, p_to: null });
    if (error) { toast("Couldn't load: " + error.message); setRows([]); return; }
    setRows(data as R[]);
    // what members said about themselves (profile quests), for the team deciding seats
    const ids = (data as R[]).map((r) => r.request_id);
    if (ids.length) {
      const pr = await auth.client.from("plan_requests").select("id,user_id").in("id", ids.slice(0, 500));
      const uids = [...new Set(((pr.data ?? []) as { id: number; user_id: string }[]).map((x) => x.user_id))];
      const us = uids.length ? await auth.client.from("users").select("id,three_words,prompt_a").in("id", uids) : { data: [] };
      const byU = new Map(((us.data ?? []) as { id: string; three_words: string[]; prompt_a: string | null }[]).map((u) => [u.id, u]));
      setAbout(new Map(((pr.data ?? []) as { id: number; user_id: string }[]).map((x) => [x.id, byU.get(x.user_id)]).filter((x) => x[1]) as [number, { three_words: string[]; prompt_a: string | null }][]));
    }
  }, [auth.client, toast]);
  useEffect(() => { load(); }, [load]);

  const evOf = useCallback((r: R): MeetEvent | undefined => byId(r.plan_ref), [byId]);
  const hostOf = useCallback((r: R) => { const e = evOf(r); return e ? hostNames(e) : "–"; }, [evOf]);
  const t0 = ymd(today), t1 = ymd(new Date(today.getTime() + 864e5)), t7 = ymd(new Date(today.getTime() + 7 * 864e5));
  const inDate = useCallback((r: R) => {
    const d = r.plan_date;
    switch (date) {
      case "upcoming": return d >= t0; case "today": return d === t0; case "tomorrow": return d === t1;
      case "week": return d >= t0 && d <= t7; case "past": return d < t0; case "pick": return !day || d === day; default: return true;
    }
  }, [date, day, t0, t1, t7]);

  const scoped = useMemo(() => (rows ?? []).filter((r) => cities.includes(r.city_slug) && inDate(r) && (!host || hostOf(r) === host)), [rows, cities, inDate, host, hostOf]);
  const events = useMemo(() => {
    const m = new Map<string, { ref: string; label: string; n: number; d: string }>();
    scoped.forEach((r) => { const e = evOf(r); const x = m.get(r.plan_ref) ?? { ref: r.plan_ref, d: r.plan_date, n: 0, label: e ? `${relDay(e.date, today)} · ${e.title}` : r.plan_ref };
      if (r.status !== "cancelled") x.n++; m.set(r.plan_ref, x); });
    return [...m.values()].sort((a, b) => a.d.localeCompare(b.d));
  }, [scoped, evOf, today]);
  const hosts = useMemo(() => [...new Set((rows ?? []).filter((r) => cities.includes(r.city_slug)).map(hostOf))].filter((h) => h !== "–").sort(), [rows, cities, hostOf]);
  useEffect(() => { if (event && !events.some((e) => e.ref === event)) setEvent(""); }, [events, event]);
  // newest request first; serial numbers count down so #1 is always the oldest
  const list = useMemo(() => scoped.filter((r) => (!event || r.plan_ref === event) && (!status || r.status === status))
    .sort((a, b) => b.requested_at.localeCompare(a.requested_at)), [scoped, event, status]);
  const pg = usePaged(list, 10);
  const sel = event ? byId(event) : undefined;
  const count = (s: string) => list.filter((r) => r.status === s).length;

  async function setTo(r: R, s: string) {
    if (s === "declined" && !(await confirm({ title: `Decline ${r.full_name || r.display_name}?`, body: "They'll see 'Not this time' for this plan.", danger: true, ok: "Decline" }))) return;
    const { data, error } = await auth.client!.from("plan_requests").update({ status: s }).eq("id", r.request_id).select("id");
    if (error) return toast("Couldn't update: " + error.message);
    if (!data?.length) { load(); return toast("⚠️ Not saved: you don't have access to this request."); }
    toast({ approved: "Approved ✓", waitlisted: "Moved to waiting list ✓", declined: "Declined ✓" }[s] ?? "Updated ✓"); load();
  }
  async function fill() {
    if (!sel || !auth.client) return;
    if (!(await confirm({ title: `Auto-fill ${sel.seats} seats?`, body: "Keeps everyone already approved, approves the highest profile scores until seats run out, and waitlists the rest in order.", ok: "Auto-fill", icon: "🪄" }))) return;
    setBusy(true);
    const { data, error } = await auth.client.rpc("admin_fill_plan", { p_plan_ref: sel.id, p_capacity: sel.seats });
    setBusy(false);
    if (error) return toast("Couldn't fill: " + error.message);
    const x = (data as { approved: number; waitlisted: number; seats_left: number }[])[0];
    toast(`Approved ${x.approved} · waiting list ${x.waitlisted} · ${x.seats_left} seats left ✓`); load();
  }

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="sr-filters">
        <label><span>Event</span><select className="select" value={event} onChange={(e) => setEvent(e.target.value)}>
          <option value="">All events ({events.length})</option>
          {events.map((e) => <option key={e.ref} value={e.ref}>{e.label} ({e.n})</option>)}</select></label>
        <label><span>Host</span><select className="select" value={host} onChange={(e) => setHost(e.target.value)}>
          <option value="">All hosts</option>{hosts.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
        <label><span>Date</span><select className="select" value={date} onChange={(e) => setDate(e.target.value as typeof date)}>
          {DATES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {date === "pick" && <label><span>Day</span><input type="date" className="select" value={day} onChange={(e) => setDay(e.target.value)} /></label>}
        <label><span>Status</span><select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      <div className="sr-bar">
        <span className="sr-sum"><b>{list.length}</b> requests · {count("pending")} pending · {count("approved") + count("attended")} confirmed · {count("waitlisted")} waiting</span>
        {sel && <button className="btn btn-sun btn-sm" disabled={busy} onClick={fill}>🪄 Auto-fill {sel.seats} seats</button>}
        {sel && <Link className="btn btn-white btn-sm" href={eventUrl(sel)}>Plan page</Link>}
        <button className="btn btn-white btn-sm" onClick={load} aria-label="Refresh">↻</button>
      </div>
      {!rows ? <div className="skeleton" style={{ minHeight: 160 }} /> : !list.length ? <Empty>No seat requests match these filters.</Empty> : (
        <div className="rq-list">{pg.items.map((r, i) => {
          const e = evOf(r);
          const ab = about.get(r.request_id);
          const free = e && (e.priceType === "free" || e.price === 0);
          const pay = r.paid_at ? (r.refund_status === "refunded" ? ["ref", "Refunded"] : r.refund_status === "pending" ? ["ref", "Refunding"] : r.refund_status === "failed" ? ["bad", "Refund failed"] : ["ok", `Paid ${rupees(r.paid_amount)}`]) : free ? ["ok", "Free"] : ["no", "Not paid"];
          const stLabel = r.status === "waitlisted" ? "Waiting list" : r.status === "attended" ? "Checked in" : r.status[0].toUpperCase() + r.status.slice(1);
          return (
            <motion.article key={r.request_id} className={`rq s-${r.status}`} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
              <div className="rq-top">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.avatar_url ? <img className="rq-av" src={r.avatar_url} alt="" /> : <span className="rq-av ph">{(r.display_name || "?")[0]}</span>}
                <div className="rq-id"><b>{r.full_name || r.display_name}{r.party_size > 1 ? <em> +1</em> : null}</b><small>{r.occupation || "No occupation added"}</small></div>
                <span className={`rq-st ${r.status}`}>{stLabel}</span>
              </div>
              {!event && <button type="button" className="rq-event" onClick={() => setEvent(r.plan_ref)}><b>{e ? e.title.split(" · ")[0] : r.plan_ref}</b><span>{e ? `${relDay(e.date, today)} · ${e.time}` : r.plan_date} · {cityName(r.city_slug)} · {hostOf(r)}</span></button>}
              <dl className="rq-facts">
                <div><dt>Requested</dt><dd>{fmtDT(r.requested_at)}</dd></div>
                <div><dt>Profile</dt><dd><span className="score-pill">{r.profile_score}</span></dd></div>
                <div><dt>Verified</dt><dd>{CONFIG.mobileVerification ? (r.phone_verified ? "WhatsApp ✓" : "WhatsApp ✕") : ""}{r.email_verified ? `${CONFIG.mobileVerification ? " · " : ""}Email ✓` : "Email ✕"}</dd></div>
                <div><dt>Payment</dt><dd><span className={`pay-chip ${pay[0]}`}>{pay[1]}</span></dd></div>
              </dl>
              {(ab?.three_words?.length || r.icebreaker || ab?.prompt_a) ? <div className="rq-about">
                {ab?.three_words?.length ? <div className="rq-words">{ab.three_words.map((w) => <span key={w}>{w}</span>)}</div> : null}
                {r.icebreaker ? <p>&ldquo;{r.icebreaker}&rdquo;</p> : ab?.prompt_a ? <p>&ldquo;{ab.prompt_a}&rdquo;</p> : null}
              </div> : null}
              <div className="rq-foot">
                <div className="rq-contact">
                  {r.phone ? <a href={`https://wa.me/${r.phone.replace("+", "")}`} target="_blank" rel="noopener noreferrer">WhatsApp</a> : <span className="muted">No phone</span>}
                  {r.instagram_url && <a href={r.instagram_url} target="_blank" rel="noopener noreferrer">Instagram</a>}
                  {r.linkedin_url && <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer">LinkedIn</a>}
                </div>
                {r.status !== "attended" && r.status !== "cancelled" && <div className="rq-acts">
                  {r.status !== "approved" && <motion.button whileTap={{ scale: 0.95 }} className="ok" onClick={() => setTo(r, "approved")}>Approve</motion.button>}
                  {r.status !== "waitlisted" && <motion.button whileTap={{ scale: 0.95 }} onClick={() => setTo(r, "waitlisted")}>Waitlist</motion.button>}
                  {r.status !== "declined" && <motion.button whileTap={{ scale: 0.95 }} className="no" onClick={() => setTo(r, "declined")}>Decline</motion.button>}
                </div>}
              </div>
              <span className="rq-no" aria-label={`Request ${list.length - (pg.from - 1 + i)}`}>#{list.length - (pg.from - 1 + i)}</span>
            </motion.article>
          );
        })}</div>
      )}
      <Pager pg={pg} />
    </motion.section>
  );
}
