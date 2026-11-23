"use client";
// Seat requests: one table for every plan, filtered by event, host and date.
// Approve / waitlist / decline per row; Auto-fill when a single event is picked.
import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { type MeetEvent, eventUrl, hostNames, relDay } from "@/lib/events";
import { Empty, cityName } from "./shared";

type R = {
  request_id: number; plan_ref: string; plan_date: string; city_slug: string; display_name: string; full_name: string | null; avatar_url: string | null;
  phone: string | null; instagram_url: string | null; linkedin_url: string | null; occupation: string | null; profile_score: number;
  phone_verified: boolean; email_verified: boolean; status: string; party_size: number; icebreaker: string | null; requested_at: string; decided_at: string | null;
};
const DATES = [["upcoming", "Upcoming"], ["today", "Today"], ["tomorrow", "Tomorrow"], ["week", "Next 7 days"], ["past", "Past"], ["all", "Any date"], ["pick", "Pick a date…"]] as const;
const STATUS = [["", "Any status"], ["pending", "Pending"], ["approved", "Approved"], ["waitlisted", "Waiting list"], ["attended", "Checked in"], ["declined", "Declined"], ["cancelled", "Cancelled"]] as const;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function SeatRequests({ cities }: { cities: string[] }) {
  const auth = useAuth(); const { byId, today, toast, confirm } = useApp();
  const [rows, setRows] = useState<R[] | null>(null);
  const [event, setEvent] = useState(""); const [host, setHost] = useState(""); const [date, setDate] = useState<(typeof DATES)[number][0]>("upcoming");
  const [day, setDay] = useState(""); const [status, setStatus] = useState(""); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!auth.client) return;
    const { data, error } = await auth.client.rpc("admin_all_requests", { p_from: null, p_to: null });
    if (error) { toast("Couldn't load: " + error.message); setRows([]); return; }
    setRows(data as R[]);
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
  const list = scoped.filter((r) => (!event || r.plan_ref === event) && (!status || r.status === status));
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
        <div className="tbl-wrap"><table className="sr-table">
          <thead><tr><th>Member</th>{!event && <th>Event</th>}<th>Score</th><th>Contact</th><th>Seats</th><th>Status</th><th /></tr></thead>
          <tbody>{list.map((r) => {
            const e = evOf(r);
            return (
              <tr key={r.request_id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <td><div className="who">{r.avatar_url ? <img src={r.avatar_url} alt="" /> : <span className="ph">{(r.display_name || "?")[0]}</span>}<div><b>{r.full_name || r.display_name}</b><br /><small className="muted">{r.occupation}{r.icebreaker ? ` · “${r.icebreaker.slice(0, 40)}”` : ""}</small></div></div></td>
                {!event && <td><button className="linkish" style={{ textAlign: "left" }} onClick={() => setEvent(r.plan_ref)}>{e ? e.title : r.plan_ref}</button><br /><small className="muted">{e ? `${relDay(e.date, today)} · ${e.time}` : r.plan_date} · {cityName(r.city_slug)} · {hostOf(r)}</small></td>}
                <td><span className="score-pill">{r.profile_score}</span><br /><small className="muted">{r.phone_verified ? "WA ✓ " : ""}{r.email_verified ? "Email ✓" : ""}</small></td>
                <td style={{ whiteSpace: "nowrap" }}>{r.phone ? <a href={`https://wa.me/${r.phone.replace("+", "")}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>{r.phone}</a> : <span className="muted">no phone</span>}<br />
                  {r.instagram_url && <a href={r.instagram_url} target="_blank" rel="noopener noreferrer">Instagram </a>}{r.linkedin_url && <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer">LinkedIn</a>}</td>
                <td className="num">{r.party_size}</td>
                <td><span className={`st ${r.status}`}>{r.status === "waitlisted" ? "waiting list" : r.status === "attended" ? "checked in ✓" : r.status}</span></td>
                <td><div className="acts">{r.status !== "attended" && r.status !== "cancelled" && (["approved", "waitlisted", "declined"] as const).filter((s) => s !== r.status).map((s) => (
                  <button key={s} onClick={() => setTo(r, s)}>{{ approved: "Approve", waitlisted: "Waitlist", declined: "Decline" }[s]}</button>
                ))}</div></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
    </motion.section>
  );
}
