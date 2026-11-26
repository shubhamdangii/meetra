"use client";
// Brands/venues form: saved for the team (Admin → Brands), with an optional WhatsApp nudge.
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useApp } from "../AppProvider";
import { burstFrom } from "../fx";
import { Reveal } from "../ui";
import { CONFIG } from "@/lib/config";
import { whatsappLink } from "@/lib/events";
import { getSupabase } from "@/lib/supabase";

const KINDS = [["venue", "🏠", "My venue", "café, studio, rooftop, court"], ["brand", "✨", "My brand", "sponsor a series"], ["team", "🏢", "My team", "a private social"], ["other", "💬", "Something else", ""]] as const;

export function PartnerForm() {
  const { city, toast } = useApp();
  const [v, setV] = useState({ name: "", company: "", kind: "venue", phone: "", email: "", link: "", msg: "", trap: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [done, setDone] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (v.trap) return;   // bots fill hidden fields
    const phone = v.phone.replace(/\D/g, "");
    if (v.name.trim().length < 2 || v.company.trim().length < 2) return setErr("Add your name and the venue or brand name.");
    if (!phone && !v.email.trim()) return setErr("Add a WhatsApp number or an email so we can reply.");
    if (phone && !/^(91)?[6-9]\d{9}$/.test(phone)) return setErr("WhatsApp number should be a 10-digit Indian mobile.");
    if (v.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v.email.trim())) return setErr("That email doesn't look right.");
    setErr(""); setBusy(true);
    const btn = e.currentTarget.querySelector("button[type=submit]");
    const sb = getSupabase();
    const { data, error } = sb ? await sb.rpc("submit_partner_enquiry", { p_name: v.name, p_company: v.company, p_kind: v.kind, p_city: city, p_phone: phone, p_email: v.email, p_link: v.link, p_message: v.msg })
      : { data: null, error: { message: "Not connected" } };
    setBusy(false);
    if (error) return setErr(error.message);
    const code = (data as { code?: string } | null)?.code;
    if (code) { try { const all = JSON.parse(localStorage.getItem(CODES_KEY) || "[]") as string[]; localStorage.setItem(CODES_KEY, JSON.stringify([code, ...all].slice(0, 20))); } catch { /* private mode */ } }
    setTick((t) => t + 1);
    burstFrom(btn, ["🤝", "✨", "🎉"], 14); toast("Sent ✓ The team will reach out within 2 working days");
    setDone(`Hi ${CONFIG.brand}! I just sent a partnership enquiry for ${v.company} (${v.kind}).`);
  }

  return (
    <Reveal className="panel">
      <AnimatePresence mode="wait">
        {done ? (
          <motion.div key="done" className="status-card s-approved" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="st-ic">🤝</div><b>Got it, {v.name.split(" ")[0]}!</b>
            <p>Your enquiry is with the {CONFIG.brand} team. We reply within 2 working days on WhatsApp or email.</p>
            <a className="btn btn-white btn-sm" href={whatsappLink(done)} target="_blank" rel="noopener noreferrer" style={{ marginTop: 10 }}>In a hurry? Ping us on WhatsApp</a>
            <button className="linkish" type="button" onClick={() => { setDone(null); setV({ ...v, company: "", msg: "", link: "" }); }}>Send another enquiry</button>
          </motion.div>
        ) : (
          <motion.form key="form" exit={{ opacity: 0 }} onSubmit={submit} noValidate>
            <h2 style={{ fontSize: 30, marginBottom: 6 }}>Let&apos;s talk</h2>
            <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>Takes 30 seconds. No login needed.</p>
            <div className="pk-kinds" role="radiogroup" aria-label="What would you like to do?">
              {KINDS.map(([k, ic, t, s]) => (
                <button key={k} type="button" role="radio" aria-checked={v.kind === k} className={v.kind === k ? "on" : ""} onClick={() => setV({ ...v, kind: k })}>
                  <span>{ic}</span><b>{t}</b>{s && <small>{s}</small>}
                </button>
              ))}
            </div>
            <div className="pk-row">
              <div className="field"><label htmlFor="pn">Your name</label><input id="pn" autoComplete="name" value={v.name} onChange={set("name")} /></div>
              <div className="field"><label htmlFor="pb">{v.kind === "team" ? "Company" : "Venue or brand"}</label><input id="pb" autoComplete="organization" value={v.company} onChange={set("company")} /></div>
            </div>
            <div className="pk-row">
              <div className="field"><label htmlFor="pp">WhatsApp number</label><input id="pp" inputMode="tel" autoComplete="tel" placeholder="98xxxxxxxx" value={v.phone} onChange={set("phone")} /></div>
              <div className="field"><label htmlFor="pe">Email</label><input id="pe" type="email" autoComplete="email" value={v.email} onChange={set("email")} /></div>
            </div>
            <div className="field"><label htmlFor="pl">Instagram or website (optional)</label><input id="pl" value={v.link} onChange={set("link")} placeholder="@yourcafe" /></div>
            <div className="field"><label htmlFor="pm">Tell us a little (optional)</label><textarea id="pm" rows={3} maxLength={1500} value={v.msg} onChange={set("msg")} placeholder="Space size, best days, what you have in mind…" /></div>
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={v.trap} onChange={set("trap")} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", clipPath: "inset(50%)", whiteSpace: "nowrap", border: 0, padding: 0, margin: -1 }} />
            {err && <p className="form-msg err" role="alert">{err}</p>}
            <motion.button whileTap={{ scale: 0.96 }} className="btn btn-ink btn-block" type="submit" disabled={busy}>{busy ? "Sending…" : "Send enquiry →"}</motion.button>
          </motion.form>
        )}
      </AnimatePresence>
      <MyEnquiries tick={tick} />
    </Reveal>
  );
}

const CODES_KEY = "mt-partner-codes";
const LEAD_STATUS: Record<string, [string, string]> = {
  new: ["📨 Received", "The team will reply within 2 working days."], talking: ["💬 In discussion", "Someone from the team is talking to you."],
  won: ["🎉 Partnered", "Welcome aboard!"], not_now: ["🕒 Not right now", "We'll keep your details for future plans."],
};
/** Enquiries sent from this device (or while logged in), with their current status. */
function MyEnquiries({ tick }: { tick: number }) {
  const [rows, setRows] = useState<{ id: number; company: string; kind: string; status: string; created_at: string; updated_at: string }[] | null>(null);
  useEffect(() => {
    let codes: string[] = [];
    try { codes = JSON.parse(localStorage.getItem(CODES_KEY) || "[]"); } catch { /* ignore */ }
    const sb = getSupabase(); if (!sb) return;
    sb.rpc("my_partner_enquiries", { p_codes: codes }).then(({ data, error }) => setRows(error ? [] : ((data as typeof rows) ?? [])));
  }, [tick]);
  if (!rows || !rows.length) return null;
  return (
    <div className="my-leads">
      <b>Your enquiries</b>
      {rows.map((r) => (
        <div key={r.id} className={`ml-row s-${r.status}`}>
          <div><b>{r.company}</b><small>{r.kind} · sent {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small></div>
          <span title={LEAD_STATUS[r.status]?.[1]}>{LEAD_STATUS[r.status]?.[0] ?? r.status}</span>
        </div>
      ))}
    </div>
  );
}
