"use client";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { CITIES, Empty, cityName, fmtDT, useAsk, useCall, useRpc } from "./shared";

type Member = { user_id: string | null; display_name: string | null; email: string | null; avatar_url: string | null; is_super: boolean; cities: string[] | null; invited?: boolean };

/** Team: the 2 main admins (fixed) + sub-admins (city helpers), added/removed through approval. */
export function AdminTeamDesk({ goApprovals }: { goApprovals: (req?: string) => void }) {
  const t = useRpc<Member[]>("admin_team");
  const m = useRpc<{ email: string; joined: boolean }[]>("admin_main_emails");
  const call = useCall(); const { ask, ui } = useAsk();
  const [email, setEmail] = useState(""); const [city, setCity] = useState(CITIES[0]); const [err, setErr] = useState<string | null>(null);
  const subs = (t.data ?? []).filter((x) => !x.is_super);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim())) return setErr("Enter their login email.");
    setErr(null);
    const note = await ask("Add sub-admin", "Why? (for the other admin)", { ok: "Send for approval" }); if (note === null) return;
    const no = await call<string>("admin_submit_request", { p_entity: "team", p_action: "add_sub_admin", p_target: null, p_payload: { email: email.trim().toLowerCase(), city }, p_note: note });
    if (no) { setEmail(""); goApprovals(no); }
  }
  async function remove(x: Member, c: string) {
    const note = await ask(`Remove ${x.display_name} from ${cityName(c)}?`, "Reason", { required: true, ok: "Request removal" }); if (!note) return;
    const no = await call<string>("admin_submit_request", { p_entity: "team", p_action: "remove_sub_admin", p_target: null, p_payload: { user_id: x.user_id, city: c, name: x.display_name, email: x.email }, p_note: note });
    if (no) goApprovals(no);
  }

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <h3 className="adm-h">Main admins</h3>
      <p className="adm-note">Both have full access to every city. Each one's important changes need the other one's approval.</p>
      <div className="adm-list">{(m.data ?? []).map((x) => (
        <div key={x.email} className="adm-card"><div className="adm-card-top"><span className="adm-av ph">{x.email[0].toUpperCase()}</span>
          <div className="grow"><b>{x.email}</b><small>{x.joined ? "Logged in at least once ✓" : "Hasn't logged in yet: ask them to log in with Google using this email"}</small></div>
          <span className="adm-chip c-active">Main admin</span></div></div>
      ))}</div>

      <h3 className="adm-h" style={{ marginTop: 26 }}>Sub-admins</h3>
      <details className="adm-doc" open={!subs.length}>
        <summary>📘 What can a sub-admin do?</summary>
        <div className="adm-doc-grid">
          <div><b>✅ Can (only in their city)</b><ul>
            <li>See seat requests and approve, waitlist or decline them</li>
            <li>Use Auto-fill seats by priority</li>
            <li>Scan door passes and tick guests in at the Door</li>
            <li>See the Interest numbers (♥ / ✕) for their city&apos;s plans</li>
            <li>Review host applications for their city</li></ul></div>
          <div><b>🚫 Can&apos;t</b><ul>
            <li>Create, change, cancel or remove events</li>
            <li>Add, edit, deactivate or remove hosts</li>
            <li>Approve anything in the Approval Center</li>
            <li>See other cities, the Dashboard, Team or Activity log</li>
            <li>Add or remove other admins</li></ul></div>
        </div>
        <p className="muted" style={{ fontSize: 13 }}><b>How to add one:</b> type their email and city → <i>Request add</i> → the other main admin approves it in Approvals.
          If they&apos;ve never logged in, they become a sub-admin automatically the first time they log in with that email. They then open <b>Admin</b> from the menu.</p>
      </details>
      <form className="adm-bar" onSubmit={add}>
        <input className="adm-search" type="email" placeholder="Their login email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="select" value={city} onChange={(e) => setCity(e.target.value)}>{CITIES.map((c) => <option key={c} value={c}>{cityName(c)}</option>)}</select>
        <button className="btn btn-sun btn-sm" type="submit">Request add</button>
      </form>
      {err && <p className="form-msg err">{err}</p>}
      {!t.data ? <div className="skeleton" style={{ minHeight: 80 }} /> : !subs.length ? <Empty>No sub-admins right now.</Empty> : (
        <div className="adm-list">{subs.map((x) => (
          <div key={x.user_id ?? x.email ?? ""} className="adm-card"><div className="adm-card-top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {x.avatar_url ? <img className="adm-av" src={x.avatar_url} alt="" /> : <span className="adm-av ph">{(x.display_name ?? "?")[0]}</span>}
            <div className="grow"><b>{x.invited ? x.email : x.display_name}</b><small>{x.invited ? "Invited · becomes sub-admin on first login" : x.email}</small></div>
            {x.invited && <span className="adm-chip c-pending">Invited</span>}</div>
            <div className="acts">{(x.cities ?? []).map((c) => <button key={c} onClick={() => remove(x, c)}>{cityName(c)} ✕</button>)}</div></div>
        ))}</div>
      )}
      {ui}
    </motion.section>
  );
}

type Log = { id: number; at: string; who: string | null; action: string; entity: string; entity_id: string | null; summary: string; details: Record<string, unknown> };
const ENT = [["", "Everything"], ["request", "Approvals"], ["event", "Events"], ["host", "Hosts"], ["seat_request", "Seat decisions"], ["team", "Team"], ["review", "Reviews"]] as const;

/** Read-only audit log of every admin action. */
export function AdminActivity() {
  const [ent, setEnt] = useState(""); const [q, setQ] = useState(""); const [open, setOpen] = useState<number | null>(null);
  const a = useRpc<Log[]>("admin_activity", { p_entity: ent || null, p_limit: 400 });
  const list = useMemo(() => (a.data ?? []).filter((x) => !q || (x.summary + " " + (x.who ?? "")).toLowerCase().includes(q.toLowerCase())), [a.data, q]);
  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <p className="adm-note">Every admin action is recorded here and can&apos;t be edited or deleted.</p>
      <div className="adm-bar"><input className="adm-search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" value={ent} onChange={(e) => setEnt(e.target.value)}>{ENT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button className="btn btn-white btn-sm" onClick={a.reload}>↻</button></div>
      {!a.data ? <div className="skeleton" style={{ minHeight: 160 }} /> : !list.length ? <Empty>Nothing recorded yet.</Empty> : (
        <ol className="adm-timeline log">{list.map((x) => (
          <li key={x.id}><span className={`dot a-${x.action}`} /><div>
            <button className="linkish" style={{ textAlign: "left", textDecoration: "none" }} onClick={() => setOpen(open === x.id ? null : x.id)}><b>{x.summary}</b></button>
            <small>{fmtDT(x.at)} · {x.who ?? "system"} · {x.entity}</small>
            {open === x.id && <pre className="adm-pre">{JSON.stringify(x.details, null, 1)}</pre>}
          </div></li>
        ))}</ol>
      )}
    </motion.section>
  );
}
