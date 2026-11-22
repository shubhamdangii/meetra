"use client";
// Events: drafts are edited freely; everything that touches the live site goes to the other admin for approval.
import { motion } from "framer-motion";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { CATS, CITIES, Chip, Empty, Modal, cityName, fmtDT, fromLocalInput, nowLocalInput, toLocalInput, useAsk, useCall, useRpc } from "./shared";

export type AdminEvent = {
  id: number; plan_ref: string; title: string; city_slug: string; category: string; host_id: number | null; host_name: string | null;
  starts_at: string; ends_at: string; booking_closes_at: string; area: string; price: number; price_type: string; seats: number;
  emoji: string; blurb: string; steps: string[]; tags: string[]; status: string; display_status: string;
  confirmed: number; pending: number; waitlisted: number; pending_req: string | null; cancel_reason: string | null; created_by_name: string | null; updated_at: string;
};
export type AdminHost = { id: number; name: string; city_slug: string; status: string };

export type EventFormValue = {
  title: string; city_slug: string; category: string; host_id: string; starts: string; ends: string; closes: string; area: string;
  price: string; price_type: string; seats: string; emoji: string; blurb: string; steps: string; tags: string;
};
export const blankEvent = (city = "jaipur"): EventFormValue => ({ title: "", city_slug: city, category: "food", host_id: "", starts: "", ends: "", closes: "", area: "",
  price: "99", price_type: "reservation", seats: "12", emoji: "✨", blurb: "", steps: "", tags: "" });
export const eventToForm = (e: Partial<AdminEvent> & Record<string, unknown>): EventFormValue => ({
  title: String(e.title ?? ""), city_slug: String(e.city_slug ?? "jaipur"), category: String(e.category ?? "food"), host_id: e.host_id != null ? String(e.host_id) : "",
  starts: toLocalInput(e.starts_at as string), ends: toLocalInput(e.ends_at as string), closes: toLocalInput(e.booking_closes_at as string), area: String(e.area ?? ""),
  price: String(e.price ?? 0), price_type: String(e.price_type ?? "reservation"), seats: String(e.seats ?? 12), emoji: String(e.emoji ?? "✨"),
  blurb: String(e.blurb ?? ""), steps: ((e.steps as string[]) ?? []).join("\n"), tags: ((e.tags as string[]) ?? []).join(", "),
});
export const formToPayload = (f: EventFormValue) => ({
  title: f.title.trim(), city_slug: f.city_slug, category: f.category, host_id: f.host_id ? Number(f.host_id) : null,
  starts_at: fromLocalInput(f.starts), ends_at: fromLocalInput(f.ends), booking_closes_at: f.closes ? fromLocalInput(f.closes) : null,
  area: f.area.trim(), price: Number(f.price) || 0, price_type: f.price_type, seats: Number(f.seats) || 12, emoji: f.emoji.trim() || "✨",
  blurb: f.blurb.trim(), steps: f.steps.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6),
  tags: f.tags.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4),
});

/** Same date rules as the database, so mistakes show up before saving. */
export function validateEvent(f: EventFormValue, opts: { allowPastStart?: boolean } = {}): string | null {
  if (f.title.trim().length < 3) return "Title needs at least 3 characters.";
  if (f.area.trim().length < 2) return "Add the area (for example: C-Scheme).";
  if (!f.starts || !f.ends) return "Pick the start and end date & time.";
  const s = new Date(f.starts).getTime(), e = new Date(f.ends).getTime(), c = f.closes ? new Date(f.closes).getTime() : s - 2 * 3600e3;
  if (!opts.allowPastStart && s <= Date.now()) return "The start can't be in the past.";
  if (e <= s) return "The end must be after the start.";
  if (e - s > 7 * 864e5) return "An event can last at most 7 days.";
  if (c >= s) return "Booking deadline must be before the event starts.";
  if (!opts.allowPastStart && c <= Date.now()) return "The booking deadline is already past.";
  const seats = Number(f.seats); if (!(seats >= 2 && seats <= 500)) return "Seats must be 2 to 500.";
  const price = Number(f.price); if (!(price >= 0 && price <= 100000)) return "Price must be 0 to 1,00,000.";
  return null;
}

