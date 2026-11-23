"use client";
// Admin tab: door check-in (QR scanner + guest list).
// The database checks every permission again.
import { AnimatePresence, motion } from "framer-motion";
import jsQR from "jsqr";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { burst, buzz } from "../fx";
import { CONFIG } from "@/lib/config";
import { type MeetEvent, eventUrl, relDay } from "@/lib/events";

const cityName = (c: string) => CONFIG.cities[c]?.name ?? c;

/* ======================= Door check-in ======================= */
type G = { request_id: number; display_name: string; full_name: string | null; avatar_url: string | null; phone: string | null; status: string; party_size: number };
type Hit = { kind: "ok" | "again" | "bad"; title: string; sub?: string; avatar?: string | null };

/** Door: scan any pass (the database works out which plan it belongs to); tap a plan chip for its guest list. */
export function AdminCheckIn({ plans, guestsFn = "admin_plan_queue" }: { plans: MeetEvent[]; guestsFn?: "admin_plan_queue" | "host_guest_list" }) {
  const auth = useAuth();
  const { toast, today } = useApp();
  // the plan happening nearest to now first
  const sorted = useMemo(() => [...plans].sort((a, b) => Math.abs(a.day) - Math.abs(b.day) || a.date.getTime() - b.date.getTime()), [plans]);
  const [plan, setPlan] = useState(sorted[0]?.id ?? "");
  const [lists, setLists] = useState<Record<string, G[]>>({});
  const [scan, setScan] = useState(false);
  const [hit, setHit] = useState<Hit | null>(null);
  const [code, setCode] = useState("");
  useEffect(() => { if (!plan && sorted[0]) setPlan(sorted[0].id); }, [sorted, plan]);

  const loadOne = useCallback(async (ref: string) => {
    if (!auth.client) return;
    const { data, error } = await auth.client.rpc(guestsFn, { p_plan_ref: ref });
    if (error) return;
    setLists((l) => ({ ...l, [ref]: (data as G[]).filter((g) => g.status === "approved" || g.status === "attended") }));
  }, [auth.client, guestsFn]);
  const loadAll = useCallback(() => { sorted.forEach((p) => loadOne(p.id)); }, [sorted, loadOne]);
  useEffect(() => { loadAll(); }, [loadAll]);

  const checkIn = useCallback(async (id: number, undo = false, ref: string | null = null) => {
    if (!auth.client) return;
    const { data, error } = await auth.client.rpc("admin_check_in", { p_request_id: id, p_plan_ref: ref, p_undo: undo });
    if (error) { setHit({ kind: "bad", title: "Can't let in", sub: error.message.replace(/^.*?: /, "") }); buzz(300); return; }
    const r = (data as { display_name: string; party_size: number; already: boolean; avatar_url: string | null; plan_ref: string }[])[0];
    const p = plans.find((x) => x.id === r.plan_ref);
    if (undo) { toast(`${r.display_name} un-checked`); loadOne(r.plan_ref); return; }
    setPlan(r.plan_ref);
    setHit(r.already ? { kind: "again", title: `${r.display_name} is already in`, sub: `${p?.title ?? r.plan_ref} · scanned before. Same pass twice?`, avatar: r.avatar_url }
      : { kind: "ok", title: `${r.display_name}${r.party_size > 1 ? " +1" : ""}`, sub: `Checked in ✓ ${p ? p.title : ""}`, avatar: r.avatar_url });
    if (!r.already) { buzz(60); burst(innerWidth / 2, innerHeight / 2, ["✅", "🎉", "✨"], 14); } else buzz(200);
    loadOne(r.plan_ref);
  }, [auth.client, toast, loadOne, plans]);

  const onCode = useCallback((text: string) => {
    const m = /-PASS:(\d+):/.exec(text) ?? /^#?0*(\d{1,9})$/.exec(text.trim());
    if (!m) { setHit({ kind: "bad", title: "Not a meetra pass", sub: text.slice(0, 60) }); buzz(300); return; }
    checkIn(Number(m[1]));
  }, [checkIn]);

  const guests = lists[plan] ?? null;
  const tally = (ref: string) => { const g = lists[ref] ?? []; return [g.filter((x) => x.status === "attended").reduce((s, x) => s + x.party_size, 0), g.reduce((s, x) => s + x.party_size, 0)]; };
  const [inCount, total] = tally(plan);
  const sel = plans.find((p) => p.id === plan);

  // auto-hide a result after a few seconds so the next guest can be scanned
  useEffect(() => { if (!hit || hit.kind === "bad") return; const t = setTimeout(() => setHit(null), 3500); return () => clearTimeout(t); }, [hit]);

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ci">
      {!plans.length ? <div className="setup-note">No plans yesterday, today or tomorrow in your cities.</div> : <>
        <motion.button whileTap={{ scale: 0.97 }} className={`ci-scan-btn ${scan ? "on" : ""}`} onClick={() => { setScan((s) => !s); setHit(null); }}>
          {scan ? "■ Stop camera" : "📷 Scan door passes"}<small>{scan ? "Point at the QR. It works for any plan." : "Any plan · we find the guest's plan automatically"}</small>
        </motion.button>
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
        <div className="ci-plans" role="tablist" aria-label="Plans at the door">
          {sorted.map((p) => { const [a, b] = tally(p.id); return (
            <button key={p.id} role="tab" aria-selected={p.id === plan} className={p.id === plan ? "on" : ""} onClick={() => setPlan(p.id)}>
              <b>{p.title.split(" · ")[0]}</b><small>{relDay(p.date, today)} · {p.time} · {cityName(p.city)}</small>
              <span className="n">{lists[p.id] ? `${a}/${b} in` : "…"}</span>
            </button>); })}
        </div>
        <div className="ci-top">
          <div className="ci-count"><b>{inCount}</b><span>/ {total} in</span><i style={{ width: total ? `${(inCount / total) * 100}%` : 0 }} /></div>
          {sel && <Link className="btn btn-white btn-sm" href={eventUrl(sel)}>Plan page</Link>}
        </div>
        <div className="ci-list">
          {!guests ? <div className="skeleton" style={{ minHeight: 80 }} /> : !guests.length ? <p className="muted">No confirmed guests yet. Approve requests in Seat requests.</p> : [...guests].sort((a, b) => Number(a.status === "attended") - Number(b.status === "attended")).map((g) => {
            const inn = g.status === "attended";
            return (
              <div key={g.request_id} className={`ci-row ${inn ? "in" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {g.avatar_url ? <img src={g.avatar_url} alt="" /> : <span className="ph">{(g.display_name || "?")[0]}</span>}
                <span className="ci-name"><b>{g.full_name || g.display_name}{g.party_size > 1 ? " +1" : ""}</b><small>#{String(g.request_id).padStart(5, "0")}{g.phone ? ` · ${g.phone}` : ""}</small></span>
                {inn ? <button className="pill on" onClick={() => checkIn(g.request_id, true, plan)} title="Undo">✓ In</button>
                  : <button className="pill" onClick={() => checkIn(g.request_id, false, plan)}>Check in</button>}
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
