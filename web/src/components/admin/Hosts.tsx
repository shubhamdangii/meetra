"use client";
// Hosts, city-wise and event-wise. Adding, editing, deactivating or removing a host goes to the other admin.
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminHosts as HostApplications } from "../pages/AdminHosts";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import type { AdminEvent } from "./Events";
import { CITIES, Chip, Empty, Modal, Stars, cityName, fmtDT, useAsk, useCall, useRpc } from "./shared";

export type HostRow = {
  id: number; name: string; city_slug: string; bio: string; photo_url: string | null; phone: string | null; email: string | null; instagram: string | null;
  status: string; total_events: number; active_events: number; upcoming_events: number; completed_events: number; bookings: number;
  avg_rating: number | null; reviews: number; cities: string[]; pending_req: string | null; created_at: string; gallery: string[];
};
export type HostFormValue = { name: string; city_slug: string; bio: string; photo_url: string; phone: string; email: string; instagram: string; gallery: string[] };
export const blankHost = (city = "ahmedabad"): HostFormValue => ({ name: "", city_slug: city, bio: "", photo_url: "", phone: "", email: "", instagram: "", gallery: [] });
export const hostToForm = (h: Partial<HostRow> & Record<string, unknown>): HostFormValue => ({ name: String(h.name ?? ""), city_slug: String(h.city_slug ?? "ahmedabad"), bio: String(h.bio ?? ""),
  photo_url: String(h.photo_url ?? ""), phone: String(h.phone ?? "").replace(/^\+91/, ""), email: String(h.email ?? ""), instagram: String(h.instagram ?? ""),
  gallery: Array.isArray(h.gallery) ? (h.gallery as string[]) : [] });
export const hostPayload = (f: HostFormValue) => ({ name: f.name.trim(), city_slug: f.city_slug, bio: f.bio.trim(), photo_url: f.photo_url.trim() || null,
  phone: f.phone.trim() ? "+91" + f.phone.trim().replace(/\D/g, "").slice(-10) : null, email: f.email.trim().toLowerCase() || null, instagram: f.instagram.trim().replace(/^@/, "") || null,
  gallery: f.gallery });

/** Upload one photo to the host-media bucket (main admins only) and return its public URL. */
async function uploadHostPhoto(client: SupabaseClient, file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use a JPG, PNG or WebP photo");
  if (file.size > 3 * 1024 * 1024) throw new Error("Photo must be under 3 MB");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = await client.storage.from("host-media").upload(path, file, { contentType: file.type });
  if (up.error) throw up.error;
  return client.storage.from("host-media").getPublicUrl(path).data.publicUrl;
}
export function validateHost(f: HostFormValue): string | null {
  if (f.name.trim().length < 2) return "Name needs at least 2 characters.";
  if (f.phone.trim() && !/^[6-9]\d{9}$/.test(f.phone.trim().replace(/\D/g, "").slice(-10))) return "Phone must be a 10-digit Indian mobile number.";
  if (f.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(f.email.trim())) return "That email doesn't look right.";
  if (f.photo_url.trim() && !/^https:\/\//.test(f.photo_url.trim())) return "Photo link must start with https://";
  return null;
}

export function HostForm({ value, onChange }: { value: HostFormValue; onChange: (f: HostFormValue) => void }) {
  const auth = useAuth(); const { toast } = useApp();
  const [busy, setBusy] = useState<"photo" | "gallery" | null>(null);
  const set = (k: keyof HostFormValue, v: string) => onChange({ ...value, [k]: v });
  async function pick(files: FileList | null, kind: "photo" | "gallery") {
    if (!files?.length || !auth.client) return;
    setBusy(kind);
    try {
      if (kind === "photo") onChange({ ...value, photo_url: await uploadHostPhoto(auth.client, files[0]) });
      else {
        const room = 12 - value.gallery.length; const urls: string[] = [];
        for (const f of Array.from(files).slice(0, room)) urls.push(await uploadHostPhoto(auth.client, f));
        onChange({ ...value, gallery: [...value.gallery, ...urls] });
        toast(files.length > room ? `Only 12 gallery photos allowed. Added ${urls.length}.` : `${urls.length} photo${urls.length > 1 ? "s" : ""} added ✓`);
      }
    } catch (e) { toast("⚠️ " + (e as Error).message); }
    setBusy(null);
  }
  return (
    <div className="adm-form">
      <div className="field"><label>Name *</label><input value={value.name} maxLength={60} onChange={(e) => set("name", e.target.value)} /></div>
      <div className="field"><label>City *</label><select value={value.city_slug} onChange={(e) => set("city_slug", e.target.value)}>{CITIES.map((c) => <option key={c} value={c}>{cityName(c)}</option>)}</select></div>
      <div className="field"><label>WhatsApp number</label><input inputMode="numeric" maxLength={10} placeholder="98xxxxxxxx" value={value.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))} /></div>
      <div className="field"><label>Email</label><input type="email" value={value.email} onChange={(e) => set("email", e.target.value)} /></div>
      <div className="field"><label>Instagram</label><input value={value.instagram} placeholder="@handle" onChange={(e) => set("instagram", e.target.value)} /></div>
      <div className="field"><label>Profile photo</label>
        <div className="hf-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {value.photo_url ? <img src={value.photo_url} alt="" /> : <span>{value.name[0] ?? "?"}</span>}
          <label className="btn btn-white btn-sm">{busy === "photo" ? "Uploading…" : value.photo_url ? "Change" : "Upload"}<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pick(e.target.files, "photo")} /></label>
          {value.photo_url && <button type="button" className="linkish" onClick={() => set("photo_url", "")}>Remove</button>}
        </div></div>
      <div className="field span2"><label>Bio (shown on the site)</label><textarea rows={3} maxLength={400} value={value.bio} onChange={(e) => set("bio", e.target.value)} /></div>
      <div className="field span2"><label>Gallery ({value.gallery.length}/12) · shown on their public profile</label>
        <div className="hf-gallery">
          {value.gallery.map((u, i) => (
            <div key={u} className="g">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt={`Gallery photo ${i + 1}`} />
              <button type="button" aria-label="Remove photo" onClick={() => onChange({ ...value, gallery: value.gallery.filter((x) => x !== u) })}>✕</button>
            </div>
          ))}
          {value.gallery.length < 12 && <label className="g add" aria-label="Add gallery photos">{busy === "gallery" ? "…" : "＋"}<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => pick(e.target.files, "gallery")} /></label>}
        </div></div>
    </div>
  );
}

