"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { Chips, Empty, Poster, ease } from "../ui";
import { CONFIG } from "@/lib/config";
import { eventUrl, hash, hostLine, hostNames, relDay } from "@/lib/events";

const EXTRAS = ["📸", "🥂", "😂", "🎉", "🤝", "☕", "🌟", "🫶"];

export default function PastPage() {
  const { ready, past, inCity, today } = useApp();
  const [cat, setCat] = useState("all");
  const [limit, setLimit] = useState(9);
  const list = past.filter((e) => inCity(e) && (cat === "all" || e.cat === cat));
  return (
    <div className="wrap">
      <section className="page-hero">
        <span className="eyebrow">Past nights</span>
        <h1>Been there, <span className="serif">together.</span></h1>
        <p>From the first awkward hello to the group photo at the end. A look inside the plans that already happened.</p>
        {CONFIG.showSampleNotice && <div style={{ marginTop: 16 }}><span className="notice">📷 Add real photos by setting <b>image</b> on a plan in src/lib/data.ts</span></div>}
      </section>
      <Chips value={cat} onChange={(c) => { setCat(c); setLimit(9); }} />
      <div className="stories">
        {!ready && [0, 1, 2].map((i) => <div key={i} className="skeleton" />)}
        {ready && !list.length && <Empty title="No past nights here yet.">Check back after the first few plans.</Empty>}
        {list.slice(0, limit).map((e, i) => {
          const h = hash(e.id);
          const a = { ...e, emoji: EXTRAS[h % 8], pal: (e.pal + 3) % 10, pattern: "dots" };
          const b = { ...e, emoji: EXTRAS[(h >> 3) % 8], pal: (e.pal + 6) % 10, pattern: "stripes" };
          return (
            <motion.div key={e.id} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.5, ease, delay: (i % 3) * 0.08 }} whileHover={{ y: -6, rotate: -0.6 }}>
              <Link className="story" href={eventUrl(e)} style={{ display: "block" }}>
                <div className="collage"><Poster e={e} /><Poster e={a} badge={false} /><Poster e={b} badge={false} /></div>
                <div className="sb"><span className="eyebrow">{relDay(e.date, today)} · {e.area}</span><h3>{e.title}</h3>
                  <span className="muted" style={{ fontSize: 14 }}>{e.seats - (h % 4)} strangers · {hostLine(e).replace(/^Hosted/, "hosted")}</span></div>
              </Link>
            </motion.div>
          );
        })}
      </div>
      {list.length > limit && <div className="more-row"><motion.button whileTap={{ scale: 0.95 }} className="btn btn-sun" onClick={() => setLimit((n) => n + 9)}>Load more stories ↓</motion.button></div>}
    </div>
  );
}
