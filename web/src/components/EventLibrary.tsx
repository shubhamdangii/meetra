"use client";
// Event library: every event as a card — real events from the database and the example plans.
// Admins: add a date (one-time or weekly), reschedule, change location, assign a host, switch Active / Inactive.
//         Nothing is ever deleted. Changes to live events go to the other admin (maker-checker); the switch is instant + logged.
// Hosts:  add a date from any card (the team approves it).
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "./AppProvider";
import { useAuth } from "./AuthProvider";
import { burstFrom } from "./fx";
import { type AdminEvent, type AdminHost, type EventFormValue, blankEvent, eventToForm, formToPayload, validateEvent } from "./admin/Events";
import { CITIES, Chip, Modal, cityName, fmtDT, toLocalInput, useAsk } from "./admin/shared";
import { CONFIG } from "@/lib/config";
import { CATEGORIES, TEMPLATES } from "@/lib/data";
import { TEMPLATE_TYPE, eventImages, imgSrc, typeImages } from "@/lib/events";
import { MAPS_HINT, isMapsUrl } from "@/lib/eventMedia";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export type LibEvent = AdminEvent & { is_active?: boolean };
type Card = {
  id: string; kind: "example" | "event"; title: string; city: string; area: string; emoji: string; image: string | null;
  sub: string; status?: string; active: boolean; ev?: LibEvent; form: EventFormValue; templateKey?: string;
  /** example plans: one card, one entry per city it runs in (area, price… can differ by city) */
  variants?: { city: string; area: string; form: EventFormValue }[];
};
type Tab = "active" | "inactive" | "waiting" | "past";
const to24 = (label: string) => {
  const m = /(\d+)(?::(\d+))?\s*(am|pm)/i.exec(label || ""); if (!m) return "19:00";
  let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12; return `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
};
const pad = (n: number) => String(n).padStart(2, "0");
/** "2026-11-29T22:00" → same time on the next day (an event that ends after midnight) */
const nextDay = (v: string) => { const d = new Date(v); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${v.slice(-5)}`; };
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const spring = { type: "spring", stiffness: 420, damping: 32 } as const;
const cats = (CATEGORIES as { id: string; label: string; icon: string }[]).filter((c) => c.id !== "all");
const catOk = (c: string) => (cats.some((x) => x.id === c) ? c : "other");

