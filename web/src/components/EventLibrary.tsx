"use client";
// Event library: every event as a card — real events from the database and the example plans.
// Admins: add a date (one-time or weekly), reschedule, change location, assign a host, switch Active / Inactive.
//         Nothing is ever deleted. Changes to live events go to the other admin (maker-checker); the switch is instant + logged.
// Hosts:  add a date from any card (the team approves it).
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "./AppProvider";
import { useAuth } from "./AuthProvider";
import { burstFrom } from "./fx";
import { type AdminEvent, type AdminHost, type EventFormValue, blankEvent, eventToForm, formToPayload, validateEvent } from "./admin/Events";
import { CITIES, Chip, Modal, cityName, fmtDT, useAsk } from "./admin/shared";
import { CONFIG } from "@/lib/config";
import { CATEGORIES, TEMPLATES } from "@/lib/data";
import { TEMPLATE_TYPE, eventImages, imgSrc, typeImages } from "@/lib/events";
import { MAPS_HINT, isMapsUrl } from "@/lib/eventMedia";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export type LibEvent = AdminEvent & { is_active?: boolean };
type Card = {
  id: string; kind: "example" | "event"; title: string; city: string; area: string; emoji: string; image: string | null;
  sub: string; status?: string; active: boolean; ev?: LibEvent; form: EventFormValue; templateKey?: string;
};
type Tab = "active" | "inactive" | "waiting" | "past";
const to24 = (label: string) => {
  const m = /(\d+)(?::(\d+))?\s*(am|pm)/i.exec(label || ""); if (!m) return "19:00";
  let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12; return `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
};
const cats = (CATEGORIES as { id: string; label: string; icon: string }[]).filter((c) => c.id !== "all");
const catOk = (c: string) => (cats.some((x) => x.id === c) ? c : "other");

function exampleCards(cityFilter: string | null, hidden: Set<string>): Card[] {
  const out: Card[] = [];
  for (const t of TEMPLATES as any[]) for (const [city, ov] of Object.entries<any>(t.cities ?? {})) {
    if (cityFilter && city !== cityFilter) continue;
    if (!CONFIG.cities[city]?.live) continue;
    const img = ov.image || t.image || eventImages(t.key)[0] || null;
    const f = blankEvent(city);
    Object.assign(f, {
      title: ov.title || t.title, category: catOk(t.cat), area: ov.area ?? "", price: String(ov.price ?? t.price ?? 0), price_type: t.priceType,
      seats: String(ov.seats || t.seats || 12), emoji: ov.emoji || t.emoji || "✨", blurb: ov.blurb || t.blurb || "", steps: (t.steps ?? []).join("\n"),
      tags: (t.tags ?? []).join(", "), event_type: TEMPLATE_TYPE[t.key] ?? "", image_url: img && img.startsWith(BASE + "/") ? img.slice(BASE.length) : img ?? "",
      starts: to24(ov.time || t.time), ends: to24(ov.end || t.end),
    });
    out.push({ id: `t:${t.key}:${city}`, kind: "example", title: f.title, city, area: f.area, emoji: f.emoji, image: img, templateKey: t.key,
      sub: t.days ? "Example plan · repeats weekly" : "Example plan · one-off", active: !hidden.has(t.key), form: f });
  }
  return out;
}
function eventCard(e: LibEvent): Card {
  return { id: `e:${e.id}`, kind: "event", title: e.title, city: e.city_slug, area: e.area, emoji: e.emoji, ev: e,
    image: imgSrc(e.image_url) ?? typeImages(e.event_type)[0] ?? null, sub: fmtDT(e.starts_at), status: e.display_status,
    active: e.is_active !== false, form: eventToForm(e as LibEvent & Record<string, unknown>) };
}
const tabOf = (c: Card): Tab => {
  if (c.kind === "example") return c.active ? "active" : "inactive";
  const s = c.ev!.display_status;
  if (s === "draft" || s === "pending" || c.ev!.status === "draft" || c.ev!.status === "pending") return "waiting";
  if (s === "completed" || s === "cancelled") return "past";
  return c.active ? "active" : "inactive";
};

export function EventLibrary({ mode, events, hosts = [], city: lockCity, onChange, goApprovals, onEdit, onCreateNew, newTick = 0 }: {
  mode: "admin" | "host"; events: LibEvent[] | null; hosts?: AdminHost[]; city?: string; onChange?: () => void;
  goApprovals?: (req?: string) => void; onEdit?: (e: LibEvent, mode: "draft" | "change") => void; onCreateNew?: () => void; newTick?: number;
}) {
  const auth = useAuth(); const { toast, confirm, hiddenKeys, reloadHidden, reloadCustom } = useApp();
  const { ask, ui } = useAsk();
  const admin = mode === "admin";
  const [q, setQ] = useState(""); const [tab, setTab] = useState<Tab>("active");
  const [city, setCity] = useState(lockCity ?? "");
  const [add, setAdd] = useState<{ card: Card; f: EventFormValue; date: string; repeat: number } | null>(null);
  const [chooser, setChooser] = useState(false);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (newTick) setChooser(true); }, [newTick]);

  const all = useMemo(() => {
    const cf = lockCity ?? (city || null);
    return [...(events ?? []).filter((e) => !cf || e.city_slug === cf).map(eventCard), ...exampleCards(cf, hiddenKeys)];
  }, [events, hiddenKeys, city, lockCity]);
  const counts = useMemo(() => all.reduce((m, c) => { const t = tabOf(c); m[t] = (m[t] ?? 0) + 1; return m; }, {} as Record<Tab, number>), [all]);
  const cards = all.filter((c) => tabOf(c) === tab && (!q || `${c.title} ${c.area} ${c.sub}`.toLowerCase().includes(q.toLowerCase())));
  const TABS: [Tab, string][] = admin ? [["active", "🟢 Active"], ["inactive", "⚪ Inactive"], ["waiting", "⏳ Waiting"], ["past", "🏁 Past"]] : [["active", "Events"], ["waiting", "⏳ Waiting"], ["past", "🏁 Past"]];

  function openAdd(card: Card) {
    const f = { ...card.form };
    const startT = (f.starts || "").slice(-5) || "19:00", endT = (f.ends || "").slice(-5) || "21:00";
    const date = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
    setErr(""); setChooser(false);
    setAdd({ card, date, repeat: 1, f: { ...f, city_slug: lockCity ?? card.city, starts: `${date}T${startT}`, ends: `${date}T${endT}`, closes: "", host_id: admin ? f.host_id : "", maps_url: f.maps_url ?? "" } });
  }
  const setF = (patch: Partial<EventFormValue>) => add && setAdd({ ...add, f: { ...add.f, ...patch } });
  const setWhen = (date: string, st: string, en: string) => add && setAdd({ ...add, date, f: { ...add.f, starts: `${date}T${st}`, ends: `${date}T${en}`, closes: "" } });
  const shift = (f: EventFormValue, weeks: number): EventFormValue => {
    const mv = (v: string) => { const d = new Date(v); d.setDate(d.getDate() + 7 * weeks); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${v.slice(-5)}`; };
    return { ...f, starts: mv(f.starts), ends: mv(f.ends), closes: "" };
  };

  async function create(ev: React.MouseEvent<HTMLButtonElement>) {
    if (!add || !auth.client) return;
    let f = add.f;
    if (f.ends <= f.starts) { const e = new Date(f.ends); e.setDate(e.getDate() + 1); const p = (n: number) => String(n).padStart(2, "0"); f = { ...f, ends: `${e.getFullYear()}-${p(e.getMonth() + 1)}-${p(e.getDate())}T${f.ends.slice(-5)}` }; }
    const dates = Array.from({ length: add.repeat }, (_, i) => shift(f, i));
    for (const d of dates) { const p = validateEvent(d); if (p) return setErr(p); }
    setErr(""); setBusy(true);
    const btn = ev.currentTarget; const sent: string[] = [];
    for (const d of dates) {
      const payload = formToPayload(d);
      const id = await auth.client.rpc(admin ? "admin_save_event_draft" : "host_save_event_draft", { p_id: null, p_payload: payload });
      if (id.error) { setBusy(false); setErr(`${sent.length ? `${sent.length} sent, then: ` : ""}${id.error.message}`); onChange?.(); return; }
      const no = admin
        ? await auth.client.rpc("admin_submit_request", { p_entity: "event", p_action: "create", p_target: id.data, p_payload: null, p_note: `Added from the Event library (${add.card.title}${add.repeat > 1 ? `, weekly ×${add.repeat}` : ""})` })
        : await auth.client.rpc("host_submit_event", { p_id: id.data, p_note: null });
      if (no.error) { setBusy(false); setErr(no.error.message); onChange?.(); return; }
      sent.push(String(no.data));
    }
    setBusy(false);
    burstFrom(btn, ["🎉", "✨", "📅"], 12);
    toast(sent.length > 1 ? `${sent.length} dates sent ✓ (${sent[0]}…${sent[sent.length - 1]})` : `${sent[0]} sent ✓ ${admin ? "The other admin approves it" : "The team checks it"}`);
    setAdd(null); onChange?.();
  }

  async function toggle(card: Card) {
    if (!auth.client) return;
    const on = !card.active;
    if (card.kind === "example") {
      if (!on && !(await confirm({ title: `Set "${card.title}" inactive?`, body: "Every date of this example plan is hidden from the website and takes no requests. You can set it active again any time.", ok: "Set inactive" }))) return;
      const { error } = await auth.client.rpc("admin_hide_template", { p_key: card.templateKey, p_hide: !on });
      if (error) return toast("⚠️ " + error.message);
      toast(on ? "Active again ✓" : "Set inactive ✓"); reloadHidden(); return;
    }
    const reason = on ? "" : await ask(`Set "${card.title}" inactive?`, "Why? (shown in the activity log)", { ok: "Set inactive" });
    if (reason === null) return;
    const { error } = await auth.client.rpc("admin_set_event_active", { p_id: card.ev!.id, p_active: on, p_reason: reason || null });
    if (error) return toast("⚠️ " + error.message);
    toast(on ? "Active again ✓ It's back on the site" : "Set inactive ✓ Hidden from the site"); onChange?.(); reloadCustom();
  }

  async function assignHost(e: LibEvent, hostId: string) {
    if (!auth.client || String(e.host_id ?? "") === hostId) return;
    const name = hostId ? hosts.find((h) => String(h.id) === hostId)?.name ?? "host" : "no host yet";
    const { data, error } = await auth.client.rpc("admin_submit_request", { p_entity: "event", p_action: "update", p_target: e.id, p_payload: { host_id: hostId ? Number(hostId) : null }, p_note: `Assign host: ${name}` });
    if (error) return toast("⚠️ " + error.message);
    toast(`${data} sent ✓ The other admin approves the new host`); onChange?.(); goApprovals?.(String(data));
  }

  const startT = add?.f.starts.slice(-5) ?? "", endT = add?.f.ends.slice(-5) ?? "";
  const addHosts = hosts.filter((h) => h.status === "active" && h.city_slug === add?.f.city_slug);
  return (
    <section className="lib" id="event-library">
      <div className="lib-head">
        <div><b>📚 Event library</b><small>{admin ? "Every event on the site. Add dates, reschedule, assign hosts, switch active / inactive. Nothing is ever deleted." : "Pick any event and add your own date. The team approves it."}</small></div>
        <button className="btn btn-sun btn-sm" onClick={() => setChooser(true)}>＋ New event</button>
      </div>
      <div className="lib-bar">
        <input className="adm-search" placeholder="Search events…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" />
        {!lockCity && <select className="select" value={city} onChange={(e) => setCity(e.target.value)} aria-label="City"><option value="">All cities</option>{CITIES.map((c) => <option key={c} value={c}>{cityName(c)}</option>)}</select>}
      </div>
      <div className="adm-seg" role="tablist" aria-label="Event status">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l} <small>{counts[k] ?? 0}</small></button>)}</div>
      {events === null ? <div className="skeleton" style={{ minHeight: 200 }} /> : !cards.length ? <p className="muted">Nothing here.</p> : (
        <div className="lib-grid">
          {cards.map((c, i) => {
            const e = c.ev; const live = e && e.status === "approved" && e.display_status === "active";
            return (
              <motion.article key={c.id} className={`lib-card${c.active ? "" : " off"}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.02 }}>
                <div className="lib-img">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.image ? <img src={c.image} alt="" loading="lazy" /> : <span aria-hidden="true">{c.emoji}</span>}
                  <span className={`lib-kind k-${c.kind}`}>{c.kind === "example" ? "Example" : "Event"}</span>
                  {admin && (c.kind === "example" || live || (e && !c.active)) && (
                    <button type="button" className={`lib-switch${c.active ? " on" : ""}`} role="switch" aria-checked={c.active} aria-label={`${c.title}: ${c.active ? "active" : "inactive"}`} onClick={() => toggle(c)}>
                      <i /><span>{c.active ? "Active" : "Inactive"}</span>
                    </button>
                  )}
                </div>
                <div className="lib-body">
                  <b>{c.title}</b>
                  <small>{cityName(c.city)}{c.area ? ` · ${c.area}` : ""}</small>
                  <small className="muted">{c.sub}{e?.host_name ? ` · ${e.host_name}` : e ? " · Host TBA" : ""}</small>
                  {c.status && c.kind === "event" && <Chip s={c.active ? c.status : "inactive"} />}
                  {e?.pending_req && <button className="adm-link small" onClick={() => goApprovals?.(e.pending_req!)}>⏳ {e.pending_req} waiting</button>}
                </div>
                <div className="lib-acts">
                  {c.active && <button className="btn btn-sun btn-sm" onClick={() => openAdd(c)}>＋ Add date</button>}
                  {admin && live && !e!.pending_req && <div className="lib-more">
                    <button className="btn btn-white btn-sm" onClick={() => onEdit?.(e!, "change")}>📅 Reschedule</button>
                    <button className="btn btn-white btn-sm" onClick={() => onEdit?.(e!, "change")}>📍 Location</button>
                    <select className="select lib-host" aria-label={`Host for ${c.title}`} value={e!.host_id ?? ""} onChange={(x) => assignHost(e!, x.target.value)}>
                      <option value="">🎙️ Assign host…</option>
                      {hosts.filter((h) => h.status === "active" && h.city_slug === e!.city_slug).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </select>
                  </div>}
                  {admin && e?.status === "draft" && <button className="btn btn-white btn-sm" onClick={() => onEdit?.(e, "draft")}>✏️ Edit draft</button>}
                </div>
              </motion.article>
            );
          })}
        </div>
      )}

      {/* "＋ New event": pick from the library (only date/time/place to fill) or create from scratch (all fields) */}
      <Modal open={chooser} onClose={() => setChooser(false)} title="New event">
        <div className="lib-choose">
          <button type="button" onClick={() => { setChooser(false); setTab("active"); document.getElementById("event-library")?.scrollIntoView({ behavior: "smooth" }); toast("Pick a card below and tap ＋ Add date"); }}>
            <span aria-hidden="true">📚</span><b>Pick an event</b><small>Copy an existing event. You only set the date, time and place.</small></button>
          <button type="button" onClick={() => { setChooser(false); onCreateNew?.(); }}>
            <span aria-hidden="true">✍️</span><b>Create from scratch</b><small>A brand-new event with every field.</small></button>
        </div>
      </Modal>

      <Modal open={!!add} onClose={() => setAdd(null)} title={add ? `Add a date: ${add.card.title}` : ""}>
        {add && <>
          <p className="adm-note">Title, description, photo, price and seats are copied from this event. {admin ? "The other admin approves it before it goes live." : "The team approves it before it goes live."}</p>
          <div className="adm-form lib-when">
            {admin && !lockCity && <div className="field"><label htmlFor="lib-city">City</label><select id="lib-city" value={add.f.city_slug} onChange={(e) => setF({ city_slug: e.target.value, host_id: "" })}>{CITIES.map((c) => <option key={c} value={c}>{cityName(c)}</option>)}</select></div>}
            <div className="field"><label htmlFor="lib-cat">Category</label><select id="lib-cat" value={add.f.category} onChange={(e) => setF({ category: e.target.value })}>{cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}<option value="other">✦ Other</option></select></div>
            <div className="field"><label htmlFor="lib-date">{add.repeat > 1 ? "First date *" : "Date *"}</label><input id="lib-date" type="date" min={new Date().toISOString().slice(0, 10)} value={add.date} onChange={(e) => setWhen(e.target.value, startT, endT)} /></div>
            <div className="field"><label htmlFor="lib-rep">How often</label><select id="lib-rep" value={add.repeat} onChange={(e) => setAdd({ ...add, repeat: Number(e.target.value) })}>
              <option value={1}>One-time (casual)</option>{[2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>Repeat weekly · {n} weeks</option>)}</select></div>
            <div className="field-row dt-row span2">
              <div className="field"><label htmlFor="lib-st">Starts *</label><input id="lib-st" type="time" value={startT} onChange={(e) => setWhen(add.date, e.target.value, endT)} /></div>
              <div className="field"><label htmlFor="lib-en">Ends *</label><input id="lib-en" type="time" value={endT} onChange={(e) => setWhen(add.date, startT, e.target.value)} /></div>
            </div>
            <div className="field"><label htmlFor="lib-area">Area *</label><input id="lib-area" value={add.f.area} maxLength={60} onChange={(e) => setF({ area: e.target.value })} /></div>
            <div className="field"><label htmlFor="lib-maps">Exact location (Google Maps link)</label><input id="lib-maps" type="url" inputMode="url" value={add.f.maps_url} placeholder="https://maps.app.goo.gl/…" onChange={(e) => setF({ maps_url: e.target.value })} />
              {add.f.maps_url.trim() && !isMapsUrl(add.f.maps_url) && <small className="muted">⚠️ {MAPS_HINT}</small>}</div>
            {admin && <div className="field span2"><label htmlFor="lib-host">Host</label><select id="lib-host" value={add.f.host_id} onChange={(e) => setF({ host_id: e.target.value })}>
              <option value="">Not decided yet (shows &quot;Host announced soon&quot;)</option>{addHosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></div>}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>{add.f.price_type === "free" ? "Free" : `₹${add.f.price} ${add.f.price_type}`} · {add.f.seats} seats · bookings close 4 hours before the start{add.repeat > 1 ? ` · ${add.repeat} dates, one week apart` : ""}</p>
          {err && <p className="form-msg err" role="alert">{err}</p>}
          <div className="adm-row-end">
            <button className="btn btn-white btn-sm" onClick={() => setAdd(null)}>Close</button>
            <button className="btn btn-ink btn-sm" disabled={busy} onClick={create}>{busy ? "Sending…" : `${add.repeat > 1 ? `Add ${add.repeat} dates` : "Add"} & send ${admin ? "for approval" : "to the team"}`}</button>
          </div>
        </>}
      </Modal>
      {ui}
    </section>
  );
}
