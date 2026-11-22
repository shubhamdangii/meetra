"use client";
// Admin dashboard: summary cards + simple SVG charts (no chart library). Values are always written as text too.
import { motion } from "framer-motion";
import { useState } from "react";
import { CountUp } from "../fx";
import { Chip, Empty, Stars, cityName, fmtDT, useRpc } from "./shared";

type Dash = {
  events: Record<"active" | "upcoming" | "ongoing" | "completed" | "draft" | "pending" | "cancelled", number>;
  by_city: { city: string; name: string; active: number; completed: number; cancelled: number; requests: number; confirmed: number }[];
  requests: Record<"total" | "pending" | "approved" | "attended" | "waitlisted" | "declined" | "cancelled" | "confirmed_seats", number>;
  approvals: Record<"pending" | "waiting_for_me" | "approved" | "rejected", number>;
  occupancy: { id: number; title: string; city: string; starts_at: string; seats: number; booked: number; status: string }[];
  hosts: { id: number; name: string; city: string; status: string; events: number; completed: number; bookings: number; avg_rating: number | null; reviews: number }[];
  requests_14d: { day: string; n: number }[];
};
// validated categorical order (dataviz validator: PASS, contrast WARN → every mark is labelled with its value)
const C = { violet: "#6C4CF5", teal: "#1BB78A", orange: "#FF7A3D", blue: "#2E8BFF" };

export function AdminDashboard({ go }: { go: (tab: string, req?: string) => void }) {
  const d = useRpc<Dash>("admin_dashboard");
  if (d.error) return <p className="form-msg err">{d.error}</p>;
  if (!d.data) return <div className="skeleton" style={{ minHeight: 300 }} />;
  const x = d.data;
  const cards: [string, number, string, string?][] = [
    ["🟢", x.events.active, "Active events", "events"], ["📅", x.events.upcoming, "Upcoming"], ["✔️", x.events.completed, "Completed"],
    ["🎟️", x.requests.total, "Seat requests"], ["✅", x.requests.confirmed_seats, "Confirmed seats"], ["⏳", x.requests.pending, "Seat requests to review", "requests"],
    ["🛂", x.approvals.waiting_for_me, "Approvals waiting for you", "approvals"], ["✕", x.approvals.rejected, "Rejected changes", "approvals"],
  ];
  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="dash">
      <div className="dash-cards">{cards.map(([ic, n, l, tab], i) => (
        <motion.button key={l} type="button" className={`dash-card ${tab ? "link" : ""}`} disabled={!tab} onClick={() => tab && go(tab)}
          initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: i * 0.05, type: "spring", stiffness: 260, damping: 20 }}>
          <span aria-hidden="true">{ic}</span><b><CountUp to={n} /></b><small>{l}</small></motion.button>
      ))}</div>

      <div className="dash-grid">
        <Panel title="Seat requests, last 14 days"><Bars14 data={x.requests_14d} /></Panel>
        <Panel title="Seat request status"><StatusBars r={x.requests} /></Panel>
        <Panel title="City-wise" wide><CityChart rows={x.by_city} /></Panel>
        <Panel title="Seat occupancy (nearest events)" wide><Occupancy rows={x.occupancy} /></Panel>
        <Panel title="Event pipeline"><Pipeline e={x.events} /></Panel>
        <Panel title="Pending admin approvals">
          <div className="dash-big"><b>{x.approvals.pending}</b><span>pending · {x.approvals.waiting_for_me} need you</span></div>
          <div className="dash-mini"><span>✓ {x.approvals.approved} approved</span><span>✕ {x.approvals.rejected} rejected</span></div>
          <button className="btn btn-ink btn-sm" style={{ marginTop: 10 }} onClick={() => go("approvals")}>Open Approval Center →</button>
        </Panel>
        <Panel title="Host performance (by rating)" wide><HostTable rows={x.hosts} /></Panel>
      </div>
    </motion.section>
  );
}

function Panel({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return <motion.div className={`dash-panel ${wide ? "wide" : ""}`} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}><h4>{title}</h4>{children}</motion.div>;
}

