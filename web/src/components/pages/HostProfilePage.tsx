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

  const hosted = p.events.filter((e) => e.status === "approved").length;
  const cityLabel = CONFIG.cities[p.city]?.name ?? p.city;
  const cover = p.gallery[0] ?? null;
  const avg = count ? Number(p.avg_rating) : null;
  const share = async () => {
    const url = window.location.href;
    try { if (navigator.share) await navigator.share({ title: `${p.name} on ${CONFIG.brand}`, url }); else { await navigator.clipboard.writeText(url); } } catch { /* cancelled */ }
  };
  return (
    <div className="hp2">
      <section className="hp2-cover" style={cover ? { backgroundImage: `linear-gradient(180deg,rgba(22,18,43,.15),rgba(22,18,43,.65)),url(${cover})` } : undefined} aria-hidden="true">
        <span className="hp2-orb a" /><span className="hp2-orb b" />
      </section>
      <div className="wrap">
        <section className="hp2-head">
          <motion.div className="hp2-photo" initial={{ scale: 0.85, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 220, damping: 18 }}>
            <HostPhoto h={p} className="hp2-av" />
            <span className="hp2-tick" title="Verified by the meetra team" aria-label="Verified host">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5l2.6 1.9 3.2-.2 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3.1L2.6 15.8l1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.2z" fill="#2F7BFF" /><path d="M7.5 12.3l3 3 6-6.3" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          </motion.div>
          <div className="hp2-id">
            <span className="hp2-eyebrow">{CONFIG.brand} host · {cityLabel}</span>
            <h1>{p.name}</h1>
            <p className="hp2-verified">Verified host · checked by the {CONFIG.brand} team</p>
          </div>
          <div className="hp2-cta">
            {upcoming.length > 0 && <a className="btn btn-sun btn-sm" href="#plans">See plans</a>}
            <button type="button" className="btn btn-white btn-sm" onClick={share}>Share ↗</button>
          </div>
        </section>

        <section className="hp2-stats" aria-label="Host stats">
          {([
            [avg ? avg.toFixed(1) : "New", avg ? `rating · ${count} review${count > 1 ? "s" : ""}` : "no reviews yet", "★"],
            [String(hosted), hosted === 1 ? "plan hosted" : "plans hosted", "🎙️"],
            [String(upcoming.length), "coming up", "📅"],
            [cityLabel, "home city", "📍"],
          ] as const).map(([v, l, ic], i) => (
            <motion.div key={l} className="hp2-stat" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }}>
              <span aria-hidden="true">{ic}</span><b>{v}</b><small>{l}</small>
            </motion.div>
          ))}
        </section>

        {p.bio && <section className="hp2-bio"><h2>About {p.name.split(" ")[0]}</h2><p>{p.bio}</p></section>}

        <section className="hp2-sec" id="plans">
          <div className="hp2-h"><h2>Upcoming plans</h2>{upcoming.length > 0 && <span>{upcoming.length}</span>}</div>
          {upcoming.length ? <div className="grid">{upcoming.map((e, i) => <EventCard key={e.id} e={e} index={i} />)}</div>
            : <div className="hp2-empty"><span aria-hidden="true">🗓️</span><b>No plans on the calendar right now.</b><p>New dates are added every week. <Link href="/events/">Browse all plans →</Link></p></div>}
        </section>

        {p.gallery.length > 0 && (
          <section className="hp2-sec">
            <div className="hp2-h"><h2>From {p.name.split(" ")[0]}&apos;s tables</h2><span>{p.gallery.length}</span></div>
            <PhotoStrip photos={p.gallery.map((src) => ({ src }))} label={`Photos from ${p.name}'s meetups`} />
          </section>
        )}

        <section className="hp2-sec">
          <div className="hp2-h"><h2>Reviews</h2>{count > 0 && <span>{count}</span>}</div>
          {count ? (
            <div className="hp2-rev">
              <div className="hp2-sum">
                <b>{avg!.toFixed(1)}</b>
                <span className="st" aria-hidden="true">{"★".repeat(Math.round(avg!))}<i>{"★".repeat(5 - Math.round(avg!))}</i></span>
                <small>{count} review{count > 1 ? "s" : ""} from checked-in guests</small>
                <div className="hp-dist" aria-label="Rating breakdown">{dist.map(([st, n]) => (
                  <div key={st}><span>{st}★</span><div><motion.i initial={{ width: 0 }} whileInView={{ width: `${(n / count) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.6 }} /></div><small>{n}</small></div>
                ))}</div>
              </div>
              <ul className="hp2-list">{p.reviews.map((r, i) => (
                <Reveal key={i} delay={Math.min(i, 5) * 0.05}><li>
                  <div className="top"><span className="hp2-ini" aria-hidden="true">{(r.first_name || "?")[0]}</span><b>{r.first_name}</b><span className="st">{"★".repeat(r.rating)}<i>{"★".repeat(5 - r.rating)}</i></span></div>
                  {r.comment && <p>&ldquo;{r.comment}&rdquo;</p>}
                  <small>{r.event ?? `${CONFIG.brand} plan`} · {new Date(r.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small>
                </li></Reveal>
              ))}</ul>
            </div>
          ) : <div className="hp2-empty"><span aria-hidden="true">💬</span><b>No reviews yet.</b><p>Only guests who were checked in at a plan can leave a review.</p></div>}
        </section>

        {past.length > 0 && (
          <section className="hp2-sec">
            <div className="hp2-h"><h2>Past plans</h2><span>{past.length}</span></div>
            <ul className="hp2-past">{past.map((e) => (
              <li key={e.plan_ref}><span className="em" aria-hidden="true">{e.emoji}</span><div><b>{e.title}</b><small>{new Date(e.starts_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</small></div>
                <span className="rt">{e.reviews ? <>★ {Number(e.avg_rating).toFixed(1)} <small>({e.reviews})</small></> : <small>No ratings</small>}</span></li>
            ))}</ul>
          </section>
        )}
      </div>
    </div>
  );

}
