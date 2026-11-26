"use client";
// Photo diaries: photos from a past plan, shown as a timeline ("6:50 pm · between points").
// The plan's host or the team adds them (resized in the browser first); everyone can browse.
import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import { useAuth } from "./AuthProvider";
import { Lightbox, type Photo } from "./Photos";
import { compressImage } from "@/lib/imageCompress";
import { cityName, fmtTime } from "@/lib/events";
import { getSupabase } from "@/lib/supabase";

export type DiaryRow = { plan_ref: string; title: string; city_slug: string; category: string; starts_at: string; area: string; photos: number; cover: string; first_at: string; last_at: string };
type P = { id: number; url: string; taken_at: string; caption: string | null };
const DAY = (d: Date) => d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/** Host / team: add photos to a plan's diary. */
export function DiaryUploader({ planRef, label = "📸 Add to photo diary" }: { planRef: string; label?: string }) {
  const auth = useAuth(); const { toast } = useApp();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function add(files: FileList | null) {
    if (!files?.length || !auth.client) return;
    let ok = 0; const list = Array.from(files).slice(0, 20);
    for (const [i, f] of list.entries()) {
      setBusy(`${i + 1}/${list.length}`);
      try {
        const taken = new Date(f.lastModified || Date.now()).toISOString();   // phones keep the capture time here
        const small = await compressImage(f, "event");
        const path = `diaries/${planRef}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${small.ext}`;
        const up = await auth.client.storage.from("event-media").upload(path, small.blob, { contentType: small.type, cacheControl: "31536000" });
        if (up.error) throw new Error(up.error.message);
        const url = auth.client.storage.from("event-media").getPublicUrl(path).data.publicUrl;
        const { error } = await auth.client.rpc("add_event_photo", { p_plan_ref: planRef, p_url: url, p_taken_at: taken, p_caption: null });
        if (error) throw new Error(error.message);
        ok++;
      } catch (e) { toast("⚠️ " + (e as Error).message); if (/start|60 photos|Only the host/.test((e as Error).message)) break; }
    }
    setBusy(null); if (ref.current) ref.current.value = "";
    if (ok) toast(`${ok} photo${ok > 1 ? "s" : ""} added to the diary ✓`);
  }
  return (
    <>
      <input ref={ref} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
      <button type="button" disabled={!!busy} onClick={() => ref.current?.click()}>{busy ? `Uploading ${busy}…` : label}</button>
    </>
  );
}

export function useDiaries(city: string | null) {
  const [rows, setRows] = useState<DiaryRow[] | null>(null);
  useEffect(() => {
    const sb = getSupabase(); if (!sb) { setRows([]); return; }
    sb.rpc("photo_diaries", { p_city: city }).then(({ data }) => setRows((data as DiaryRow[]) ?? []));
  }, [city]);
  return rows;
}

