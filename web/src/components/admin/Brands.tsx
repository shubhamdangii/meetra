"use client";
// Brands & venues enquiries: a small pipeline (New → Talking → Deal done / Not now) with notes and an owner.
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Empty, Modal, cityName, fmtDT, useCall, useRpc } from "./shared";

type Lead = { id: number; name: string; company: string; kind: string; city_slug: string | null; phone: string | null; email: string | null; link: string | null;
  message: string; status: string; admin_note: string | null; owner_name: string | null; created_at: string; updated_at: string };
const ST: [string, string][] = [["new", "🆕 New"], ["talking", "💬 Talking"], ["won", "🤝 Deal done"], ["not_now", "⏸ Not now"]];
const KIND: Record<string, string> = { venue: "🏠 Venue", brand: "✨ Brand", team: "🏢 Team", other: "💬 Other" };

export function AdminBrands() {
  const l = useRpc<Lead[]>("admin_partner_leads");
  const call = useCall();
  const [st, setSt] = useState("open"); const [kind, setKind] = useState(""); const [q, setQ] = useState("");
  const [open, setOpen] = useState<Lead | null>(null); const [note, setNote] = useState("");
  const list = useMemo(() => (l.data ?? []).filter((x) => (st === "open" ? ["new", "talking"].includes(x.status) : st === "all" || x.status === st)
    && (!kind || x.kind === kind) && (!q || `${x.company} ${x.name} ${x.message}`.toLowerCase().includes(q.toLowerCase()))), [l.data, st, kind, q]);
  const n = (s: string) => (l.data ?? []).filter((x) => x.status === s).length;

  async function save(x: Lead, status: string | null, take = false) {
    if (await call("admin_update_partner_lead", { p_id: x.id, p_status: status, p_note: note.trim() || null, p_take: take }, "Saved ✓")) { l.reload(); setOpen(null); }
  }

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="dash-cards" style={{ marginBottom: 12 }}>
        {ST.map(([k, lbl]) => <button key={k} type="button" className="dash-card link" onClick={() => setSt(k)}><b>{n(k)}</b><small>{lbl}</small></button>)}
      </div>
      <div className="adm-bar">
        <input className="adm-search" placeholder="Search company, name, message…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" value={st} onChange={(e) => setSt(e.target.value)}><option value="open">Open (new + talking)</option><option value="all">All</option>{ST.map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}</select>
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Any type</option>{Object.entries(KIND).map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}</select>
        <button className="btn btn-white btn-sm" onClick={l.reload}>↻</button>
      </div>
      {l.error && <p className="form-msg err">{l.error}</p>}
      {!l.data ? <div className="skeleton" style={{ minHeight: 140 }} /> : !list.length ? <Empty>No enquiries here. They arrive from the <b>For brands &amp; venues</b> page.</Empty> : (
        <div className="tbl-wrap"><table className="adm-tbl">
          <thead><tr><th>Company</th><th>Type</th><th>Contact</th><th>Status</th><th>Owner</th><th>Received</th><th /></tr></thead>
          <tbody>{list.map((x) => (
            <tr key={x.id}>
              <td><button className="adm-link" onClick={() => { setOpen(x); setNote(x.admin_note ?? ""); }}>{x.company}</button><br /><small className="muted">{x.name}{x.city_slug ? ` · ${cityName(x.city_slug)}` : ""}</small></td>
              <td style={{ whiteSpace: "nowrap" }}>{KIND[x.kind] ?? x.kind}</td>
              <td style={{ whiteSpace: "nowrap" }}>{x.phone && <a href={`https://wa.me/${x.phone.replace("+", "")}`} target="_blank" rel="noopener noreferrer">{x.phone}</a>}{x.phone && x.email && <br />}{x.email && <a href={`mailto:${x.email}`}>{x.email}</a>}</td>
              <td><span className={`adm-chip c-${x.status === "won" ? "approved" : x.status === "talking" ? "pending" : x.status === "not_now" ? "inactive" : "draft"}`}>{ST.find(([k]) => k === x.status)?.[1]}</span></td>
              <td>{x.owner_name ?? "–"}</td>
              <td style={{ whiteSpace: "nowrap" }}>{fmtDT(x.created_at)}</td>
              <td><button className="adm-cta" onClick={() => { setOpen(x); setNote(x.admin_note ?? ""); }}>Open →</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.company} · ${KIND[open.kind] ?? open.kind}` : ""}>
        {open && <div style={{ display: "grid", gap: 10 }}>
          <p><b>{open.name}</b>{open.city_slug ? ` · ${cityName(open.city_slug)}` : ""} · received {fmtDT(open.created_at)}</p>
          <p className="acts">{open.phone && <a href={`https://wa.me/${open.phone.replace("+", "")}`} target="_blank" rel="noopener noreferrer">💬 WhatsApp {open.phone}</a>}
            {open.email && <a href={`mailto:${open.email}`}>✉️ {open.email}</a>}{open.link && <span className="muted">🔗 {open.link}</span>}</p>
          {open.message && <p className="adm-quote">“{open.message}”</p>}
          <div className="field"><label htmlFor="ln">Team note (only admins see this)</label><textarea id="ln" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Called on Tue, visiting the space Sat 4 pm…" /></div>
          <p className="muted" style={{ fontSize: 13 }}>Owner: {open.owner_name ?? "nobody yet"} · last update {fmtDT(open.updated_at)}</p>
          <div className="acts">
            {ST.map(([k, lbl]) => <button key={k} className={open.status === k ? "ok" : ""} onClick={() => save(open, k)}>{lbl}</button>)}
            <button onClick={() => save(open, null, true)}>🙋 I&apos;ll handle it</button>
            <button onClick={() => save(open, null)}>Save note</button>
          </div>
        </div>}
      </Modal>
    </motion.section>
  );
}
