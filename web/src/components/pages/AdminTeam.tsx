"use client";
// Admin tabs: door check-in (QR scanner + guest list), plans added from here,
// and the team (main admin only). The database checks every permission again.
import { AnimatePresence, motion } from "framer-motion";
import jsQR from "jsqr";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { burst, buzz } from "../fx";
import { CONFIG } from "@/lib/config";
import { CATEGORIES } from "@/lib/data";
import { type CustomPlan, type MeetEvent, customPlanId, eventUrl, relDay } from "@/lib/events";

const cityName = (c: string) => CONFIG.cities[c]?.name ?? c;

/* ======================= Door check-in ======================= */
type G = { request_id: number; display_name: string; full_name: string | null; avatar_url: string | null; phone: string | null; status: string; party_size: number };
type Hit = { kind: "ok" | "again" | "bad"; title: string; sub?: string; avatar?: string | null };

export function AdminCheckIn({ plans }: { plans: MeetEvent[] }) {
  const auth = useAuth();
  const { toast, today } = useApp();
  const [plan, setPlan] = useState(plans[0]?.id ?? "");
  const [guests, setGuests] = useState<G[] | null>(null);
  const [scan, setScan] = useState(false);
  const [hit, setHit] = useState<Hit | null>(null);
  const [code, setCode] = useState("");
  useEffect(() => { if (!plan && plans[0]) setPlan(plans[0].id); }, [plans, plan]);

  const load = useCallback(async () => {
    if (!auth.client || !plan) return;
    const { data, error } = await auth.client.rpc("admin_plan_queue", { p_plan_ref: plan });
    if (error) return toast("Couldn't load guests: " + error.message);
    setGuests((data as G[]).filter((g) => g.status === "approved" || g.status === "attended"));
  }, [auth.client, plan, toast]);
  useEffect(() => { setGuests(null); load(); }, [load]);

  const checkIn = useCallback(async (id: number, undo = false) => {
    if (!auth.client) return;
    const { data, error } = await auth.client.rpc("admin_check_in", { p_request_id: id, p_plan_ref: plan || null, p_undo: undo });
    if (error) { setHit({ kind: "bad", title: "Can't let in", sub: error.message }); buzz(300); return; }
    const r = (data as any[])[0];
    if (undo) { toast(`${r.display_name} un-checked`); load(); return; }
    setHit(r.already ? { kind: "again", title: `${r.display_name} is already in`, sub: "Scanned before. Same pass twice?", avatar: r.avatar_url }
      : { kind: "ok", title: `${r.display_name}${r.party_size > 1 ? " +1" : ""}`, sub: "Checked in ✓ Welcome them!", avatar: r.avatar_url });
    if (!r.already) { buzz(60); burst(innerWidth / 2, innerHeight / 2, ["✅", "🎉", "✨"], 14); } else buzz(200);
    load();
  }, [auth.client, plan, toast, load]);

  const onCode = useCallback((text: string) => {
    const m = /-PASS:(\d+):/.exec(text) ?? /^#?0*(\d{1,9})$/.exec(text.trim());
    if (!m) { setHit({ kind: "bad", title: "Not a meetra pass", sub: text.slice(0, 60) }); buzz(300); return; }
    checkIn(Number(m[1]));
  }, [checkIn]);

  const inCount = guests?.filter((g) => g.status === "attended").reduce((s, g) => s + g.party_size, 0) ?? 0;
  const total = guests?.reduce((s, g) => s + g.party_size, 0) ?? 0;
  const sel = plans.find((p) => p.id === plan);

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ci">
      {!plans.length ? <div className="setup-note">No plans today or tomorrow in your cities.</div> : <>
        <div className="toolbar2">
          <select className="select" value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan at the door">
            {plans.map((p) => <option key={p.id} value={p.id}>{relDay(p.date, today)} · {p.time} · {p.title} ({cityName(p.city)})</option>)}
          </select>
        </div>
        <div className="ci-top">
          <div className="ci-count"><b>{inCount}</b><span>/ {total} in</span><i style={{ width: total ? `${(inCount / total) * 100}%` : 0 }} /></div>
          <button className={`btn ${scan ? "btn-white" : "btn-sun"}`} onClick={() => { setScan((s) => !s); setHit(null); }}>{scan ? "Stop camera" : "📷 Scan passes"}</button>
        </div>
        {scan && <Scanner onCode={onCode} paused={!!hit} />}
        <AnimatePresence>
          {hit && (
            <motion.button key={hit.title} className={`ci-hit ${hit.kind}`} onClick={() => setHit(null)} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {hit.avatar ? <img src={hit.avatar} alt="" /> : <span className="ci-ic">{hit.kind === "ok" ? "✅" : hit.kind === "again" ? "⚠️" : "⛔"}</span>}
              <span><b>{hit.title}</b><small>{hit.sub}</small><small className="muted">Tap to scan the next one</small></span>
            </motion.button>
          )}
        </AnimatePresence>
        <form className="ci-manual" onSubmit={(e) => { e.preventDefault(); if (code.trim()) onCode(code); setCode(""); }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="Or type the pass number, e.g. 00123" aria-label="Pass number" />
          <button className="btn btn-ink btn-sm" type="submit">Check in</button>
        </form>
        <div className="group-head" style={{ marginTop: 18 }}><h3 style={{ fontSize: 20 }}>Guest list</h3><span>{sel && <Link href={eventUrl(sel)} style={{ textDecoration: "underline" }}>plan page</Link>}</span></div>
        <div className="ci-list">
          {!guests ? <div className="skeleton" style={{ minHeight: 80 }} /> : !guests.length ? <p className="muted">No confirmed guests yet. Approve requests in the Requests tab.</p> : guests.map((g) => {
            const inn = g.status === "attended";
            return (
              <div key={g.request_id} className={`ci-row ${inn ? "in" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {g.avatar_url ? <img src={g.avatar_url} alt="" /> : <span className="ph">{(g.display_name || "?")[0]}</span>}
                <span className="ci-name"><b>{g.full_name || g.display_name}{g.party_size > 1 ? " +1" : ""}</b><small>#{String(g.request_id).padStart(5, "0")}{g.phone ? ` · ${g.phone}` : ""}</small></span>
                {inn ? <button className="pill on" onClick={() => checkIn(g.request_id, true)} title="Undo">✓ In</button>
                  : <button className="pill" onClick={() => checkIn(g.request_id)}>Check in</button>}
              </div>
            );
          })}
        </div>
      </>}
    </motion.section>
  );
}

/** Rear camera + jsQR. Works in any modern phone browser over https. */
function Scanner({ onCode, paused }: { onCode: (t: string) => void; paused: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const last = useRef({ t: "", at: 0 });
  const cb = useRef(onCode); cb.current = onCode;
  const pausedRef = useRef(paused); pausedRef.current = paused;
  useEffect(() => {
    let stream: MediaStream | null = null; let raf = 0; let alive = true;
    const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d", { willReadFrequently: true });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
        if (!alive || !video.current) return;
        video.current.srcObject = stream; await video.current.play();
        let tick = 0;
        const loop = () => {
          if (!alive) return;
          raf = requestAnimationFrame(loop);
          if (++tick % 6 || pausedRef.current) return;           // ~10 scans a second
          const v = video.current; if (!v || !ctx || v.readyState < 2) return;
          const s = Math.min(v.videoWidth, v.videoHeight), w = Math.min(640, s);
          canvas.width = w; canvas.height = w;
          ctx.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, w, w);
          const q = jsQR(ctx.getImageData(0, 0, w, w).data, w, w, { inversionAttempts: "dontInvert" });
          if (q?.data && (q.data !== last.current.t || Date.now() - last.current.at > 4000)) { last.current = { t: q.data, at: Date.now() }; cb.current(q.data); }
        };
        loop();
      } catch (e) { setErr((e as Error).name === "NotAllowedError" ? "Camera permission was refused. Allow the camera in the browser settings, or type pass numbers below." : "Couldn't open the camera on this device. Type pass numbers below."); }
    })();
    return () => { alive = false; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  if (err) return <div className="setup-note">{err}</div>;
  return (
    <div className="ci-cam">
      <video ref={video} playsInline muted />
      <span className="ci-frame" aria-hidden="true" /><span className="ci-laser" aria-hidden="true" />
      <small>Point at the QR on the guest&apos;s door pass</small>
    </div>
  );
}

/* ======================= Plans added from the admin page ======================= */
const EMPTY = { city_slug: "", title: "", category: "food", starts_on: "", time_label: "8 pm", end_label: "10 pm", area: "", price: 99,
  price_type: "reservation" as CustomPlan["price_type"], seats: 12, emoji: "✨", blurb: "", steps: "", tags: "", host_name: "" };

export function AdminPlans({ cities }: { cities: string[] }) {
  const auth = useAuth();
  const { toast, reloadCustom } = useApp();
  const [list, setList] = useState<CustomPlan[] | null>(null);
  const [f, setF] = useState({ ...EMPTY, city_slug: cities[0] ?? "" });
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof EMPTY, v: string | number) => setF((x) => ({ ...x, [k]: v }));

  const load = useCallback(async () => {
    if (!auth.client) return;
    const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const { data, error } = await auth.client.from("custom_plans").select("*").in("city_slug", cities).gte("starts_on", from).order("starts_on");
    if (error) return toast("Couldn't load plans: " + error.message);
    setList(data as CustomPlan[]);
  }, [auth.client, cities, toast]);
  useEffect(() => { load(); }, [load]);

  async function save(ev: React.FormEvent) {
    ev.preventDefault(); if (!auth.client) return;
    const row = {
      city_slug: f.city_slug, title: f.title.trim(), category: f.category, starts_on: f.starts_on, time_label: f.time_label.trim(), end_label: f.end_label.trim() || null,
      area: f.area.trim(), price: f.price_type === "free" ? 0 : Number(f.price) || 0, price_type: f.price_type, seats: Number(f.seats) || 12,
      emoji: f.emoji.trim() || "✨", blurb: f.blurb.trim(), host_name: f.host_name.trim() || null,
      steps: f.steps.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6), tags: f.tags.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3),
    };
    setBusy(true);
    const res = editing ? await auth.client.from("custom_plans").update(row).eq("id", editing) : await auth.client.from("custom_plans").insert(row);
    setBusy(false);
    if (res.error) return toast("Couldn't save: " + res.error.message);
    toast(editing ? "Plan updated ✓" : "Plan is live 🎉"); burst(innerWidth / 2, innerHeight / 3);
    setF({ ...EMPTY, city_slug: f.city_slug }); setEditing(null); load(); reloadCustom();
  }
  async function setStatus(p: CustomPlan, status: string) {
    if (!auth.client) return;
    if (status === "cancelled" && !confirm(`Cancel "${p.title}"? Guests who asked for a seat keep their request but the plan shows as gone.`)) return;
    const { error } = await auth.client.from("custom_plans").update({ status }).eq("id", p.id);
    if (error) return toast("Couldn't update: " + error.message);
    toast("Updated ✓"); load(); reloadCustom();
  }
  const edit = (p: CustomPlan) => {
    setEditing(p.id);
    setF({ city_slug: p.city_slug, title: p.title, category: p.category, starts_on: p.starts_on, time_label: p.time_label, end_label: p.end_label ?? "", area: p.area,
      price: p.price, price_type: p.price_type, seats: p.seats, emoji: p.emoji, blurb: p.blurb, steps: p.steps.join("\n"), tags: p.tags.join(", "), host_name: p.host_name ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ap">
      <form className="panel ap-form" onSubmit={save}>
        <h3>{editing ? "Edit plan" : "Launch a new plan"}</h3>
        <p className="muted" style={{ fontSize: 14 }}>It goes live on the website straight away, next to the regular plans{cities.length < Object.keys(CONFIG.cities).length ? ` (your cities: ${cities.map(cityName).join(", ")})` : ""}.</p>
        <div className="field-row">
          <div className="field"><label>City</label><select className="select" value={f.city_slug} onChange={(e) => set("city_slug", e.target.value)} required>{cities.map((c) => <option key={c} value={c}>{cityName(c)}</option>)}</select></div>
          <div className="field"><label>Category</label><select className="select" value={f.category} onChange={(e) => set("category", e.target.value)}>{(CATEGORIES as { id: string; label: string }[]).filter((c) => c.id !== "all").map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
        </div>
        <div className="field"><label>Title</label><input required minLength={3} maxLength={100} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Launch Night: Board Games & Chai" /></div>
        <div className="field-row">
          <div className="field"><label>Date</label><input type="date" required value={f.starts_on} onChange={(e) => set("starts_on", e.target.value)} /></div>
          <div className="field"><label>Starts</label><input required maxLength={12} value={f.time_label} onChange={(e) => set("time_label", e.target.value)} placeholder="8 pm" /></div>
          <div className="field"><label>Ends</label><input maxLength={12} value={f.end_label} onChange={(e) => set("end_label", e.target.value)} placeholder="10 pm" /></div>
        </div>
        <div className="field-row">
          <div className="field"><label>Area (shown publicly)</label><input required maxLength={60} value={f.area} onChange={(e) => set("area", e.target.value)} placeholder="C-Scheme" /></div>
          <div className="field"><label>Host name</label><input maxLength={60} value={f.host_name} onChange={(e) => set("host_name", e.target.value)} placeholder="Riya" /></div>
        </div>
        <div className="field-row">
          <div className="field"><label>Price type</label><select className="select" value={f.price_type} onChange={(e) => set("price_type", e.target.value)}>
            <option value="reservation">₹ seat reservation</option><option value="per person">₹ per person (all in)</option><option value="estimate">~₹ estimate</option><option value="free">Free</option></select></div>
          <div className="field"><label>Price ₹</label><input type="number" min={0} max={100000} disabled={f.price_type === "free"} value={f.price_type === "free" ? 0 : f.price} onChange={(e) => set("price", e.target.value)} /></div>
          <div className="field"><label>Seats</label><input type="number" min={2} max={500} value={f.seats} onChange={(e) => set("seats", e.target.value)} /></div>
          <div className="field"><label>Emoji</label><input maxLength={4} value={f.emoji} onChange={(e) => set("emoji", e.target.value)} /></div>
        </div>
        <div className="field"><label>What happens (1–3 sentences)</label><textarea maxLength={600} value={f.blurb} onChange={(e) => set("blurb", e.target.value)} placeholder="Come solo. We start with a quick game, then…" /></div>
        <div className="field"><label>Running order (one step per line, optional)</label><textarea value={f.steps} onChange={(e) => set("steps", e.target.value)} placeholder={"Ice-breaker game\nDinner together\nGroup photo"} /></div>
        <div className="field"><label>Tags (comma separated, optional)</label><input value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="Launch, Women only" /></div>
        {editing && <p className="fine">Changing the date gives the plan a new link; requests stay on the old date.</p>}
        <div className="plan-btns">
          <button className="btn btn-sun" disabled={busy} type="submit">{editing ? "Save changes" : "Publish plan 🚀"}</button>
          {editing && <button className="btn btn-white" type="button" onClick={() => { setEditing(null); setF({ ...EMPTY, city_slug: f.city_slug }); }}>Cancel edit</button>}
        </div>
      </form>

      <div className="group-head" style={{ marginTop: 24 }}><h3 style={{ fontSize: 20 }}>Plans added here</h3><span>{list?.length ?? ""}</span></div>
      <div className="ci-list">
        {!list ? <div className="skeleton" style={{ minHeight: 80 }} /> : !list.length ? <p className="muted">Nothing yet. Your first launch goes here.</p> : list.map((p) => (
          <div key={p.id} className={`ci-row ${p.status !== "published" ? "off" : ""}`}>
            <span className="ph">{p.emoji}</span>
            <span className="ci-name"><b>{p.title}</b><small>{p.starts_on} · {p.time_label} · {p.area}, {cityName(p.city_slug)} · {p.status}</small></span>
            <span className="ap-acts">
              {p.status === "published" && <Link className="pill" href={eventUrl(customPlanId(p))}>Open</Link>}
              <button className="pill" onClick={() => edit(p)}>Edit</button>
              {p.status === "published" ? <button className="pill" onClick={() => setStatus(p, "hidden")}>Hide</button> : <button className="pill" onClick={() => setStatus(p, "published")}>Publish</button>}
              {p.status !== "cancelled" && <button className="pill" onClick={() => setStatus(p, "cancelled")}>Cancel</button>}
            </span>
          </div>
        ))}
      </div>
    </motion.section>
  );
}

/* ======================= Team (main admin only) ======================= */
type T = { user_id: string; display_name: string; email: string | null; avatar_url: string | null; is_super: boolean; cities: string[] };

export function AdminTeam() {
  const auth = useAuth();
  const { toast } = useApp();
  const [rows, setRows] = useState<T[] | null>(null);
  const [email, setEmail] = useState(""); const [city, setCity] = useState(Object.keys(CONFIG.cities)[0]);
  const load = useCallback(async () => {
    if (!auth.client) return;
    const { data, error } = await auth.client.rpc("admin_team");
    if (error) return toast("Couldn't load team: " + error.message);
    setRows(data as T[]);
  }, [auth.client, toast]);
  useEffect(() => { load(); }, [load]);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); if (!auth.client) return;
    const { data, error } = await auth.client.rpc("admin_add_city_admin", { p_email: email.trim(), p_city: city });
    if (error) return toast(error.message);
    toast(`${data} now runs ${cityName(city)} ✓`); setEmail(""); load();
  };
  const remove = async (t: T, c: string) => {
    if (!auth.client || !confirm(`Remove ${t.display_name} as ${cityName(c)} admin?`)) return;
    const { error } = await auth.client.rpc("admin_remove_city_admin", { p_user: t.user_id, p_city: c });
    if (error) return toast(error.message);
    toast("Removed"); load();
  };
  const access = useMemo(() => [
    ["Approve / decline / waitlist seat requests", "✓", "Own city"], ["Door check-in (scan passes)", "✓", "Own city"],
    ["Launch, edit, hide plans", "✓", "Own city"], ["Host applications", "✓", "Own city"], ["Interest numbers", "✓", "Own city"],
    ["See members' contact details", "✓", "Only guests of own city"], ["Add or remove admins", "✓", "—"], ["Delete requests or plans", "✓", "—"],
  ], []);
  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <form className="panel ap-form" onSubmit={add}>
        <h3>Make someone a city admin</h3>
        <p className="muted" style={{ fontSize: 14 }}>They need to log in on the website once first (Google), so their account exists. Then add their email here.</p>
        <div className="field-row">
          <div className="field"><label>Their email</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@gmail.com" /></div>
          <div className="field"><label>City</label><select className="select" value={city} onChange={(e) => setCity(e.target.value)}>{Object.entries(CONFIG.cities).map(([k, c]) => <option key={k} value={k}>{c.name}</option>)}</select></div>
        </div>
        <button className="btn btn-sun" type="submit">Add city admin</button>
      </form>

      <div className="group-head" style={{ marginTop: 24 }}><h3 style={{ fontSize: 20 }}>The team</h3><span>{rows?.length ?? ""}</span></div>
      <div className="ci-list">
        {!rows ? <div className="skeleton" style={{ minHeight: 80 }} /> : rows.map((t) => (
          <div key={t.user_id} className="ci-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {t.avatar_url ? <img src={t.avatar_url} alt="" /> : <span className="ph">{t.display_name[0]}</span>}
            <span className="ci-name"><b>{t.display_name} {t.is_super && <span className="tag" style={{ background: "var(--sun)" }}>Main admin</span>}</b><small>{t.email ?? ""}</small></span>
            <span className="ap-acts">{t.cities.map((c) => <button key={c} className="pill" onClick={() => remove(t, c)} title="Remove">{cityName(c)} ×</button>)}</span>
          </div>
        ))}
      </div>

      <div className="tbl-wrap" style={{ marginTop: 20 }}><table>
        <thead><tr><th>What they can do</th><th>Main admin</th><th>City admin</th></tr></thead>
        <tbody>{access.map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody>
      </table></div>
    </motion.section>
  );
}