function exampleCards(cityFilter: string | null, hidden: Set<string>): Card[] {
  const out: Card[] = [];
  for (const t of TEMPLATES as any[]) {
  const variants: NonNullable<Card["variants"]> = []; let img0: string | null = null;
  for (const [city, ov] of Object.entries<any>(t.cities ?? {})) {
    if (cityFilter && city !== cityFilter) continue;
    if (!CONFIG.cities[city]?.live) continue;
    const img = ov.image || t.image || eventImages(t.key)[0] || null;
    img0 ??= img;
    const f = blankEvent(city);
    Object.assign(f, {
      title: ov.title || t.title, category: catOk(t.cat), area: ov.area ?? "", price: String(ov.price ?? t.price ?? 0), price_type: t.priceType,
      seats: String(ov.seats || t.seats || 12), emoji: ov.emoji || t.emoji || "✨", blurb: ov.blurb || t.blurb || "", steps: (t.steps ?? []).join("\n"),
      tags: (t.tags ?? []).join(", "), event_type: TEMPLATE_TYPE[t.key] ?? "", image_url: img && img.startsWith(BASE + "/") ? img.slice(BASE.length) : img ?? "",
      starts: to24(ov.time || t.time), ends: to24(ov.end || t.end),
    });
    variants.push({ city, area: f.area, form: f });
  }
  if (!variants.length) continue;
  const v0 = variants[0];
  out.push({ id: `t:${t.key}`, kind: "example", title: v0.form.title, city: v0.city, area: v0.area, emoji: v0.form.emoji, image: img0, templateKey: t.key,
    sub: t.days ? "Example plan · repeats weekly" : "Example plan · one-off", active: !hidden.has(t.key), form: v0.form, variants });
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
  // quick changes on a live event: just the time, or just the place (full form stays one tap away)
  const [quick, setQuick] = useState<{ e: LibEvent; kind: "time" | "place"; date: string; st: string; en: string; area: string; maps: string; note: string } | null>(null);
  const [qErr, setQErr] = useState("");
  const [hostFor, setHostFor] = useState<LibEvent | null>(null);

  const all = useMemo(() => {
    const cf = lockCity ?? (city || null);
    return [...(events ?? []).filter((e) => !cf || e.city_slug === cf).map(eventCard), ...exampleCards(cf, hiddenKeys)];
  }, [events, hiddenKeys, city, lockCity]);
  const counts = useMemo(() => all.reduce((m, c) => { const t = tabOf(c); m[t] = (m[t] ?? 0) + 1; return m; }, {} as Record<Tab, number>), [all]);
  const cards = all.filter((c) => tabOf(c) === tab && (!q || `${c.title} ${c.area} ${c.sub} ${(c.variants ?? []).map((v) => `${v.area} ${cityName(v.city)}`).join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  const TABS: [Tab, string][] = admin ? [["active", "🟢 Active"], ["inactive", "⚪ Inactive"], ["waiting", "⏳ Waiting"], ["past", "🏁 Past"]] : [["active", "Events"], ["waiting", "⏳ Waiting"], ["past", "🏁 Past"]];

  /** Add a date in another city: copy that city's version of the plan (area, price…), keep the date and time already picked. */
  function pickCity(c: string) {
    if (!add || add.f.city_slug === c) return;
    const v = add.card.variants?.find((x) => x.city === c);
    setAdd({ ...add, f: v ? { ...v.form, category: add.f.category, starts: add.f.starts, ends: add.f.ends, closes: "", city_slug: c, host_id: "", maps_url: "" } : { ...add.f, city_slug: c, host_id: "" } });
  }
  function openAdd(card: Card) {
    const want = lockCity ?? (city || null);
    const f = { ...((want && card.variants?.find((v) => v.city === want)?.form) || card.form) };
    const startT = (f.starts || "").slice(-5) || "19:00", endT = (f.ends || "").slice(-5) || "21:00";
    const date = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
    setErr(""); setChooser(false);
    setAdd({ card, date, repeat: 1, f: { ...f, city_slug: lockCity ?? f.city_slug ?? card.city, starts: `${date}T${startT}`, ends: `${date}T${endT}`, closes: "", host_id: admin ? f.host_id : "", maps_url: f.maps_url ?? "" } });
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
    toast(`${data} sent ✓ The other admin approves the new host`); setHostFor(null); onChange?.();
  }

  function openQuick(e: LibEvent, kind: "time" | "place") {
    const s = toLocalInput(e.starts_at), en = toLocalInput(e.ends_at);
    setQErr(""); setQuick({ e, kind, date: s.slice(0, 10), st: s.slice(11, 16), en: en.slice(11, 16), area: e.area ?? "", maps: e.maps_url ?? "", note: "" });
  }
  async function sendQuick() {
    if (!quick || !auth.client) return;
    const base = eventToForm(quick.e as LibEvent & Record<string, unknown>);
    let f: EventFormValue;
    if (quick.kind === "time") {
      const starts = `${quick.date}T${quick.st}`; let ends = `${quick.date}T${quick.en}`; if (quick.en <= quick.st) ends = nextDay(ends);
      f = { ...base, starts, ends, closes: "" };
    } else f = { ...base, area: quick.area, maps_url: quick.maps };
    const problem = validateEvent(f); if (problem) return setQErr(problem);
    const p = formToPayload(f);
    let diff: Record<string, unknown>;
    if (quick.kind === "time") {
      const s = new Date(p.starts_at as string).getTime(), en = new Date(p.ends_at as string).getTime();
      if (s === new Date(quick.e.starts_at).getTime() && en === new Date(quick.e.ends_at).getTime()) return setQErr("Pick a new date or time first.");
      diff = { starts_at: p.starts_at, ends_at: p.ends_at, booking_closes_at: new Date(s - 4 * 3600e3).toISOString() };
    } else {
      if (p.area === (quick.e.area ?? "") && (p.maps_url ?? "") === (quick.e.maps_url ?? "")) return setQErr("Change the area or the map link first.");
      diff = { area: p.area, maps_url: p.maps_url };
    }
    setQErr(""); setBusy(true);
    const note = quick.note.trim() || (quick.kind === "time" ? `Reschedule to ${fmtDT(p.starts_at as string)}` : `New location: ${p.area}`);
    const { data, error } = await auth.client.rpc("admin_submit_request", { p_entity: "event", p_action: "update", p_target: quick.e.id, p_payload: diff, p_note: note });
    setBusy(false);
    if (error) return setQErr(error.message);
    toast(`${data} sent ✓ Live event stays the same until the other admin approves`); setQuick(null); onChange?.();
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
      <div className="lib-tabs" role="tablist" aria-label="Event status">{TABS.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
          {tab === k && <motion.span layoutId={`lib-tab-${mode}`} className="lib-tab-bg" transition={spring} />}
          <span className="lib-tab-l">{l} <small>{counts[k] ?? 0}</small></span>
        </button>))}</div>
      {events === null ? <div className="lib-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton lib-skel" />)}</div> : !cards.length ? (
        <motion.div className="lib-empty" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}><span aria-hidden="true">{tab === "inactive" ? "🌙" : "🗂️"}</span><b>Nothing here{q ? ` for "${q}"` : ""}.</b></motion.div>
      ) : (
        <motion.div className="lib-grid" layout>
          <AnimatePresence mode="popLayout">
          {cards.map((c, i) => {
            const e = c.ev; const live = !!e && e.status === "approved" && e.display_status === "active";
            const canTools = admin && live && !e!.pending_req;
            const weekly = c.sub.includes("weekly");
            const showChip = c.kind === "event" && (!c.active || c.status !== "active");
            return (
              <motion.article layout key={c.id} className={`lib-card${c.active ? "" : " off"}`}
                initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.15 } }}
                whileHover={{ y: -5 }} transition={{ ...spring, delay: Math.min(i, 10) * 0.025 }}>
                <div className="lib-img">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.image ? <img src={c.image} alt="" loading="lazy" /> : <span className="lib-emoji" aria-hidden="true">{c.emoji}</span>}
                  <span className="lib-shade" aria-hidden="true" />
                  <span className={`lib-kind k-${c.kind}`}>{c.kind === "example" ? "✦ Example" : "● Event"}</span>
                  {admin && (c.kind === "example" || live || (!!e && !c.active)) && (
                    <motion.button type="button" whileTap={{ scale: 0.9 }} className={`lib-switch${c.active ? " on" : ""}`} role="switch" aria-checked={c.active}
                      aria-label={`${c.title}: ${c.active ? "active, tap to set inactive" : "inactive, tap to set active"}`} onClick={() => toggle(c)}>
                      <span className="lib-track"><motion.i layout transition={{ type: "spring", stiffness: 700, damping: 34 }} /></span><b>{c.active ? "Live" : "Off"}</b>
                    </motion.button>
                  )}
                  <span className="lib-datetag">{e ? <>🗓 {fmtDT(e.starts_at)}</> : weekly ? "↻ Repeats weekly" : "◷ One-off plan"}</span>
                </div>
                <div className="lib-body">
                  <b className="lib-title">{c.title}</b>
                  {c.variants && c.variants.length > 1
                    ? <span className="lib-cities" aria-label={`Runs in ${c.variants.map((v) => cityName(v.city)).join(" and ")}`}>{c.variants.map((v) => <span key={v.city} title={v.area}>📍 {cityName(v.city)}</span>)}</span>
                    : <span className="lib-meta"><span aria-hidden="true">📍</span><span>{c.area ? `${c.area}, ` : ""}{cityName(c.city)}</span></span>}
                  {e && (canTools ? (
                    <button type="button" className={`lib-hostbtn${e.host_name ? "" : " empty"}`} onClick={() => setHostFor(e)} aria-label={e.host_name ? `Host: ${e.host_name}. Change host` : "Assign a host"}>
                      <span className="lib-av" aria-hidden="true">{e.host_name ? initials(e.host_name) : "+"}</span>
                      <span className="nm">{e.host_name ?? "Assign a host"}</span><i className="go" aria-hidden="true">›</i>
                    </button>
                  ) : (
                    <span className={`lib-hostbtn static${e.host_name ? "" : " empty"}`}><span className="lib-av" aria-hidden="true">{e.host_name ? initials(e.host_name) : "?"}</span><span className="nm">{e.host_name ?? "Host announced soon"}</span></span>
                  ))}
                  {showChip && <span className="lib-status"><Chip s={c.active ? c.status! : "inactive"} /></span>}
                  {e?.pending_req && <button className="lib-pending" onClick={() => goApprovals?.(e.pending_req!)}><span className="dot" aria-hidden="true" />{e.pending_req} waiting for approval</button>}
                </div>
                <div className="lib-acts">
                  {c.active && <motion.button whileTap={{ scale: 0.95 }} className="lib-add" onClick={() => openAdd(c)}><span className="pl" aria-hidden="true">+</span>Add date</motion.button>}
                  {canTools && <div className="lib-tools">
                    <motion.button whileTap={{ scale: 0.92 }} onClick={() => openQuick(e!, "time")} aria-label={`Reschedule ${c.title}`}><span aria-hidden="true">🗓</span><span>Reschedule</span></motion.button>
                    <motion.button whileTap={{ scale: 0.92 }} onClick={() => openQuick(e!, "place")} aria-label={`Change location of ${c.title}`}><span aria-hidden="true">📍</span><span>Location</span></motion.button>
                  </div>}
                  {admin && e?.status === "draft" && <motion.button whileTap={{ scale: 0.95 }} className="lib-ghost" onClick={() => onEdit?.(e, "draft")}>✏️ Edit draft</motion.button>}
                </div>
              </motion.article>
            );
          })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* reschedule / location: only the fields that change */}
      <Modal open={!!quick} onClose={() => setQuick(null)} title={quick ? `${quick.kind === "time" ? "Reschedule" : "Change location"}: ${quick.e.title}` : ""}>
        {quick && <>
          <div className="lib-now"><span>Now</span><b>{quick.kind === "time" ? `${fmtDT(quick.e.starts_at)} → ${fmtDT(quick.e.ends_at)}` : `${quick.e.area || "—"}, ${cityName(quick.e.city_slug)}`}</b></div>
          <div className="adm-form lib-when-form">
            {quick.kind === "time" ? <>
              <div className="field span2"><label htmlFor="q-date">New date *</label><input id="q-date" type="date" min={new Date().toISOString().slice(0, 10)} value={quick.date} onChange={(x) => setQuick({ ...quick, date: x.target.value })} /></div>
              <div className="field-row dt-row span2">
                <div className="field"><label htmlFor="q-st">Starts *</label><input id="q-st" type="time" value={quick.st} onChange={(x) => setQuick({ ...quick, st: x.target.value })} /></div>
                <div className="field"><label htmlFor="q-en">Ends *</label><input id="q-en" type="time" value={quick.en} onChange={(x) => setQuick({ ...quick, en: x.target.value })} /></div>
              </div>
              <p className="muted span2" style={{ fontSize: 13 }}>Bookings close 4 hours before the new start. Guests who already have a seat get a notification after approval.</p>
            </> : <>
              <div className="field span2"><label htmlFor="q-area">Area *</label><input id="q-area" value={quick.area} maxLength={60} onChange={(x) => setQuick({ ...quick, area: x.target.value })} /></div>
              <div className="field span2"><label htmlFor="q-maps">Exact location (Google Maps link)</label><input id="q-maps" type="url" inputMode="url" value={quick.maps} placeholder="https://maps.app.goo.gl/…" onChange={(x) => setQuick({ ...quick, maps: x.target.value })} />
                <small className="muted">{quick.maps.trim() && !isMapsUrl(quick.maps) ? "⚠️ " + MAPS_HINT : "Only confirmed guests see the exact pin."}</small></div>
            </>}
            <div className="field span2"><label htmlFor="q-note">Why? (optional, for the other admin)</label><input id="q-note" value={quick.note} maxLength={200} onChange={(x) => setQuick({ ...quick, note: x.target.value })} /></div>
          </div>
          {qErr && <p className="form-msg err" role="alert">{qErr}</p>}
          <div className="adm-row-end">
            <button className="btn btn-white btn-sm" onClick={() => { const e = quick.e; setQuick(null); onEdit?.(e, "change"); }}>All fields…</button>
            <button className="btn btn-ink btn-sm" disabled={busy} onClick={sendQuick}>{busy ? "Sending…" : "Send for approval"}</button>
          </div>
        </>}
      </Modal>

      {/* host picker: people, not a dropdown */}
      <Modal open={!!hostFor} onClose={() => setHostFor(null)} title={hostFor ? `Who hosts ${hostFor.title}?` : ""}>
        {hostFor && (() => {
          const list = hosts.filter((h) => h.status === "active" && h.city_slug === hostFor.city_slug);
          return <>
            <p className="adm-note">The other admin approves the change. Until then the current host stays.</p>
            <div className="lib-hosts">
              {list.map((h, i) => {
                const cur = String(hostFor.host_id ?? "") === String(h.id);
                return <motion.button key={h.id} type="button" className={cur ? "cur" : ""} disabled={cur} onClick={() => assignHost(hostFor, String(h.id))}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} whileTap={{ scale: 0.97 }}>
                  <span className="lib-av" aria-hidden="true">{initials(h.name)}</span><span className="nm">{h.name}</span>{cur ? <em>Current ✓</em> : <i aria-hidden="true">›</i>}
                </motion.button>;
              })}
              {!list.length && <p className="muted">No active hosts in {cityName(hostFor.city_slug)} yet. Add one in the Hosts tab.</p>}
              {hostFor.host_id != null && <button type="button" className="lib-nohost" onClick={() => assignHost(hostFor, "")}>Remove host (show &quot;Host announced soon&quot;)</button>}
            </div>
          </>;
        })()}
      </Modal>

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
            {admin && !lockCity && <div className="field span2"><span className="lib-lbl" id="lib-city-l">Which city? *</span>
              <div className="lib-citypick" role="radiogroup" aria-labelledby="lib-city-l">{CITIES.filter((c) => CONFIG.cities[c]?.live).map((c) => {
                const on = add.f.city_slug === c; const v = add.card.variants?.find((x) => x.city === c);
                return <button key={c} type="button" role="radio" aria-checked={on} className={on ? "on" : ""} onClick={() => pickCity(c)}>
                  {on && <motion.span layoutId="lib-city-bg" className="bg" transition={spring} />}
                  <span className="tx"><b>{cityName(c)}</b>{v?.area ? <small>{v.area}</small> : null}</span></button>;
              })}</div></div>}
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
