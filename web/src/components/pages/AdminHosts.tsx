"use client";
// Admin tab: the host waiting list. The database only answers for admins.
import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { CONFIG } from "@/lib/config";

type H = { id: number; created_at: string; city_slug: string; plan_title: string; category: string; pitch: string | null; experience: string | null;
  frequency: string | null; group_size: number | null; availability: string | null; status: string; team_note: string | null;
  display_name: string; full_name: string | null; avatar_url: string | null; phone: string | null; instagram_url: string | null; linkedin_url: string | null; profile_score: number };

const NEXT: Record<string, [string, string][]> = {
  applied: [["shortlisted", "Shortlist"], ["waitlisted", "Waitlist"], ["rejected", "Reject"]],
  shortlisted: [["call_scheduled", "Call booked"], ["waitlisted", "Waitlist"], ["rejected", "Reject"]],
  call_scheduled: [["trial", "Trial plan"], ["waitlisted", "Waitlist"], ["rejected", "Reject"]],
  trial: [["approved", "Approve 🎉"], ["rejected", "Reject"]],
  waitlisted: [["shortlisted", "Shortlist"], ["rejected", "Reject"]],
  approved: [], rejected: [["applied", "Reopen"]], withdrawn: [],
};
const LABEL: Record<string, string> = { applied: "applied", shortlisted: "shortlisted", call_scheduled: "call booked", trial: "trial", approved: "live host", waitlisted: "waiting list", rejected: "rejected", withdrawn: "withdrawn" };

export function AdminHosts() {
  const auth = useAuth();
  const { city, toast } = useApp();
  const [rows, setRows] = useState<H[] | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    if (!auth.client) return;
    const { data, error } = await auth.client.rpc("admin_host_applications");
    if (error) return toast("Couldn't load: " + error.message);
    setRows(data as H[]);
  }, [auth.client, toast]);
  useEffect(() => { load(); }, [load]);

  const update = async (id: number, patch: Partial<H>) => {
    const { error } = await auth.client!.from("host_applications").update(patch).eq("id", id);
    if (error) return toast("Couldn't update: " + error.message);
    toast("Updated ✓"); load();
  };

  const list = (rows ?? []).filter((r) => (city === "all" || r.city_slug === city) && (showClosed || !["rejected", "withdrawn", "approved"].includes(r.status)));
  const count = (s: string) => (rows ?? []).filter((r) => (city === "all" || r.city_slug === city) && r.status === s).length;

  return (
    <motion.section key="h" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="kpis">
        {([["applied", "new"], ["shortlisted", "shortlisted"], ["call_scheduled", "calls booked"], ["trial", "on trial"], ["approved", "live hosts"]] as const).map(([s, l], i) => (
          <motion.div key={s} className="kpi" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}><b>{count(s)}</b><span>{l}</span></motion.div>
        ))}
      </div>
      <div className="toolbar2">
        <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show live, rejected &amp; withdrawn</label>
        <button className="btn btn-white btn-sm" onClick={load}>Refresh</button>
      </div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Best profile score first, then who applied earlier. The note is shown to the applicant on their host page — use it for call times or next steps.</p>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Applicant</th><th>Score</th><th>Contact</th><th>Plan</th><th>Details</th><th>Status</th><th>Note to applicant</th><th /></tr></thead>
        <tbody>
          {!list.length && <tr><td colSpan={8} className="muted">{rows ? "No host applications here yet." : "Loading…"}</td></tr>}
          {list.map((r, i) => (
            <motion.tr key={r.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <td><div className="who">{r.avatar_url ? <img src={r.avatar_url} alt="" /> : <span className="ph">{(r.display_name || "?")[0]}</span>}<div><b>{r.full_name || r.display_name}</b><br /><small className="muted">{CONFIG.cities[r.city_slug]?.name ?? r.city_slug} · {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small></div></div></td>
              <td><span className="score-pill">{r.profile_score}</span></td>
              <td style={{ whiteSpace: "nowrap" }}>{r.phone ? <a href={`https://wa.me/${r.phone.replace("+", "")}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>{r.phone}</a> : <span className="muted">no phone</span>}<br />
                {r.instagram_url && <a href={r.instagram_url} target="_blank" rel="noopener noreferrer">Instagram </a>}{r.linkedin_url && <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer">LinkedIn</a>}</td>
              <td style={{ maxWidth: 260 }}><b>{r.plan_title}</b><br /><small className="muted">{r.category} · {r.frequency ?? "?"} · {r.group_size ?? "?"} people</small>{r.pitch && <p style={{ fontSize: 13, marginTop: 4 }}>{r.pitch}</p>}</td>
              <td style={{ maxWidth: 200, fontSize: 13 }}>{r.experience && <p><b>Before:</b> {r.experience}</p>}{r.availability && <p><b>Free:</b> {r.availability}</p>}</td>
              <td><span className={`st ${r.status === "approved" ? "approved" : r.status === "rejected" || r.status === "withdrawn" ? "declined" : r.status === "waitlisted" ? "waitlisted" : "pending"}`}>{LABEL[r.status]}</span></td>
              <td style={{ minWidth: 180 }}>
                <textarea className="note-in" rows={2} maxLength={1000} aria-label={`Note for ${r.display_name}`} value={notes[r.id] ?? r.team_note ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} placeholder="e.g. Call Sat 4 pm" />
                {notes[r.id] !== undefined && notes[r.id] !== (r.team_note ?? "") && <button className="linkish" onClick={() => { update(r.id, { team_note: notes[r.id].trim() || null }); setNotes((n) => { const c = { ...n }; delete c[r.id]; return c; }); }}>Save note</button>}
              </td>
              <td><div className="acts">{(NEXT[r.status] ?? []).map(([s, l]) => <button key={s} onClick={() => update(r.id, { status: s })}>{l}</button>)}</div></td>
            </motion.tr>
          ))}
        </tbody>
      </table></div>
    </motion.section>
  );
}
