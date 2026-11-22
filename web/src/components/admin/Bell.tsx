"use client";
// 🔔 Admin notifications: list + unread badge, checked every 30 s. "Phone alerts" subscribes this phone
// to push messages (works when the meetra app is installed / the browser allows it).
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthProvider";
import { CONFIG } from "@/lib/config";
import { fmtDT } from "./shared";

type N = { id: number; kind: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string };
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const b64ToBytes = (s: string) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

export function AdminBell({ onOpenLink, onCount }: { onOpenLink: (link: string) => void; onCount?: (n: number) => void }) {
  const auth = useAuth();
  const [list, setList] = useState<N[]>([]); const [open, setOpen] = useState(false);
  const [push, setPush] = useState<"unknown" | "on" | "off" | "unsupported" | "denied">("unknown");
  const seen = useRef<Set<number> | null>(null);

  const load = useCallback(async () => {
    if (!auth.client || !auth.me) return;
    const { data } = await auth.client.from("admin_notifications").select("*").order("created_at", { ascending: false }).limit(40);
    const rows = (data as N[]) ?? [];
    // a new one arrived while this page is open → also show a system notification
    if (seen.current) {
      const fresh = rows.filter((r) => !r.read_at && !seen.current!.has(r.id));
      if (fresh.length && "Notification" in window && Notification.permission === "granted" && document.hidden) {
        navigator.serviceWorker?.getRegistration().then((reg) => fresh.forEach((f) => reg?.showNotification(f.title, { body: f.body, tag: "adm-" + f.id, icon: `${BASE}/icons/icon-192.png`, data: { link: f.link } })));
      }
    }
    seen.current = new Set(rows.map((r) => r.id));
    setList(rows);
  }, [auth.client, auth.me]);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 30000); const v = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", v); return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); }; }, [load]);
  const unread = list.filter((n) => !n.read_at).length;
  useEffect(() => { onCount?.(unread); }, [unread, onCount]);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !CONFIG.vapidPublicKey) return setPush("unsupported");
      if (Notification.permission === "denied") return setPush("denied");
      const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription();
      setPush(sub ? "on" : "off");
    })().catch(() => setPush("unsupported"));
  }, []);

  async function enablePush() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setPush(perm === "denied" ? "denied" : "off");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` }));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CONFIG.vapidPublicKey) }));
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const { error } = await auth.client!.rpc("admin_save_push_sub", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
      setPush(error ? "off" : "on");
    } catch { setPush("unsupported"); }
  }
  async function markAll() { await auth.client?.rpc("admin_notifications_mark_read", { p_ids: null }); load(); }
  async function openOne(n: N) {
    if (!n.read_at) await auth.client?.rpc("admin_notifications_mark_read", { p_ids: [n.id] });
    setOpen(false); load(); if (n.link) onOpenLink(n.link);
  }

  return (
    <div className="adm-bell-wrap">
      <motion.button type="button" className="adm-bell" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => setOpen((o) => !o)}
        animate={unread ? { rotate: [0, -14, 12, -8, 6, 0] } : { rotate: 0 }} transition={{ duration: 0.8, repeat: unread ? Infinity : 0, repeatDelay: 4 }}>
        🔔{unread > 0 && <span className="adm-badge">{unread > 9 ? "9+" : unread}</span>}
      </motion.button>
      <AnimatePresence>{open && (
        <motion.div className="adm-bell-pop" initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }}>
          <div className="adm-bell-head"><b>Notifications</b>{unread > 0 && <button className="linkish" onClick={markAll}>Mark all read</button>}</div>
          {push === "off" && <button className="btn btn-sun btn-sm btn-block" onClick={enablePush}>📲 Turn on phone alerts</button>}
          {push === "on" && <p className="muted" style={{ fontSize: 12 }}>📲 Phone alerts are on for this device.</p>}
          {push === "denied" && <p className="muted" style={{ fontSize: 12 }}>Alerts are blocked. Allow notifications for this site in your browser settings.</p>}
          {push === "unsupported" && <p className="muted" style={{ fontSize: 12 }}>For phone alerts, install the meetra app (☰ → Get the app) and open it from your home screen.</p>}
          <ul>{list.length ? list.map((n) => (
            <li key={n.id} className={n.read_at ? "" : "new"}><button type="button" onClick={() => openOne(n)}><b>{n.title}</b><span>{n.body}</span><small>{fmtDT(n.created_at)}</small></button></li>
          )) : <li className="muted" style={{ padding: 10 }}>No notifications yet.</li>}</ul>
        </motion.div>
      )}</AnimatePresence>
    </div>
  );
}
