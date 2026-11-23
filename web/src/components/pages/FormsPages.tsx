"use client";
// Brands/venues form: saved for the team (Admin → Brands), with an optional WhatsApp nudge.
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
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
    const { error } = sb ? await sb.rpc("submit_partner_lead", { p_name: v.name, p_company: v.company, p_kind: v.kind, p_city: city, p_phone: phone, p_email: v.email, p_link: v.link, p_message: v.msg })
      : { error: { message: "Not connected" } };
    setBusy(false);
    if (error) return setErr(error.message.replace(/^.*?: /, ""));
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
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={v.trap} onChange={set("trap")} style={{ position: "absolute", left: -9999, width: 1, height: 1 }} />
            {err && <p className="form-msg err" role="alert">{err}</p>}
            <motion.button whileTap={{ scale: 0.96 }} className="btn btn-ink btn-block" type="submit" disabled={busy}>{busy ? "Sending…" : "Send enquiry →"}</motion.button>
          </motion.form>
        )}
      </AnimatePresence>
    </Reveal>
  );
}