export function EventForm({ value, onChange, hosts, lockCity }: { value: EventFormValue; onChange: (f: EventFormValue) => void; hosts: AdminHost[]; lockCity?: boolean }) {
  const set = (k: keyof EventFormValue, v: string) => onChange({ ...value, [k]: v, ...(k === "city_slug" ? { host_id: "" } : {}) });
  const cityHosts = hosts.filter((h) => h.city_slug === value.city_slug && h.status === "active");
  const min = nowLocalInput();
  return (
    <div className="adm-form">
      <div className="field span2"><label>Title *</label><input value={value.title} maxLength={100} onChange={(e) => set("title", e.target.value)} placeholder="Sunday Board Games Brunch" /></div>
      <div className="field"><label>City *</label><select value={value.city_slug} disabled={lockCity} onChange={(e) => set("city_slug", e.target.value)}>{CITIES.map((c) => <option key={c} value={c}>{cityName(c)}</option>)}</select></div>
      <div className="field"><label>Category *</label><select value={value.category} onChange={(e) => set("category", e.target.value)}>{CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
      <div className="field"><label>Host</label><select value={value.host_id} onChange={(e) => set("host_id", e.target.value)}>
        <option value="">the meetra team</option>{cityHosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
        {!cityHosts.length && <small className="muted">No active hosts in {cityName(value.city_slug)} yet. Add one in the Hosts tab.</small>}</div>
      <div className="field"><label>Area *</label><input value={value.area} maxLength={60} onChange={(e) => set("area", e.target.value)} placeholder="C-Scheme" /></div>
      <div className="field"><label>Starts *</label><input type="datetime-local" min={min} value={value.starts} onChange={(e) => set("starts", e.target.value)} /></div>
      <div className="field"><label>Ends *</label><input type="datetime-local" min={value.starts || min} value={value.ends} onChange={(e) => set("ends", e.target.value)} /></div>
      <div className="field"><label>Booking closes</label><input type="datetime-local" min={min} max={value.starts || undefined} value={value.closes} onChange={(e) => set("closes", e.target.value)} />
        <small className="muted">Empty = 2 hours before the start.</small></div>
      <div className="field"><label>Seats *</label><input type="number" min={2} max={500} value={value.seats} onChange={(e) => set("seats", e.target.value)} /></div>
      <div className="field"><label>Price ₹</label><input type="number" min={0} max={100000} value={value.price} onChange={(e) => set("price", e.target.value)} /></div>
      <div className="field"><label>Price type</label><select value={value.price_type} onChange={(e) => set("price_type", e.target.value)}>
        {["reservation", "per person", "free", "estimate"].map((p) => <option key={p}>{p}</option>)}</select></div>
      <div className="field"><label>Emoji</label><input value={value.emoji} maxLength={4} onChange={(e) => set("emoji", e.target.value)} /></div>
      <div className="field span2"><label>Description</label><textarea rows={3} maxLength={600} value={value.blurb} onChange={(e) => set("blurb", e.target.value)} /></div>
      <div className="field span2"><label>How it unfolds (one step per line, max 6)</label><textarea rows={3} value={value.steps} onChange={(e) => set("steps", e.target.value)} /></div>
      <div className="field span2"><label>Tags (comma separated, max 4)</label><input value={value.tags} onChange={(e) => set("tags", e.target.value)} placeholder="Beginner friendly, Women only" /></div>
    </div>
  );
}

const FILTERS = ["all", "draft", "pending", "active", "completed", "cancelled"] as const;

export function AdminEvents({ goApprovals }: { goApprovals: (req?: string) => void }) {
  const ev = useRpc<AdminEvent[]>("admin_events");
  const hs = useRpc<AdminHost[]>("admin_hosts");
  const call = useCall(); const { ask, ui } = useAsk(); const { reloadCustom } = useApp() as ReturnType<typeof useApp> & { reloadCustom?: () => void };
  const [city, setCity] = useState(""); const [host, setHost] = useState(""); const [st, setSt] = useState<(typeof FILTERS)[number]>("all"); const [qq, setQ] = useState("");
  const [edit, setEdit] = useState<{ mode: "new" | "draft" | "change"; ev?: AdminEvent; f: EventFormValue } | null>(null);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<AdminEvent | null>(null);
  const hosts = hs.data ?? [];

  const list = useMemo(() => (ev.data ?? []).filter((e) => (!city || e.city_slug === city) && (!host || String(e.host_id ?? "team") === host)
    && (st === "all" || e.display_status === st) && (!qq || (e.title + " " + e.area + " " + (e.host_name ?? "")).toLowerCase().includes(qq.toLowerCase()))), [ev.data, city, host, st, qq]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f, (ev.data ?? []).filter((e) => f === "all" || e.display_status === f).length])), [ev.data]);
  const refresh = () => { ev.reload(); hs.reload(); reloadCustom?.(); };

  async function save(submitAfter: boolean) {
    if (!edit) return;
    const problem = validateEvent(edit.f); if (problem) return setErr(problem);
    setErr(null); setBusy(true);
    const payload = formToPayload(edit.f);
    if (edit.mode === "change" && edit.ev) {
      const before = formToPayload(eventToForm(edit.ev)) as Record<string, unknown>;
      const diff = Object.fromEntries(Object.entries(payload).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k]) && !(k.endsWith("_at") && v && before[k] && new Date(v as string).getTime() === new Date(before[k] as string).getTime())));
      if (!Object.keys(diff).length) { setBusy(false); return setErr("Nothing changed yet."); }
      const note = await ask("Send change for approval", "Why this change? (helps the other admin)", { ok: "Send for approval" });
      if (note === null) return setBusy(false);
      const no = await call<string>("admin_submit_request", { p_entity: "event", p_action: "update", p_target: edit.ev.id, p_payload: diff, p_note: note }, undefined);
      setBusy(false); if (!no) return;
      setEdit(null); refresh(); goApprovals(no); return;
    }
    const id = await call<number>("admin_save_event_draft", { p_id: edit.mode === "draft" ? edit.ev!.id : null, p_payload: payload }, submitAfter ? undefined : "Draft saved ✓ (not live)");
    if (!id) return setBusy(false);
    if (submitAfter) {
      const note = await ask("Send for approval", "Note for the other admin", { ok: "Send for approval" });
      if (note !== null) { const no = await call<string>("admin_submit_request", { p_entity: "event", p_action: "create", p_target: id, p_payload: null, p_note: note }, undefined); if (no) { setBusy(false); setEdit(null); refresh(); goApprovals(no); return; } }
    }
    setBusy(false); setEdit(null); refresh();
  }

  async function act(e: AdminEvent, what: "submit" | "cancel" | "delete" | "discard") {
    if (what === "discard") { if (await call("admin_discard_draft", { p_id: e.id }, "Draft discarded")) refresh(); return; }
    if (what === "submit") {
      const problem = validateEvent(eventToForm(e)); if (problem) return setErr(problem), setEdit({ mode: "draft", ev: e, f: eventToForm(e) });
      const note = await ask("Send for approval", "Note for the other admin", { ok: "Send for approval" }); if (note === null) return;
      const no = await call<string>("admin_submit_request", { p_entity: "event", p_action: "create", p_target: e.id, p_payload: null, p_note: note });
      if (no) { refresh(); goApprovals(no); } return;
    }
    if (what === "cancel") {
      const reason = await ask(`Cancel "${e.title}"?`, "Reason (guests may see it)", { required: true, ok: "Request cancel" }); if (!reason) return;
      const no = await call<string>("admin_submit_request", { p_entity: "event", p_action: "cancel", p_target: e.id, p_payload: { reason }, p_note: reason });
      if (no) { refresh(); goApprovals(no); } return;
    }
    const note = await ask(`Remove "${e.title}"?`, "Why remove it? (it is kept in history, never erased)", { required: true, ok: "Request removal" }); if (!note) return;
    const no = await call<string>("admin_submit_request", { p_entity: "event", p_action: "delete", p_target: e.id, p_payload: {}, p_note: note });
    if (no) { refresh(); goApprovals(no); }
  }

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="adm-bar">
        <button className="btn btn-sun btn-sm" onClick={() => { setErr(null); setEdit({ mode: "new", f: blankEvent(city || "jaipur") }); }}>＋ New event</button>
        <input className="adm-search" placeholder="Search title, area, host…" value={qq} onChange={(e) => setQ(e.target.value)} />
        <select className="select" value={city} onChange={(e) => { setCity(e.target.value); setHost(""); }} aria-label="City"><option value="">All cities</option>{CITIES.map((c) => <option key={c} value={c}>{cityName(c)}</option>)}</select>
        <select className="select" value={host} onChange={(e) => setHost(e.target.value)} aria-label="Host"><option value="">All hosts</option><option value="team">the meetra team</option>
          {hosts.filter((h) => !city || h.city_slug === city).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
        <button className="btn btn-white btn-sm" onClick={refresh}>↻</button>
      </div>
      <div className="adm-seg">{FILTERS.map((f) => <button key={f} className={st === f ? "on" : ""} onClick={() => setSt(f)}>{f === "all" ? "All" : f === "pending" ? "Pending" : f[0].toUpperCase() + f.slice(1)} <small>{counts[f]}</small></button>)}</div>
      {ev.error && <p className="form-msg err">{ev.error}</p>}
      {!ev.data ? <div className="skeleton" style={{ minHeight: 160 }} /> : !list.length ? <Empty>No events here yet. Tap <b>＋ New event</b> to start a draft.</Empty> : (
        <div className="adm-list">
          {list.map((e, i) => {
            const pct = Math.min(100, Math.round((e.confirmed / Math.max(1, e.seats)) * 100));
            return (
              <motion.article key={e.id} className="adm-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
                <div className="adm-card-top"><span className="adm-em" aria-hidden="true">{e.emoji}</span>
                  <div className="grow"><b>{e.title}</b><small>{cityName(e.city_slug)} · {e.area} · {e.host_name ?? "the meetra team"}</small></div>
                  <Chip s={e.display_status} /></div>
                <div className="adm-meta"><span>🗓 {fmtDT(e.starts_at)} → {fmtDT(e.ends_at)}</span><span>⏱ Booking closes {fmtDT(e.booking_closes_at)}</span>
                  <span>💸 ₹{e.price} {e.price_type}</span></div>
                <div className="adm-occ" aria-label={`${e.confirmed} of ${e.seats} seats confirmed`}><div><i style={{ width: `${pct}%` }} /></div>
                  <small><b>{e.confirmed}/{e.seats}</b> confirmed · {e.pending} pending · {e.waitlisted} waiting</small></div>
                {e.cancel_reason && e.status === "cancelled" && <p className="muted" style={{ fontSize: 13 }}>Cancelled: {e.cancel_reason}</p>}
                {e.pending_req && <button className="adm-req-link" onClick={() => goApprovals(e.pending_req!)}>⏳ {e.pending_req} waiting for approval →</button>}
                <div className="acts">
                  {e.status === "draft" && <><button onClick={() => { setErr(null); setEdit({ mode: "draft", ev: e, f: eventToForm(e) }); }}>Edit</button>
                    <button onClick={() => act(e, "submit")}>Send for approval</button><button onClick={() => act(e, "discard")}>Discard</button></>}
                  {e.display_status === "active" && !e.pending_req && <><button onClick={() => { setErr(null); setEdit({ mode: "change", ev: e, f: eventToForm(e) }); }}>Request change</button>
                    <button onClick={() => act(e, "cancel")}>Request cancel</button></>}
                  {["active", "completed", "cancelled"].includes(e.display_status) && !e.pending_req && <button onClick={() => act(e, "delete")}>Request removal</button>}
                  {e.status !== "draft" && e.status !== "pending" && <Link href={`/event/?id=${e.plan_ref}`}>View on site</Link>}
                  <button onClick={() => setHist(e)}>History</button>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} wide title={edit?.mode === "new" ? "New event (draft)" : edit?.mode === "draft" ? "Edit draft" : `Request a change: ${edit?.ev?.title}`}>
        {edit && <>
          {edit.mode === "change" && <p className="adm-note">The live event stays as it is until the other admin approves this change.</p>}
          {edit.mode !== "change" && <p className="adm-note">Drafts are never shown on the website. Send it for approval when ready.</p>}
          <EventForm value={edit.f} onChange={(f) => setEdit({ ...edit, f })} hosts={hosts} lockCity={edit.mode === "change"} />
          {err && <p className="form-msg err" role="alert">{err}</p>}
          <div className="adm-row-end">
            <button className="btn btn-white btn-sm" onClick={() => setEdit(null)}>Close</button>
            {edit.mode !== "change" && <button className="btn btn-white btn-sm" disabled={busy} onClick={() => save(false)}>Save draft</button>}
            <button className="btn btn-ink btn-sm" disabled={busy} onClick={() => save(true)}>{edit.mode === "change" ? "Send change for approval" : "Save & send for approval"}</button>
          </div>
        </>}
      </Modal>
      <Modal open={!!hist} onClose={() => setHist(null)} wide title={`History: ${hist?.title ?? ""}`}>{hist && <EventHistory id={hist.id} />}</Modal>
      {ui}
    </motion.section>
  );
}

function EventHistory({ id }: { id: number }) {
  const h = useRpc<{ at: string; who: string; action: string; summary: string; details: Record<string, unknown> }[]>("admin_event_history", { p_id: id });
  if (!h.data) return <div className="skeleton" style={{ minHeight: 120 }} />;
  if (!h.data.length) return <Empty>No history yet.</Empty>;
  return (
    <ol className="adm-timeline">{h.data.map((r, i) => (
      <li key={i}><span className={`dot a-${r.action}`} /><div><b>{r.summary}</b><small>{fmtDT(r.at)} · {r.who}</small>
        {r.action === "updated" && <ChangedFields d={r.details} />}</div></li>
    ))}</ol>
  );
}
function ChangedFields({ d }: { d: Record<string, unknown> }) {
  const keys = Object.keys(d).filter((k) => !["time_label", "end_label", "starts_on", "host_name"].includes(k));
  if (!keys.length) return null;
  return <small className="muted">Changed: {keys.join(", ")}</small>;
}