export function DiaryCards({ rows }: { rows: DiaryRow[] }) {
  return (
    <div className="diaries">
      {rows.map((d, i) => (
        <motion.div key={d.plan_ref} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i % 3) * 0.06 }}>
          <Link className="diary-card" href={`/past/?diary=${encodeURIComponent(d.plan_ref)}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.cover} alt="" loading="lazy" />
            <span className="dc-n">{d.photos} photo{d.photos > 1 ? "s" : ""}</span>
            <div><small>{DAY(new Date(d.starts_at))} · {cityName(d.city_slug)}</small><b>{d.title}</b></div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

/** One plan's diary: photos grouped into moments by time. */
export function DiaryView({ planRef }: { planRef: string }) {
  const auth = useAuth(); const { toast, byId } = useApp();
  const [ps, setPs] = useState<P[] | null>(null);
  const [meta, setMeta] = useState<DiaryRow | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const load = useCallback(() => {
    const sb = getSupabase(); if (!sb) return;
    sb.from("event_photos").select("id,url,taken_at,caption").eq("plan_ref", planRef).order("taken_at").then(({ data }) => setPs((data as P[]) ?? []));
    sb.rpc("photo_diaries", { p_city: null }).then(({ data }) => setMeta(((data as DiaryRow[]) ?? []).find((d) => d.plan_ref === planRef) ?? null));
  }, [planRef]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auth.client || !auth.session) return;
    // the team or this plan's host may caption / remove photos
    auth.client.rpc("plan_reconfirmed", { p_plan_ref: planRef }).then(({ error }) => setCanEdit(!error));
  }, [auth.client, auth.session, planRef]);

  if (!ps) return <div className="skeleton" style={{ minHeight: 320 }} />;
  const ev = byId(planRef);
  // a new moment starts after a 20-minute gap
  const groups: P[][] = [];
  ps.forEach((p, i) => { if (!i || new Date(p.taken_at).getTime() - new Date(ps[i - 1].taken_at).getTime() > 20 * 60e3) groups.push([p]); else groups[groups.length - 1].push(p); });
  const photos: Photo[] = ps.map((p) => ({ src: p.url, caption: p.caption ?? undefined }));
  const idx = (p: P) => ps.indexOf(p);
  const t = (s: string) => fmtTime(new Date(s));

  async function caption(p: P) {
    const c = prompt("Caption for this photo (max 80 characters)", p.caption ?? ""); if (c === null || !auth.client) return;
    const { error } = await auth.client.rpc("edit_event_photo", { p_id: p.id, p_caption: c, p_delete: false });
    if (error) return toast("⚠️ " + error.message); load();
  }
  async function remove(p: P) {
    if (!confirm("Remove this photo from the diary?") || !auth.client) return;
    const { error } = await auth.client.rpc("edit_event_photo", { p_id: p.id, p_caption: null, p_delete: true });
    if (error) return toast("⚠️ " + error.message); toast("Photo removed"); load();
  }

  return (
    <section className="diary">
      <Link className="linkish" href="/past/">‹ All photo diaries</Link>
      <span className="eyebrow">{meta ? `${DAY(new Date(meta.starts_at))} · ${meta.area}, ${cityName(meta.city_slug)}` : "Photo diary"}</span>
      <h1>{meta?.title ?? ev?.title ?? "Photo diary"}</h1>
      <p className="muted">{ps.length} photo{ps.length === 1 ? "" : "s"}{ps.length ? `, from ${t(ps[0].taken_at)} to ${t(ps[ps.length - 1].taken_at)}` : ""}.</p>
      {canEdit && <div className="acts" style={{ margin: "8px 0" }}><DiaryUploader planRef={planRef} label="📸 Add more photos" /></div>}
      {!ps.length && <p className="muted">No photos yet.</p>}
      <ol className="d-moments">
        {groups.map((g) => (
          <li key={g[0].id}>
            <div className="m-time"><b>{t(g[0].taken_at)}{g.length > 1 && t(g[g.length - 1].taken_at) !== t(g[0].taken_at) ? ` – ${t(g[g.length - 1].taken_at)}` : ""}</b><small>{g.length} photo{g.length > 1 ? "s" : ""}</small></div>
            <div className={`m-grid n${Math.min(g.length, 3)}`}>
              {g.map((p) => (
                <figure key={p.id}>
                  <button type="button" onClick={() => setOpen(idx(p))} aria-label="Open photo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.caption ?? ""} loading="lazy" />
                  </button>
                  <figcaption><small>{t(p.taken_at)}</small>{p.caption && <span> · {p.caption}</span>}
                    {canEdit && <span className="m-edit"><button onClick={() => caption(p)}>✏️</button><button onClick={() => remove(p)}>🗑</button></span>}</figcaption>
                </figure>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <Lightbox photos={photos} index={open} onIndex={setOpen} />
      <div className="more-row"><Link className="btn btn-sun" href="/events/">Find your next plan →</Link></div>
    </section>
  );
}