function Bars14({ data }: { data: Dash["requests_14d"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((p) => p.n)); const W = 320, H = 130, bw = W / data.length;
  const total = data.reduce((s, p) => s + p.n, 0);
  return (
    <div className="dash-chart">
      <p className="dash-sub"><b>{total}</b> requests in 14 days{hover != null ? ` · ${new Date(data[hover].day).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}: ${data[hover].n}` : ""}</p>
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`Seat requests per day, last 14 days, ${total} in total`}>
        <line x1="0" x2={W} y1={H} y2={H} className="axis" />
        {data.map((p, i) => {
          const h = (p.n / max) * (H - 16); const x = i * bw + 2;
          return (
            <g key={p.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)}>
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              <motion.rect x={x} width={bw - 4} rx={3} fill={C.violet} opacity={hover == null || hover === i ? 1 : 0.45}
                initial={{ y: H, height: 0 }} animate={{ y: H - h, height: h }} transition={{ delay: i * 0.03, type: "spring", stiffness: 140, damping: 18 }} />
              {p.n > 0 && <text x={x + (bw - 4) / 2} y={H - h - 4} textAnchor="middle" className="val">{p.n}</text>}
              {i % 2 === 0 && <text x={x + (bw - 4) / 2} y={H + 13} textAnchor="middle" className="tick">{new Date(p.day).getDate()}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function StatusBars({ r }: { r: Dash["requests"] }) {
  const rows: [string, number, string][] = [["Pending", r.pending, "#B9B3D6"], ["Confirmed", r.approved, C.teal], ["Checked in", r.attended, C.violet], ["Waiting list", r.waitlisted, "#F2B300"], ["Declined", r.declined, "#D6336C"], ["Cancelled", r.cancelled, "#8A8597"]];
  const max = Math.max(1, ...rows.map((x) => x[1]));
  return (
    <ul className="dash-hbars">{rows.map(([l, n, c], i) => (
      <li key={l}><span>{l}</span><div><motion.i style={{ background: c }} initial={{ width: 0 }} animate={{ width: `${(n / max) * 100}%` }} transition={{ delay: i * 0.05, duration: 0.6 }} /></div><b>{n}</b></li>
    ))}</ul>
  );
}

function CityChart({ rows }: { rows: Dash["by_city"] }) {
  const series: [keyof Dash["by_city"][number], string, string][] = [["active", "Active events", C.violet], ["completed", "Completed", C.teal], ["requests", "Seat requests", C.orange], ["confirmed", "Confirmed seats", C.blue]];
  const max = Math.max(1, ...rows.flatMap((r) => series.map(([k]) => Number(r[k]))));
  return (
    <div>
      <div className="dash-legend">{series.map(([, l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>
      <div className="dash-groups">{rows.map((r) => (
        <div key={r.city} className="dash-group"><b>{r.name}</b>
          {series.map(([k, l, c], i) => <div key={k} className="dash-hbar" title={`${l}: ${r[k]}`}><div><motion.i style={{ background: c }} initial={{ width: 0 }} whileInView={{ width: `${(Number(r[k]) / max) * 100}%` }} viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.6 }} /></div><small>{String(r[k])}</small></div>)}
          {r.cancelled > 0 && <small className="muted">{r.cancelled} cancelled</small>}
        </div>
      ))}</div>
    </div>
  );
}

function Occupancy({ rows }: { rows: Dash["occupancy"] }) {
  if (!rows.length) return <Empty>No live or completed events yet.</Empty>;
  return (
    <ul className="dash-occ">{rows.map((e, i) => {
      const pct = Math.min(100, Math.round((e.booked / Math.max(1, e.seats)) * 100));
      return (
        <li key={e.id}><div className="t"><b>{e.title}</b><small>{cityName(e.city)} · {fmtDT(e.starts_at)}</small></div><Chip s={e.status} />
          <div className="bar"><motion.i className={pct >= 90 ? "full" : ""} initial={{ width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }} transition={{ delay: i * 0.04, duration: 0.7 }} /></div>
          <span className="v"><b>{e.booked}</b>/{e.seats} · {pct}%</span></li>
      );
    })}</ul>
  );
}

function Pipeline({ e }: { e: Dash["events"] }) {
  const steps: [string, number][] = [["Draft", e.draft], ["Pending approval", e.pending], ["Active", e.active], ["Completed", e.completed], ["Cancelled", e.cancelled]];
  return <ol className="dash-pipe">{steps.map(([l, n]) => <li key={l}><b>{n}</b><span>{l}</span></li>)}</ol>;
}

function HostTable({ rows }: { rows: Dash["hosts"] }) {
  if (!rows.length) return <Empty>No hosts yet. Add them in the Hosts tab.</Empty>;
  const sorted = [...rows].sort((a, b) => (Number(b.avg_rating ?? -1) - Number(a.avg_rating ?? -1)) || b.bookings - a.bookings);
  return (
    <div className="tbl-wrap"><table><thead><tr><th>Host</th><th>Rating</th><th>Events</th><th>Completed</th><th>Bookings</th></tr></thead>
      <tbody>{sorted.map((h) => <tr key={h.id}><td><b>{h.name}</b><br /><small className="muted">{cityName(h.city)}{h.status !== "active" ? " · inactive" : ""}</small></td>
        <td><Stars v={h.avg_rating} n={h.reviews} /></td><td className="num">{h.events}</td><td className="num">{h.completed}</td><td className="num">{h.bookings}</td></tr>)}</tbody></table></div>
  );
}
