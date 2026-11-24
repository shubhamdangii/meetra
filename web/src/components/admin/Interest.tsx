"use client";
// Interest: how many people swiped ♥ / ✕ on each plan, how many asked for a seat, how full it is.
// Sort + search + 10 per page; on phones each plan is a labelled card.
import { motion } from "framer-motion";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { type MeetEvent, eventUrl, relDay } from "@/lib/events";
import { Empty, Pager, cityName, usePaged, useRpc } from "./shared";

type Sum = { plan_ref: string; interested: number; skipped: number; requests: number; approved_seats: number; waitlisted: number };
type Row = Sum & { e: MeetEvent; rate: number; swipes: number; fill: number };
const SORTS: [string, string][] = [["interested", "Most ♥ interested"], ["requests", "Most seat requests"], ["rate", "Best interest %"], ["fill", "Fullest first"], ["day", "Soonest first"]];

export function AdminInterest({ cities }: { cities: string[] }) {
  const { all, inCity, today } = useApp();
  const s = useRpc<Sum[]>("admin_interest_summary");
  const [sort, setSort] = useState("interested"); const [q, setQ] = useState(""); const [when, setWhen] = useState("upcoming"); const [activeOnly, setActiveOnly] = useState(false);

  const rows = useMemo(() => {
    const by = new Map((s.data ?? []).map((x) => [x.plan_ref, x]));
    return all.filter((e) => inCity(e) && cities.includes(e.city) && (when === "all" || (when === "upcoming" ? e.day >= 0 : e.day < 0))
      && (!q || `${e.title} ${e.area}`.toLowerCase().includes(q.toLowerCase())))
      .map((e): Row => {
        const x = by.get(e.id) ?? { plan_ref: e.id, interested: 0, skipped: 0, requests: 0, approved_seats: 0, waitlisted: 0 };
        const swipes = x.interested + x.skipped;
        return { ...x, e, swipes, rate: swipes ? x.interested / swipes : 0, fill: e.seats ? x.approved_seats / e.seats : 0 };
      })
      .filter((r) => !activeOnly || r.swipes || r.requests)
      .sort((a, b) => sort === "day" ? a.e.date.getTime() - b.e.date.getTime() : (Number(b[sort as keyof Row]) - Number(a[sort as keyof Row])) || a.e.date.getTime() - b.e.date.getTime());
  }, [all, inCity, cities, s.data, sort, q, when, activeOnly]);
  const pg = usePaged(rows, 10);
  const tot = (k: keyof Sum) => rows.reduce((n, r) => n + Number(r[k]), 0);

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="dash-cards" style={{ marginBottom: 12 }}>
        {([["interested", "♥ Interested"], ["skipped", "✕ Skipped"], ["requests", "🎟 Seat requests"], ["waitlisted", "🕒 Waiting list"]] as [keyof Sum, string][]).map(([k, l]) => (
          <div key={k} className="dash-card"><b>{tot(k)}</b><small>{l}</small></div>
        ))}
      </div>
      <div className="sr-filters">
        <label><span>Search</span><input className="select" placeholder="Plan or area…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label><span>Sort by</span><select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label><span>When</span><select className="select" value={when} onChange={(e) => setWhen(e.target.value)}><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="all">All dates</option></select></label>
      </div>
      <label className="check" style={{ margin: "0 0 12px" }}><input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> Only plans with swipes or requests</label>
      {!s.data ? <div className="skeleton" style={{ minHeight: 160 }} /> : !rows.length ? <Empty>No plans match.</Empty> : (
        <div className="tbl-wrap"><table className="adm-tbl">
          <thead><tr><th>Plan</th><th>When</th><th>♥ Interested</th><th>✕ Skipped</th><th>Interest</th><th>Requests</th><th>Seats filled</th><th>Waiting</th></tr></thead>
          <tbody>{pg.items.map((r) => (
            <tr key={r.e.id}>
              <td><Link href={eventUrl(r.e)} className="adm-link">{r.e.emoji} {r.e.title}</Link><br /><small className="muted">{r.e.area}, {cityName(r.e.city)}</small></td>
              <td style={{ whiteSpace: "nowrap" }}>{relDay(r.e.date, today)} · {r.e.time}</td>
              <td className={`num ${r.interested >= 10 ? "hot" : ""}`}>{r.interested}</td>
              <td className="num">{r.skipped}</td>
              <td><span className="in-rate"><b>{r.swipes ? Math.round(r.rate * 100) + "%" : "–"}</b><i><em style={{ width: `${Math.round(r.rate * 100)}%` }} /></i></span></td>
              <td className="num">{r.requests}</td>
              <td><span className="in-rate"><b>{r.approved_seats}/{r.e.seats}</b><i><em style={{ width: `${Math.round(r.fill * 100)}%`, background: "#1BB78A" }} /></i></span></td>
              <td className="num">{r.waitlisted}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <Pager pg={pg} />
    </motion.section>
  );
}
