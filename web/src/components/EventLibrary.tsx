"use client";
// Event library: every event as a card — the example plans and the real events in the database.
// "＋ Add date" asks only for the date & time (everything else is copied from the card) and sends it for approval.
// Admins can also delete (real events go through the other admin; example plans are hidden from the site).
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useApp } from "./AppProvider";
import { useAuth } from "./AuthProvider";
import { burstFrom } from "./fx";
import { type AdminEvent, type EventFormValue, blankEvent, eventToForm, formToPayload, validateEvent } from "./admin/Events";
import { CITIES, Chip, Modal, cityName, fmtDT, useAsk } from "./admin/shared";
import { CONFIG } from "@/lib/config";
import { CATEGORIES, TEMPLATES } from "@/lib/data";
import { TEMPLATE_TYPE, eventImages, imgSrc, typeImages } from "@/lib/events";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
type Card = {
  id: string; kind: "example" | "event"; title: string; city: string; area: string; emoji: string; image: string | null;
  sub: string; status?: string; hidden?: boolean; ev?: AdminEvent; form: EventFormValue; templateKey?: string;
};
const to24 = (label: string) => {   // "8 pm" → "20:00"
  const m = /(\d+)(?::(\d+))?\s*(am|pm)/i.exec(label || ""); if (!m) return "19:00";
  let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12; return `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
};
const catOk = (c: string) => (CATEGORIES as { id: string }[]).some((x) => x.id === c && c !== "all") ? c : "other";

/** Cards for the example plans (one per plan and city). */
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
      starts: to24(ov.time || t.time), ends: to24(ov.end || t.end),   // only the times; the date is asked when adding
    });
    out.push({ id: `t:${t.key}:${city}`, kind: "example", title: f.title, city, area: f.area, emoji: f.emoji, image: img, templateKey: t.key,
      sub: `Example plan · ${t.days ? "repeats weekly" : "one-off"}`, hidden: hidden.has(t.key), form: f });
  }
  return out;
}

function eventCard(e: AdminEvent): Card {
  const f = eventToForm(e as AdminEvent & Record<string, unknown>);
  const img = imgSrc(e.image_url) ?? typeImages(e.event_type)[0] ?? null;
  return { id: `e:${e.id}`, kind: "event", title: e.title, city: e.city_slug, area: e.area, emoji: e.emoji, image: img, ev: e,
    sub: fmtDT(e.starts_at), status: e.display_status, form: f };
}

const FILTERS = [["all", "All"], ["event", "Real events"], ["example", "Example plans"], ["hidden", "Removed"]] as const;

export function EventLibrary({ mode, events, city: lockCity, onChange, goApprovals }: {
  mode: "admin" | "host"; events: AdminEvent[] | null; city?: string; onChange?: () => void; goApprovals?: (req?: string) => void;
}) {
  const auth = useAuth(); const { toast, confirm, hiddenKeys, reloadHidden, reloadCustom } = useApp();
  const { ask, ui } = useAsk();
  const [q, setQ] = useState(""); const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [city, setCity] = useState(lockCity ?? "");
  const [add, setAdd] = useState<{ card: Card; f: EventFormValue; date: string } | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const admin = mode === "admin";

  const cards = useMemo(() => {
    const cf = lockCity ?? (city || null);
    const ex = exampleCards(cf, hiddenKeys);
    const ev = (events ?? []).filter((e) => !cf || e.city_slug === cf).map(eventCard);
    return [...ev, ...ex].filter((c) => (filter === "hidden" ? c.hidden : !c.hidden && (filter === "all" || c.kind === filter))
      && (!q || `${c.title} ${c.area} ${c.sub}`.toLowerCase().includes(q.toLowerCase())));
  }, [events, hiddenKeys, city, lockCity, filter, q]);

  function openAdd(card: Card) {
    const f = { ...card.form };
    const startT = (f.starts || "").slice(-5) || "19:00", endT = (f.ends || "").slice(-5) || "21:00";
    const d = new Date(Date.now() + 2 * 864e5); const date = d.toISOString().slice(0, 10);
    setErr(""); setAdd({ card, date, f: { ...f, city_slug: lockCity ?? card.city, starts: `${date}T${startT}`, ends: `${date}T${endT}`, closes: "", host_id: admin ? f.host_id : "" } });
  }
  const setWhen = (date: string, st: string, en: string) => add && setAdd({ ...add, date, f: { ...add.f, starts: `${date}T${st}`, ends: `${date}T${en}`, closes: "" } });

  async function create(ev: React.MouseEvent<HTMLButtonElement>) {
    if (!add || !auth.client) return;
    // end before start on the same date = goes past midnight
    let f = add.f;
    if (f.ends <= f.starts) { const e = new Date(f.ends); e.setDate(e.getDate() + 1); f = { ...f, ends: `${e.toISOString().slice(0, 10)}T${f.ends.slice(-5)}` }; }
    const p = validateEvent(f); if (p) return setErr(p);
    setErr(""); setBusy(true);
    const btn = ev.currentTarget;
    const payload = formToPayload(f);
    if (admin) {
      const id = await auth.client.rpc("admin_save_event_draft", { p_id: null, p_payload: payload });
      if (id.error) { setBusy(false); return setErr(id.error.message); }
      const no = await auth.client.rpc("admin_submit_request", { p_entity: "event", p_action: "create", p_target: id.data, p_payload: null, p_note: `Added from the Event library (${add.card.title})` });
      setBusy(false);
      if (no.error) return setErr(no.error.message);
      burstFrom(btn, ["🎉", "✨", "📅"], 12); toast(`${no.data} sent ✓ The other admin approves it`); setAdd(null); onChange?.(); goApprovals?.(String(no.data));
    } else {
      const id = await auth.client.rpc("host_save_event_draft", { p_id: null, p_payload: payload });
      if (id.error) { setBusy(false); return setErr(id.error.message); }
      const no = await auth.client.rpc("host_submit_event", { p_id: id.data, p_note: null });
      setBusy(false);
      if (no.error) return setErr(no.error.message);
      burstFrom(btn, ["🎉", "✨", "📅"], 12); toast(`Sent to the team ✓ (${no.data})`); setAdd(null); onChange?.();
    }
  }

  async function remove(card: Card) {
    if (!auth.client) return;
    if (card.kind === "example") {
      if (card.hidden) { const { error } = await auth.client.rpc("admin_hide_template", { p_key: card.templateKey, p_hide: false }); if (error) return toast("⚠️ " + error.message); toast("Back on the site ✓"); reloadHidden(); return; }
      if (!(await confirm({ title: `Remove "${card.title}" from the site?`, body: "Every date of this example plan disappears from the website. You can bring it back from Removed.", danger: true, ok: "Remove" }))) return;
      const { error } = await auth.client.rpc("admin_hide_template", { p_key: card.templateKey, p_hide: true });
      if (error) return toast("⚠️ " + error.message);
      toast("Removed from the site ✓"); reloadHidden(); return;
    }
    const e = card.ev!;
    if (e.status === "draft") {
      if (!(await confirm({ title: `Delete the draft "${e.title}"?`, danger: true, ok: "Delete draft" }))) return;
      const { error } = await auth.client.rpc("admin_discard_draft", { p_id: e.id });
      if (error) return toast("⚠️ " + error.message); toast("Draft deleted"); onChange?.(); return;
    }
    if (e.pending_req) { toast(`${e.pending_req} is already waiting for approval`); goApprovals?.(e.pending_req); return; }
    const note = await ask(`Delete "${e.title}"?`, "Why delete it? (kept in history, the other admin approves)", { required: true, ok: "Request delete" });
    if (!note) return;
    const { data, error } = await auth.client.rpc("admin_submit_request", { p_entity: "event", p_action: "delete", p_target: e.id, p_payload: {}, p_note: note });
    if (error) return toast("⚠️ " + error.message);
    toast(`${data} sent ✓ The other admin approves it`); onChange?.(); reloadCustom(); goApprovals?.(String(data));
  }

  const startT = add?.f.starts.slice(-5) ?? "", endT = add?.f.ends.slice(-5) ?? "";
  return (
    <section className="lib">
      <div className="lib-head">
        <div><b>📚 Event library</b><small>{admin ? "Every event on the site. Add a new date from any card, or delete." : "Pick any event and add your own date. The team approves it."}</small></div>
      </div>
      <div className="lib-bar">
        <input className="adm-search" placeholder="Search events…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" />
        {!lockCity && <select className="select" value={city} onChange={(e) => setCity(e.target.value)} aria-label="City"><option value="">All cities</option>{CITIES.map((c) => <option key={c} value={c}>{cityName(c)}</option>)}</select>}
      </div>
      <div className="adm-seg">{FILTERS.filter(([k]) => admin || k !== "hidden").map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}</div>
      {events === null && admin ? <div className="skeleton" style={{ minHeight: 200 }} /> : !cards.length ? <p className="muted">Nothing here.</p> : (
        <div className="lib-grid">
          {cards.map((c, i) => (
            <motion.article key={c.id} className={`lib-card${c.hidden ? " hidden" : ""}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.02 }}>
              <div className="lib-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.image ? <img src={c.image} alt="" loading="lazy" /> : <span aria-hidden="true">{c.emoji}</span>}
                <span className={`lib-kind k-${c.kind}`}>{c.kind === "example" ? "Example" : "Event"}</span>
              </div>
              <div className="lib-body">
                <b>{c.title}</b>
                <small>{cityName(c.city)}{c.area ? ` · ${c.area}` : ""}</small>
                <small className="muted">{c.sub}</small>
                {c.status && <Chip s={c.status} />}
                {c.hidden && <small className="lib-off">Removed from the site</small>}
              </div>
              <div className="lib-acts">
                {!c.hidden && <button className="btn btn-sun btn-sm" onClick={() => openAdd(c)}>＋ Add date</button>}
                {admin && <button className="btn btn-white btn-sm" onClick={() => remove(c)} aria-label={c.hidden ? `Restore ${c.title}` : `Delete ${c.title}`}>{c.hidden ? "↺ Restore" : "🗑"}</button>}
              </div>
            </motion.article>
          ))}
        </div>
      )}

      <Modal open={!!add} onClose={() => setAdd(null)} title={add ? `Add a date: ${add.card.title}` : ""}>
        {add && <>
          <p className="adm-note">Everything else is copied from this event. {admin ? "The other admin approves it before it goes live." : "The team approves it before it goes live."}</p>
          <div className="adm-form lib-when">
            {admin && !lockCity && <div className="field"><label htmlFor="lib-city">City</label><select id="lib-city" value={add.f.city_slug} onChange={(e) => setAdd({ ...add, f: { ...add.f, city_slug: e.target.value, host_id: "" } })}>{CITIES.map((c) => <option key={c} value={c}>{cityName(c)}</option>)}</select></div>}
            <div className="field"><label htmlFor="lib-date">Date *</label><input id="lib-date" type="date" min={new Date().toISOString().slice(0, 10)} value={add.date} onChange={(e) => setWhen(e.target.value, startT, endT)} /></div>
            <div className="field-row dt-row">
              <div className="field"><label htmlFor="lib-st">Starts *</label><input id="lib-st" type="time" value={startT} onChange={(e) => setWhen(add.date, e.target.value, endT)} /></div>
              <div className="field"><label htmlFor="lib-en">Ends *</label><input id="lib-en" type="time" value={endT} onChange={(e) => setWhen(add.date, startT, e.target.value)} /></div>
            </div>
            <div className="field"><label htmlFor="lib-area">Area</label><input id="lib-area" value={add.f.area} maxLength={60} onChange={(e) => setAdd({ ...add, f: { ...add.f, area: e.target.value } })} /></div>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>{add.f.price_type === "free" ? "Free" : `₹${add.f.price} ${add.f.price_type}`} · {add.f.seats} seats · bookings close 4 hours before the start</p>
          {err && <p className="form-msg err" role="alert">{err}</p>}
          <div className="adm-row-end">
            <button className="btn btn-white btn-sm" onClick={() => setAdd(null)}>Close</button>
            <button className="btn btn-ink btn-sm" disabled={busy} onClick={create}>{busy ? "Sending…" : admin ? "Add & send for approval" : "Add & send to the team"}</button>
          </div>
        </>}
      </Modal>
      {ui}
    </section>
  );
}
