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