export function AdminHostsDesk({ goApprovals }: { goApprovals: (req?: string) => void }) {
  const [sub, setSub] = useState<"hosts" | "apps">("hosts");
  return (
    <section>
      <div className="adm-seg" style={{ marginBottom: 14 }}>
        <button className={sub === "hosts" ? "on" : ""} onClick={() => setSub("hosts")}>🎙️ Hosts</button>
        <button className={sub === "apps" ? "on" : ""} onClick={() => setSub("apps")}>📝 Applications</button>
      </div>
      {sub === "hosts" ? <HostsList goApprovals={goApprovals} /> : <HostApplications />}
    </section>
  );
}

function HostsList({ goApprovals }: { goApprovals: (req?: string) => void }) {
  const hs = useRpc<HostRow[]>("admin_hosts");
  const ev = useRpc<AdminEvent[]>("admin_events");
  const call = useCall(); const { ask, ui } = useAsk();
  const [city, setCity] = useState(""); const [event, setEvent] = useState(""); const [st, setSt] = useState("all"); const [qq, setQ] = useState("");
  const [form, setForm] = useState<{ h?: HostRow; f: ReturnType<typeof blankHost> } | null>(null); const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<HostRow | null>(null);
  const evOfHost = useMemo(() => { const m = new Map<number, AdminEvent[]>(); (ev.data ?? []).forEach((e) => { if (e.host_id) m.set(e.host_id, [...(m.get(e.host_id) ?? []), e]); }); return m; }, [ev.data]);
  const list = useMemo(() => (hs.data ?? []).filter((h) => (!city || h.city_slug === city || h.cities.includes(city)) && (st === "all" || h.status === st)
    && (!event || (ev.data ?? []).find((e) => String(e.id) === event)?.host_id === h.id)
    && (!qq || (h.name + " " + h.bio).toLowerCase().includes(qq.toLowerCase()))), [hs.data, ev.data, city, st, event, qq]);
  const refresh = () => { hs.reload(); ev.reload(); };

  async function submit() {
    if (!form) return;
    const p = validateHost(form.f); if (p) return setErr(p);
    const payload = hostPayload(form.f) as Record<string, unknown>;
    let body = payload;
    if (form.h) {
      const before = hostPayload(hostToForm(form.h)) as Record<string, unknown>;
      body = Object.fromEntries(Object.entries(payload).filter(([k, v]) => JSON.stringify(v ?? null) !== JSON.stringify(before[k] ?? null)));
      if (!Object.keys(body).length) return setErr("Nothing changed yet.");
    }
    const note = await ask(form.h ? "Send host change for approval" : "Send new host for approval", "Note for the other admin", { ok: "Send for approval" }); if (note === null) return;
    const no = await call<string>("admin_submit_request", { p_entity: "host", p_action: form.h ? "update" : "create", p_target: form.h?.id ?? null, p_payload: body, p_note: note });
    if (no) { setForm(null); refresh(); goApprovals(no); }
  }
  async function act(h: HostRow, action: "activate" | "deactivate" | "delete") {
    const label = { activate: "Activate", deactivate: "Deactivate", delete: "Remove" }[action];
    const note = await ask(`${label} ${h.name}?`, action === "delete" ? "Why remove? (kept in history, never erased)" : "Reason", { required: action !== "activate", ok: `Request ${label.toLowerCase()}` });
    if (note === null) return;
    const no = await call<string>("admin_submit_request", { p_entity: "host", p_action: action, p_target: h.id, p_payload: {}, p_note: note });
    if (no) { refresh(); goApprovals(no); }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="adm-bar">
        <button className="btn btn-sun btn-sm" onClick={() => { setErr(null); setForm({ f: blankHost(city || "jaipur") }); }}>＋ Add host</button>
        <input className="adm-search" placeholder="Search hosts…" value={qq} onChange={(e) => setQ(e.target.value)} />
        <select className="select" value={city} onChange={(e) => setCity(e.target.value)} aria-label="City"><option value="">All cities</option>{CITIES.map((c) => <option key={c} value={c}>{cityName(c)}</option>)}</select>
        <select className="select" value={event} onChange={(e) => setEvent(e.target.value)} aria-label="Event"><option value="">All events</option>
          {(ev.data ?? []).filter((e) => e.host_id && (!city || e.city_slug === city)).map((e) => <option key={e.id} value={e.id}>{e.title} · {fmtDT(e.starts_at)}</option>)}</select>
        <select className="select" value={st} onChange={(e) => setSt(e.target.value)} aria-label="Status"><option value="all">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
      </div>
      {hs.error && <p className="form-msg err">{hs.error}</p>}
      {!hs.data ? <div className="skeleton" style={{ minHeight: 160 }} /> : !list.length ? <Empty>No hosts match. Tap <b>＋ Add host</b>.</Empty> : (
        <div className="adm-list">{list.map((h, i) => (
          <motion.article key={h.id} className="adm-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
            <div className="adm-card-top">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {h.photo_url ? <img className="adm-av" src={h.photo_url} alt="" /> : <span className="adm-av ph">{h.name[0]}</span>}
              <div className="grow"><b>{h.name}</b><small>{h.cities.map(cityName).join(", ")}</small></div><Chip s={h.status} /></div>
            <Stars v={h.avg_rating} n={h.reviews} />
            <div className="adm-stats">
              <span><b>{h.total_events}</b>events</span><span><b>{h.active_events}</b>live now</span><span><b>{h.upcoming_events}</b>upcoming</span>
              <span><b>{h.completed_events}</b>completed</span><span><b>{h.bookings}</b>bookings</span></div>
            {h.pending_req && <button className="adm-req-link" onClick={() => goApprovals(h.pending_req!)}>⏳ {h.pending_req} waiting for approval →</button>}
            <div className="acts">
              <button onClick={() => setView(h)}>Profile</button>
              {!h.pending_req && <><button onClick={() => { setErr(null); setForm({ h, f: hostToForm(h) }); }}>Request edit</button>
                {h.status === "active" ? <button onClick={() => act(h, "deactivate")}>Deactivate</button> : <button onClick={() => act(h, "activate")}>Activate</button>}
                <button onClick={() => act(h, "delete")}>Remove</button></>}
            </div>
            {(evOfHost.get(h.id)?.length ?? 0) > 0 && <small className="muted">Next: {evOfHost.get(h.id)!.filter((e) => e.display_status === "active").map((e) => e.title).slice(0, 2).join(", ") || "–"}</small>}
          </motion.article>
        ))}</div>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} wide title={form?.h ? `Request edit: ${form.h.name}` : "Add a host"}>
        {form && <>
          <p className="adm-note">{form.h ? "The host stays as they are until the other admin approves." : "The host is added only after the other admin approves."}</p>
          <HostForm value={form.f} onChange={(f) => setForm({ ...form, f })} />
          {err && <p className="form-msg err" role="alert">{err}</p>}
          <div className="adm-row-end"><button className="btn btn-white btn-sm" onClick={() => setForm(null)}>Close</button><button className="btn btn-ink btn-sm" onClick={submit}>Send for approval</button></div>
        </>}
      </Modal>
      <Modal open={!!view} onClose={() => setView(null)} wide title={view ? `${view.name} · ${cityName(view.city_slug)}` : ""}>{view && <HostProfile h={view} />}</Modal>
      {ui}
    </motion.div>
  );
}

type Detail = { events: { id: number; title: string; city: string; starts_at: string; status: string; seats: number; booked: number; attended: number; avg_rating: number | null; reviews: number }[];
  reviews: { id: number; rating: number; comment: string; by: string; event: string | null; at: string; hidden: boolean }[]; history: { at: string; who: string; what: string }[] };

function HostProfile({ h }: { h: HostRow }) {
  const d = useRpc<Detail>("admin_host_detail", { p_id: h.id });
  const call = useCall();
  const [tab, setTab] = useState<"events" | "reviews" | "history">("events");
  return (
    <div>
      <div className="adm-stats big">
        <span><b>{h.total_events}</b>total events</span><span><b>{h.active_events}</b>live now</span><span><b>{h.upcoming_events}</b>upcoming</span>
        <span><b>{h.completed_events}</b>completed</span><span><b>{h.bookings}</b>bookings</span><span><b>{h.cities.length}</b>{h.cities.map(cityName).join(", ")}</span></div>
      <div style={{ margin: "10px 0 14px" }}><Stars v={h.avg_rating} n={h.reviews} /></div>
      {h.bio && <p className="muted" style={{ marginBottom: 10 }}>{h.bio}</p>}
      <p style={{ fontSize: 14, marginBottom: 12 }}>{h.phone && <a href={`https://wa.me/${h.phone.replace("+", "")}`} target="_blank" rel="noopener noreferrer">📱 {h.phone}</a>} {h.email && <span> · ✉️ {h.email}</span>} {h.instagram && <span> · 📸 @{h.instagram}</span>}</p>
      <div className="adm-seg"><button className={tab === "events" ? "on" : ""} onClick={() => setTab("events")}>Event-wise</button>
        <button className={tab === "reviews" ? "on" : ""} onClick={() => setTab("reviews")}>Reviews</button><button className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>History</button></div>
      {!d.data ? <div className="skeleton" style={{ minHeight: 100 }} /> : tab === "events" ? (
        d.data.events.length ? <div className="tbl-wrap"><table><thead><tr><th>Event</th><th>When</th><th>Status</th><th>Booked</th><th>Came</th><th>Rating</th></tr></thead>
          <tbody>{d.data.events.map((e) => <tr key={e.id}><td><b>{e.title}</b><br /><small className="muted">{cityName(e.city)}</small></td><td>{fmtDT(e.starts_at)}</td><td><Chip s={e.status} /></td>
            <td className="num">{e.booked}/{e.seats}</td><td className="num">{e.attended}</td><td><Stars v={e.avg_rating} n={e.reviews} /></td></tr>)}</tbody></table></div> : <Empty>No events with this host yet.</Empty>
      ) : tab === "reviews" ? (
        d.data.reviews.length ? <ul className="adm-reviews">{d.data.reviews.map((r) => (
          <li key={r.id} className={r.hidden ? "hidden" : ""}><Stars v={r.rating} /><p>{r.comment || <i className="muted">No comment</i>}</p>
            <small className="muted">{r.by} · {r.event ?? "–"} · {fmtDT(r.at)}{r.hidden ? " · hidden from site" : ""}</small>
            <button className="linkish" onClick={async () => { if (await call("admin_hide_review", { p_id: r.id, p_hide: !r.hidden }, r.hidden ? "Shown again" : "Hidden from the site")) d.reload(); }}>{r.hidden ? "Show on site" : "Hide from site"}</button></li>
        ))}</ul> : <Empty>No reviews yet. Only guests who were checked in can review.</Empty>
      ) : (
        d.data.history.length ? <ol className="adm-timeline">{d.data.history.map((x, i) => <li key={i}><span className="dot" /><div><b>{x.what}</b><small>{fmtDT(x.at)} · {x.who}</small></div></li>)}</ol> : <Empty>No history yet.</Empty>
      )}
    </div>
  );
}
