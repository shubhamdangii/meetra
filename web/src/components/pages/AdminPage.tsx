"use client";
// Team-only page. The database refuses these calls for anyone who isn't an admin,
// so hiding the page is only a convenience, not the protection.
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { AdminHosts } from "./AdminHosts";
import { AdminCheckIn, AdminPlans, AdminTeam } from "./AdminTeam";
import { CONFIG } from "@/lib/config";
import { type MeetEvent, eventUrl, relDay } from "@/lib/events";

type Sum = { plan_ref: string; interested: number; skipped: number; requests: number; approved_seats: number; waitlisted: number };
type Row = Sum & { e: MeetEvent; title: string; day: number; swipes: number; rate: number };
type Q = { request_id: number; display_name: string; full_name: string | null; avatar_url: string | null; phone: string | null; instagram_url: string | null; linkedin_url: string | null;
  occupation: string | null; profile_score: number; phone_verified: boolean; email_verified: boolean; status: string; party_size: number; icebreaker: string | null; priority: number };

const ZERO = { interested: 0, skipped: 0, requests: 0, approved_seats: 0, waitlisted: 0 };

export default function AdminPage() {
  const auth = useAuth();
  const { all, inCity, byId, today, toast, ready } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState<"interest" | "requests" | "door" | "plans" | "hosts" | "team">("interest");
  const [sum, setSum] = useState<Sum[] | null>(null);
  const [upcomingOnly, setUpcomingOnly] = useState(true);
  const [sortKey, setSortKey] = useState<keyof Row>("interested");
  const [dir, setDir] = useState(-1);
  const [plan, setPlan] = useState("");
  const [queue, setQueue] = useState<Q[] | null>(null);
  const [filling, setFilling] = useState(false);
  const team = auth.team;
  const isAdmin = !!team;
  const mine = useCallback((e: MeetEvent) => !!team && team.cities.includes(e.city), [team]);

  useEffect(() => { if (auth.enabled && auth.ready && !auth.session) { auth.rememberNext("/admin/"); router.replace("/login/"); } }, [auth, router]);

  const loadSum = useCallback(async () => {
    if (!auth.client) return;
    const { data, error } = await auth.client.rpc("admin_interest_summary");
    if (error) return toast("Couldn't load: " + error.message);
    setSum(data as Sum[]);
  }, [auth.client, toast]);
  useEffect(() => { if (isAdmin) loadSum(); }, [isAdmin, loadSum]);

  const rows: Row[] = useMemo(() => {
    const by = new Map((sum ?? []).map((s) => [s.plan_ref, s]));
    return all.filter((e) => inCity(e) && mine(e) && (!upcomingOnly || e.day >= 0)).map((e) => {
      const s = by.get(e.id) ?? { plan_ref: e.id, ...ZERO };
      const swipes = s.interested + s.skipped;
      return { ...s, e, title: e.title, day: e.day, swipes, rate: swipes ? s.interested / swipes : 0 };
    }).sort((a, b) => dir * ((a[sortKey] as number) > (b[sortKey] as number) ? 1 : (a[sortKey] as number) < (b[sortKey] as number) ? -1 : 0) || a.day - b.day);
  }, [all, inCity, mine, sum, upcomingOnly, sortKey, dir]);

  const withReq = rows.filter((r) => r.day >= 0 && (r.requests || r.waitlisted)).sort((a, b) => a.day - b.day);
  useEffect(() => { if (!plan && withReq[0]) setPlan(withReq[0].e.id); }, [withReq, plan]);

  const loadQueue = useCallback(async () => {
    if (!auth.client || !plan) return setQueue(null);
    const { data, error } = await auth.client.rpc("admin_plan_queue", { p_plan_ref: plan });
    if (error) return toast("Couldn't load: " + error.message);
    setQueue(data as Q[]);
  }, [auth.client, plan, toast]);
  useEffect(() => { if (isAdmin && tab === "requests") loadQueue(); }, [isAdmin, tab, loadQueue]);

  const setStatus = async (id: number, status: string) => {
    const { error } = await auth.client!.from("plan_requests").update({ status }).eq("id", id);
    if (error) return toast("Couldn't update: " + error.message);
    toast("Updated ✓"); loadQueue(); loadSum();
  };
  const fill = async () => {
    const e = byId(plan); if (!e || !auth.client) return;
    setFilling(true);
    const { data, error } = await auth.client.rpc("admin_fill_plan", { p_plan_ref: plan, p_capacity: e.seats });
    setFilling(false);
    if (error) return toast("Couldn't fill: " + error.message);
    const r = (data as any[])[0];
    toast(`Approved ${r.approved} · waiting list ${r.waitlisted} · ${r.seats_left} seats left`);
    loadQueue(); loadSum();
  };

  const head = (
    <section className="page-hero" style={{ paddingBottom: 0 }}>
      <span className="eyebrow">Team only</span>
      <h1 style={{ fontSize: "clamp(40px,6vw,64px)" }}>{team && !team.is_super ? "City" : "Admin"} <span className="serif">desk.</span></h1>
      {team && <p className="muted" style={{ marginTop: 6 }}>{team.is_super ? "Main admin · every city, plus the team" : `City admin · ${team.cities.map((c) => CONFIG.cities[c]?.name ?? c).join(", ")}`}</p>}
    </section>
  );
  if (!auth.enabled) return <div className="wrap">{head}<div className="setup-note">Login isn&apos;t switched on, so there&apos;s nothing to show.</div></div>;
  if (!auth.ready || (auth.session && !auth.me) || !ready) return <div className="wrap">{head}<div className="skeleton" style={{ marginTop: 20 }} /></div>;
  if (!isAdmin) return <div className="wrap">{head}<div className="setup-note" style={{ marginTop: 20 }}>This page is for the {CONFIG.brand} team only.</div></div>;

  const tot = (k: keyof Sum) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const cols: [keyof Row, string][] = [["title", "Plan"], ["day", "Date"], ["interested", "♥"], ["skipped", "✕"], ["rate", "Interest %"], ["requests", "Requests"], ["approved_seats", "Seats filled"], ["waitlisted", "Waiting"]];
  const selected = byId(plan);

  return (
    <div className="wrap" style={{ paddingBottom: 60 }}>
      {head}
      <div className="tabs" style={{ display: "flex", gap: 8, margin: "18px 0 20px", flexWrap: "wrap" }}>
        <button className={`pill ${tab === "interest" ? "on" : ""}`} onClick={() => setTab("interest")}>♥ Interest</button>
        <button className={`pill ${tab === "requests" ? "on" : ""}`} onClick={() => setTab("requests")}>🎟 Requests &amp; waiting list</button>
        <button className={`pill ${tab === "door" ? "on" : ""}`} onClick={() => setTab("door")}>📷 Door check-in</button>
        <button className={`pill ${tab === "plans" ? "on" : ""}`} onClick={() => setTab("plans")}>🚀 Launch plans</button>
        <button className={`pill ${tab === "hosts" ? "on" : ""}`} onClick={() => setTab("hosts")}>🎙️ Host applications</button>
        {team?.is_super && <button className={`pill ${tab === "team" ? "on" : ""}`} onClick={() => setTab("team")}>👥 Team</button>}
      </div>

      {tab === "hosts" ? <AdminHosts /> : tab === "team" && team?.is_super ? <AdminTeam /> : tab === "plans" ? <AdminPlans cities={team!.cities} />
        : tab === "door" ? <AdminCheckIn plans={all.filter((e) => mine(e) && e.day >= -1 && e.day <= 1)} /> : tab === "interest" ? (
        <motion.section key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="kpis">
            {([["interested", "♥ interested"], ["skipped", "✕ skipped"], ["requests", "seat requests"], ["waitlisted", "on waiting lists"]] as [keyof Sum, string][]).map(([k, l], i) => (
              <motion.div key={k} className="kpi" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}><b>{tot(k)}</b><span>{l}</span></motion.div>
            ))}
          </div>
          <div className="toolbar2">
            <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={upcomingOnly} onChange={(e) => setUpcomingOnly(e.target.checked)} /> Upcoming only</label>
            <span className="muted" style={{ fontSize: 13 }}>City follows the picker at the top. Click a column to sort.</span>
          </div>
          <div className="tbl-wrap"><table>
            <thead><tr>{cols.map(([k, l]) => <th key={k} onClick={() => { setDir(sortKey === k ? -dir : -1); setSortKey(k); }}>{l}{sortKey === k ? (dir < 0 ? " ↓" : " ↑") : ""}</th>)}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.e.id}>
                <td><Link href={eventUrl(r.e)} style={{ fontWeight: 700 }}>{r.e.emoji} {r.e.title}</Link><br /><small className="muted">{r.e.area}, {CONFIG.cities[r.e.city].name}</small></td>
                <td style={{ whiteSpace: "nowrap" }}>{relDay(r.e.date, today)}<br /><small className="muted">{r.e.time}</small></td>
                <td className={`num ${r.interested >= 10 ? "hot" : ""}`}>{r.interested}</td>
                <td className="num">{r.skipped}</td>
                <td>{r.swipes ? Math.round(r.rate * 100) + "%" : "–"}<div className="bar-mini"><motion.i initial={{ width: 0 }} animate={{ width: `${Math.round(r.rate * 100)}%` }} /></div></td>
                <td className="num">{r.requests}</td>
                <td className="num">{r.approved_seats}/{r.e.seats}</td>
                <td className="num">{r.waitlisted}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </motion.section>
      ) : (
        <motion.section key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="toolbar2">
            <select className="select" value={plan} aria-label="Choose a plan" onChange={(e) => setPlan(e.target.value)} style={{ maxWidth: "100%" }}>
              {withReq.length ? withReq.map((r) => <option key={r.e.id} value={r.e.id}>{relDay(r.e.date, today)} · {r.e.title} ({r.requests} requests)</option>) : <option value="">No requests yet</option>}
            </select>
            <motion.button whileTap={{ scale: 0.95 }} className="btn btn-sun btn-sm" disabled={!selected || filling} onClick={fill}>Auto-fill {selected?.seats ?? ""} seats by priority</motion.button>
            <button className="btn btn-white btn-sm" onClick={() => { loadSum(); loadQueue(); }}>Refresh</button>
          </div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Highest profile score first, then who asked earlier. Auto-fill keeps everyone already approved, approves the next best people until seats run out, and puts the rest on the waiting list in order.</p>
          <div className="tbl-wrap"><table>
            <thead><tr><th>#</th><th>Member</th><th>Score</th><th>Contact</th><th>Seats</th><th>Ask me about</th><th>Status</th><th /></tr></thead>
            <tbody>
              {!queue?.length && <tr><td colSpan={8} className="muted">When members request seats, they show up here.</td></tr>}
              {queue?.map((r, i) => (
                <motion.tr key={r.request_id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <td className="num">{r.priority}</td>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <td><div className="who">{r.avatar_url ? <img src={r.avatar_url} alt="" /> : <span className="ph">{(r.display_name || "?")[0]}</span>}<div><b>{r.full_name || r.display_name}</b><br /><small className="muted">{r.occupation}</small></div></div></td>
                  <td><span className="score-pill">{r.profile_score}</span><br /><small className="muted">{r.phone_verified ? "WA ✓ " : ""}{r.email_verified ? "Email ✓" : ""}</small></td>
                  <td style={{ whiteSpace: "nowrap" }}>{r.phone ? <a href={`https://wa.me/${r.phone.replace("+", "")}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>{r.phone}</a> : <span className="muted">no phone</span>}<br />
                    {r.instagram_url && <a href={r.instagram_url} target="_blank" rel="noopener noreferrer">Instagram </a>}{r.linkedin_url && <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer">LinkedIn</a>}</td>
                  <td className="num">{r.party_size}</td>
                  <td style={{ maxWidth: 220 }}>{r.icebreaker}</td>
                  <td><span className={`st ${r.status}`}>{r.status === "waitlisted" ? "waiting list" : r.status === "attended" ? "checked in ✓" : r.status}</span></td>
                  <td><div className="acts">{(["approved", "waitlisted", "declined"] as const).filter((s) => s !== r.status && r.status !== "attended").map((s) => (
                    <button key={s} onClick={() => setStatus(r.request_id, s)}>{{ approved: "Approve", waitlisted: "Waitlist", declined: "Decline" }[s]}</button>
                  ))}</div></td>
                </motion.tr>
              ))}
            </tbody>
          </table></div>
        </motion.section>
      )}
    </div>
  );
}
