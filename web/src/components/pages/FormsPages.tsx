"use client";
// Host-a-meetup and brands/venues forms. Both hand the request to WhatsApp.
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { Reveal, WhatsAppDone } from "../ui";
import { CONFIG } from "@/lib/config";
import { whatsappLink } from "@/lib/events";

const PERKS = [
  ["🙋", "var(--sun)", "We fill the table", "Your plan goes in front of our whole community in your city, every week."],
  ["📍", "var(--mint)", "Venues sorted", "Partner cafés, courts and studios that already know us."],
  ["💸", "#FFB3CB", "Earn from every plan", "A share of every paid seat, paid out weekly."],
  ["🧰", "var(--sky)", "A host playbook", "Icebreakers, running orders and a buddy host for your first plan."],
  ["✓", "var(--violet)", "The blue tick", "After a quick call with our team, you're a verified host."],
];

export function HostForm() {
  const { city } = useApp();
  const auth = useAuth();
  const [v, setV] = useState({ n: auth.me?.display_name && auth.me.display_name !== "New member" ? auth.me.display_name : "", c: CONFIG.cities[city]?.name ?? CONFIG.cities[CONFIG.defaultCity].name, p: "", w: "", ig: "" });
  const [text, setText] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <section className="split" style={{ paddingBottom: 40 }}>
      <div className="perks">
        {PERKS.map(([ic, bg, t, d], i) => (
          <Reveal key={t} delay={i * 0.06} className="perk"><span className="ic" style={{ background: bg, color: bg === "var(--violet)" ? "#fff" : undefined }}>{ic}</span><div><b>{t}</b><p>{d}</p></div></Reveal>
        ))}
      </div>
      <Reveal className="panel">
        <AnimatePresence mode="wait">
          {text ? <WhatsAppDone key="done" text={text} heading="Love it — one last tap" link={whatsappLink(text)} /> : (
            <motion.form key="form" exit={{ opacity: 0 }} onSubmit={(e) => {
              e.preventDefault();
              if (!auth.requireLogin("/host/")) return;
              setText(`Hi! I'd like to host on ${CONFIG.brand}.\n\nName: ${v.n}\nCity: ${v.c}\nPlan: ${v.p}\nWhy: ${v.w}${v.ig ? "\nInstagram: " + v.ig : ""}`);
            }}>
              <h2 style={{ fontSize: 30, letterSpacing: "-.04em", marginBottom: 6 }}>Pitch your plan</h2>
              <p className="muted" style={{ marginBottom: 18 }}>Takes 2 minutes. We reply on WhatsApp within a day.</p>
              <div className="field"><label htmlFor="n">Your name</label><input id="n" required value={v.n} onChange={set("n")} /></div>
              <div className="field"><label htmlFor="c">City</label><select id="c" value={v.c} onChange={set("c")}>{Object.values(CONFIG.cities).map((c) => <option key={c.name}>{c.name}</option>)}<option>Somewhere else</option></select></div>
              <div className="field"><label htmlFor="p">What&apos;s the plan?</label><input id="p" required placeholder="e.g. Sunday chess + chai at a café" value={v.p} onChange={set("p")} /></div>
              <div className="field"><label htmlFor="w">Why would strangers love it?</label><textarea id="w" placeholder="What happens, who it's for, how often…" value={v.w} onChange={set("w")} /></div>
              <div className="field"><label htmlFor="ig">Instagram (optional)</label><input id="ig" placeholder="@yourhandle" value={v.ig} onChange={set("ig")} /></div>
              <motion.button whileTap={{ scale: 0.96 }} className="btn btn-sun btn-block" type="submit">Send on WhatsApp →</motion.button>
            </motion.form>
          )}
        </AnimatePresence>
      </Reveal>
    </section>
  );
}

export function PartnerForm() {
  const [v, setV] = useState({ n: "", b: "", t: "Hosting plans at my venue", m: "" });
  const [text, setText] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Reveal className="panel">
      <AnimatePresence mode="wait">
        {text ? <WhatsAppDone key="done" text={text} heading="Thanks — one last tap" link={whatsappLink(text)} /> : (
          <motion.form key="form" exit={{ opacity: 0 }} onSubmit={(e) => { e.preventDefault(); setText(`Hi ${CONFIG.brand}! Partnership enquiry.\n\nName: ${v.n}\nVenue/brand: ${v.b}\nInterested in: ${v.t}\n${v.m}`); }}>
            <h2 style={{ fontSize: 30, letterSpacing: "-.04em", marginBottom: 16 }}>Let&apos;s talk</h2>
            <div className="field"><label htmlFor="pn">Your name</label><input id="pn" required value={v.n} onChange={set("n")} /></div>
            <div className="field"><label htmlFor="pb">Venue or brand</label><input id="pb" required value={v.b} onChange={set("b")} /></div>
            <div className="field"><label htmlFor="pt">I&apos;m interested in</label><select id="pt" value={v.t} onChange={set("t")}>{["Hosting plans at my venue", "Sponsoring a series", "A private team social", "Something else"].map((o) => <option key={o}>{o}</option>)}</select></div>
            <div className="field"><label htmlFor="pm">Anything else?</label><textarea id="pm" value={v.m} onChange={set("m")} /></div>
            <motion.button whileTap={{ scale: 0.96 }} className="btn btn-ink btn-block" type="submit">Send on WhatsApp →</motion.button>
          </motion.form>
        )}
      </AnimatePresence>
    </Reveal>
  );
}
