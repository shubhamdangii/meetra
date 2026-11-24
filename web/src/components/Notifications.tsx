"use client";
// Member notifications (seat approved, waitlisted, checked in…; admins also get approval requests).
// Loads once, then listens live (Supabase Realtime). A new one pops a toast on any page.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import { useAuth } from "./AuthProvider";
import { burst, buzz } from "./fx";
import { Modal } from "./admin/shared";
import { CONFIG } from "@/lib/config";

export type Note = { id: number; kind: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string };
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const b64ToBytes = (s: string) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

export function useNotifications() {
  const auth = useAuth(); const { toast } = useApp();
  const [list, setList] = useState<Note[]>([]);
  const uid = auth.me?.id;
  const load = useCallback(async () => {
    if (!auth.client || !uid) { setList([]); return; }
    const { data } = await auth.client.from("admin_notifications").select("*").order("created_at", { ascending: false }).limit(30);
    setList((data as Note[]) ?? []);
  }, [auth.client, uid]);
  useEffect(() => { load(); }, [load]);
  const toastRef = useRef(toast); toastRef.current = toast;
  useEffect(() => {
    if (!auth.client || !uid) return;
    const ch = auth.client.channel(`notes-${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_notifications", filter: `user_id=eq.${uid}` }, (p) => {
        const n = p.new as Note;
        setList((l) => [n, ...l.filter((x) => x.id !== n.id)].slice(0, 30));
        toastRef.current(n.title);
        if (/approved|checked_in/.test(n.kind)) { buzz(60); burst(innerWidth / 2, innerHeight / 3, ["🎉", "✨", "💜", "🥳"], 18); }
      })
      .subscribe();
    return () => { auth.client?.removeChannel(ch); };
  }, [auth.client, uid]);
  const markRead = async (ids: number[] | null) => {
    await auth.client?.rpc("admin_notifications_mark_read", { p_ids: ids });
    setList((l) => l.map((n) => (ids === null || ids.includes(n.id) ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)));
  };
  return { list, unread: list.filter((n) => !n.read_at).length, reload: load, markRead };
}

export function usePushToggle() {
  const auth = useAuth();
  const [state, setState] = useState<"unknown" | "on" | "off" | "unsupported" | "denied">("unknown");
  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !CONFIG.vapidPublicKey) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);
  const enable = async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` }));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CONFIG.vapidPublicKey) }));
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const { error } = await auth.client!.rpc("save_push_sub", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
      setState(error ? "off" : "on");
    } catch { setState("unsupported"); }
  };
  return { state, enable };
}

const fmt = (s: string) => new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

export function NotificationsSheet({ open, onClose, n }: { open: boolean; onClose: () => void; n: ReturnType<typeof useNotifications> }) {
  const push = usePushToggle();
  useEffect(() => { if (open) n.reload(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={open} onClose={onClose} title="Notifications">
      <div className="nt">
        {push.state === "off" && <button className="btn btn-sun btn-sm btn-block" onClick={push.enable}>📲 Turn on phone alerts</button>}
        {push.state === "on" && <p className="muted" style={{ fontSize: 13 }}>📲 Phone alerts are on for this device.</p>}
        {push.state === "denied" && <p className="muted" style={{ fontSize: 13 }}>Alerts are blocked. Allow notifications for this site in your browser settings.</p>}
        {push.state === "unsupported" && <p className="muted" style={{ fontSize: 13 }}>For phone alerts, add meetra to your home screen (☰ → Get the app) and open it from there.</p>}
        {n.unread > 0 && <button className="linkish" style={{ justifySelf: "end", fontSize: 13 }} onClick={() => n.markRead(null)}>Mark all read</button>}
        {!n.list.length ? <p className="muted" style={{ textAlign: "center", padding: "20px 0" }}>No notifications yet. We&apos;ll tell you here when your seat is confirmed.</p> : (
          <ul>{n.list.map((x) => (
            <li key={x.id} className={x.read_at ? "" : "new"}>
              <Link href={(x.link || "/saved/").replace(/^\/meetra/, "")} onClick={() => { if (!x.read_at) n.markRead([x.id]); onClose(); }}>
                <b>{x.title}</b><span>{x.body}</span><small>{fmt(x.created_at)}</small>
              </Link>
            </li>
          ))}</ul>
        )}
      </div>
    </Modal>
  );
}
