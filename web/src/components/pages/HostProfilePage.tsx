"use client";
// /host-profile/?id=6 - a host's public page: rating, reviews, gallery and their plans.
import { motion } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "../AppProvider";
import { HostPhoto } from "../Home";
import { PhotoStrip } from "../Photos";
import { EventCard, Reveal } from "../ui";
import { CONFIG } from "@/lib/config";
import { getSupabase } from "@/lib/supabase";

type Profile = {
  id: number; name: string; city: string; bio: string; photo_url: string | null; gallery: string[]; avg_rating: number | null;
  reviews: { rating: number; comment: string; first_name: string; event: string | null; at: string }[];
  events: { plan_ref: string; title: string; starts_at: string; emoji: string; upcoming: boolean; status: string; avg_rating: number | null; reviews: number }[];
};

export default function HostProfilePage() {
  const id = Number(useSearchParams().get("id"));
  const { all, ready } = useApp();
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !id) { setP(null); return; }
    sb.rpc("public_host", { p_id: id }).then(({ data, error }) => setP(error ? null : ((data as Profile) ?? null)));
  }, [id]);

  if (p === undefined || !ready) return <div className="wrap" style={{ padding: "60px 0" }}><div className="skeleton" style={{ minHeight: 380 }} /></div>;
  if (!p) return (
    <section className="wrap page-hero"><h1>This host <span className="serif">isn&apos;t here.</span></h1><p>They may have stepped back from hosting for now.</p>
      <div style={{ marginTop: 24 }}><Link className="btn btn-sun" href="/">Back home →</Link></div></section>
  );

  const upcoming = all.filter((e) => e.hostId === p.id && e.day >= 0);
  const count = p.reviews.length;
  const dist = [5, 4, 3, 2, 1].map((s) => [s, p.reviews.filter((r) => r.rating === s).length] as const);
  const past = p.events.filter((e) => !e.upcoming && e.status === "approved");

  return (
    <div className="wrap hp">
      <section className="hp-head">
        <motion.div initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: -3, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }}>
          <HostPhoto h={p} className="hp-av" />
        </motion.div>
        <div>
          <span className="eyebrow">{CONFIG.brand} host · {CONFIG.cities[p.city]?.name ?? p.city}</span>
          <h1>{p.name} <span className="verified">✓</span></h1>
          <div className="hp-rating">
            {count ? <><b>★ {Number(p.avg_rating).toFixed(1)}</b><span>/ 5 · {count} review{count > 1 ? "s" : ""}</span></> : <span className="muted">New host · no reviews yet</span>}
          </div>
          {(() => { const hosted = p.events.filter((e) => e.status === "approved").length; const s = (n: number, w: string) => `${w}${n === 1 ? "" : "s"}`;
            return <div className="hp-stats"><span><b>{hosted}</b>{s(hosted, "plan")} hosted</span><span><b>{upcoming.length}</b>coming up</span><span><b>{count}</b>{s(count, "review")}</span></div>; })()}
          {p.bio && <p className="hp-bio">{p.bio}</p>}
        </div>
      </section>

      {p.gallery.length > 0 && (
        <section className="sec" style={{ paddingTop: 10 }}>
          <h2 className="hp-h">Gallery</h2>
          <PhotoStrip photos={p.gallery.map((src) => ({ src }))} label={`Photos from ${p.name}'s meetups`} />
        </section>
      )}

      <section className="sec" style={{ paddingTop: 10 }}>
        <h2 className="hp-h">Plans with {p.name}</h2>
        {upcoming.length ? <div className="grid">{upcoming.map((e, i) => <EventCard key={e.id} e={e} index={i} />)}</div>
          : <p className="muted">No upcoming plans right now. Check back soon.</p>}
      </section>

      <section className="sec" style={{ paddingTop: 10 }}>
        <h2 className="hp-h">What guests said</h2>
        {count > 0 && (
          <div className="hp-dist" aria-label="Rating breakdown">{dist.map(([s, n]) => (
            <div key={s}><span>{s}★</span><div><motion.i initial={{ width: 0 }} whileInView={{ width: `${(n / count) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.6 }} /></div><small>{n}</small></div>
          ))}</div>
        )}
        {count ? (
          <ul className="hp-reviews">{p.reviews.map((r, i) => (
            <Reveal key={i} delay={Math.min(i, 5) * 0.05}><li>
              <div className="top"><b>{r.first_name}</b><span className="st">{"★".repeat(r.rating)}<i>{"★".repeat(5 - r.rating)}</i></span></div>
              {r.comment && <p>“{r.comment}”</p>}
              <small>{r.event ?? "meetra plan"} · {new Date(r.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small>
            </li></Reveal>
          ))}</ul>
        ) : <p className="muted">Reviews show up here after guests who were checked in rate the plan.</p>}
      </section>

      {past.length > 0 && (
        <section className="sec" style={{ paddingTop: 10 }}>
          <h2 className="hp-h">Event-wise ratings</h2>
          <div className="tbl-wrap"><table><thead><tr><th>Plan</th><th>Date</th><th>Rating</th></tr></thead>
            <tbody>{past.map((e) => <tr key={e.plan_ref}><td>{e.emoji} {e.title}</td><td>{new Date(e.starts_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
              <td>{e.reviews ? `★ ${Number(e.avg_rating).toFixed(1)} (${e.reviews})` : "–"}</td></tr>)}</tbody></table></div>
        </section>
      )}
    </div>
  );
}
