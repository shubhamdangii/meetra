"use client";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { CITIES, Empty, Pager, cityName, fmtDT, useAsk, useCall, usePaged, useRpc } from "./shared";

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
        <div className="adm-steps">
          <b>How a sub-admin gets in (no separate password):</b>
          <ol>
            <li>Type their <b>Google email</b> and city below → <i>Request add</i>.</li>
            <li>The other main admin approves it in <b>Approvals</b>.</li>
            <li>The sub-admin opens the website and taps <b>Log in → Continue with Google</b> with that same email.</li>
            <li>Their account menu (tap their photo, top right) now shows <b>City desk</b>. That&apos;s their admin page.</li>
          </ol>
          <p className="muted" style={{ fontSize: 12.5 }}>Already logged in when you approved? It switches on the next time they open the site or come back to the tab. No new password, no app to install.</p>
        </div>
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
const ENT = [["", "All"], ["request", "Approvals"], ["event", "Events"], ["host", "Hosts"], ["seat_request", "Seats"], ["partner", "Brands"], ["team", "Team"], ["review", "Reviews"]] as const;
const ICON: Record<string, string> = { request: "🛂", event: "🚀", host: "🎙️", seat_request: "🎟", partner: "🤝", team: "👥", review: "⭐" };
const TONE: Record<string, string> = { approved: "ok", attended: "ok", active: "ok", created: "new", submitted: "wait", resubmitted: "wait", pending: "wait", waitlisted: "wait",
  rejected: "bad", declined: "bad", cancelled: "bad", deleted: "bad", inactive: "bad", withdrawn: "muted", hidden: "muted", updated: "new" };
const SKIP = new Set(["updated_at", "created_at", "time_label", "end_label", "starts_on", "host_name", "approved_at", "plan_ref", "id", "created_by"]);
const dayKey = (s: string) => new Date(s).toDateString();
const dayLabel = (s: string) => { const d = new Date(s), t = new Date(); const y = new Date(Date.now() - 864e5);
  return d.toDateString() === t.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); };
const val = (k: string, v: unknown) => v == null || v === "" ? "–" : /_at$/.test(k) && typeof v === "string" ? fmtDT(v) : Array.isArray(v) ? (v.length ? v.join(", ") : "–") : typeof v === "object" ? "…" : String(v);

/** What changed, in words: "Seats: 10 → 20". */
function Changes({ d }: { d: Record<string, unknown> }) {
  const pairs: [string, unknown, unknown][] = [];
  const src = (d.old || d.new) ? null : d;   // event/host updates store { field: { old, new } }
  if (src) for (const [k, v] of Object.entries(src)) { if (SKIP.has(k) || !v || typeof v !== "object" || !("new" in (v as object))) continue; pairs.push([k, (v as { old: unknown }).old, (v as { new: unknown }).new]); }
  else if (d.new && typeof d.new === "object") for (const [k, v] of Object.entries(d.new as object)) { if (SKIP.has(k)) continue; pairs.push([k, (d.old as Record<string, unknown> | null)?.[k], v]); }
  const extra = [d.remark && `Remark: “${d.remark}”`, d.member && `Member: ${d.member}`, d.maker && `Requested by ${d.maker}`, d.note && `Note: ${d.note}`].filter(Boolean) as string[];
  if (!pairs.length && !extra.length) return <p className="muted" style={{ fontSize: 13 }}>No extra details.</p>;
  return (
    <div className="act-chg">
      {pairs.slice(0, 12).map(([k, o, n]) => <div key={k}><b>{k.replace(/_/g, " ")}</b><span>{o !== undefined ? <><s>{val(k, o)}</s> → </> : null}{val(k, n)}</span></div>)}
      {extra.map((x) => <p key={x}>{x}</p>)}
    </div>
  );
}

/** Read-only audit log of every admin action, grouped by day. */
export function AdminActivity() {
  const [ent, setEnt] = useState(""); const [q, setQ] = useState(""); const [open, setOpen] = useState<number | null>(null);
  const a = useRpc<Log[]>("admin_activity", { p_entity: ent || null, p_limit: 500 });
  const list = useMemo(() => (a.data ?? []).filter((x) => !q || (x.summary + " " + (x.who ?? "")).toLowerCase().includes(q.toLowerCase())), [a.data, q]);
  const pg = usePaged(list, 10);
  let last = "";
  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <p className="adm-note">Every admin action is recorded here and can&apos;t be edited or deleted. Tap an entry to see what changed.</p>
      <div className="adm-seg">{ENT.map(([k, l]) => <button key={k} className={ent === k ? "on" : ""} onClick={() => setEnt(k)}>{k ? ICON[k] + " " : ""}{l}</button>)}</div>
      <div className="adm-bar"><input className="adm-search" placeholder="Search who or what…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-white btn-sm" onClick={a.reload} aria-label="Refresh">↻</button></div>
      {!a.data ? <div className="skeleton" style={{ minHeight: 160 }} /> : !list.length ? <Empty>Nothing recorded yet.</Empty> : (
        <div className="act-list">{pg.items.map((x) => {
          const head = dayKey(x.at) !== last ? (last = dayKey(x.at), <h4 key={"d" + x.id} className="act-day">{dayLabel(x.at)}</h4>) : null;
          return [head,
            <button key={x.id} type="button" className={`act-item ${open === x.id ? "open" : ""}`} onClick={() => setOpen(open === x.id ? null : x.id)} aria-expanded={open === x.id}>
              <span className="act-ic" aria-hidden="true">{ICON[x.entity] ?? "•"}</span>
              <span className="act-main">
                <span className="act-top"><span className={`act-pill t-${TONE[x.action] ?? "new"}`}>{x.action}</span><small>{new Date(x.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })} · {x.who ?? "system"}</small></span>
                <b>{x.summary}</b>
                {open === x.id && <Changes d={x.details} />}
              </span>
            </button>];
        })}</div>
      )}
      <Pager pg={pg} />
    </motion.section>
  );
}
