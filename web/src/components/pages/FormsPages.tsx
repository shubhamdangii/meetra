"use client";
// Brands/venues form. Hands the request to WhatsApp. (Hosting lives in HostPage.tsx.)
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Reveal, WhatsAppDone } from "../ui";
import { CONFIG } from "@/lib/config";
import { whatsappLink } from "@/lib/events";

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
