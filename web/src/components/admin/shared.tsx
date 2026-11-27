"use client";
// Small building blocks shared by the admin desk.
import { AnimatePresence, motion } from "framer-motion";
import { lockScroll } from "@/lib/scrollLock";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../AuthProvider";
import { useApp } from "../AppProvider";
import { CONFIG } from "@/lib/config";

export const cityName = (c: string | null | undefined) => (c ? CONFIG.cities[c]?.name ?? c : "");
export const CITIES = Object.keys(CONFIG.cities);
export const CATS = ["food", "chai", "sports", "games", "tech", "bhakti", "night", "outing", "art", "film", "trips"] as const;

export const fmtDT = (s: string | null | undefined) => {
  if (!s) return "–";
  const d = new Date(s);
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
};
export const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "–");
/** ISO → value for <input type="datetime-local"> in the viewer's time zone */
export const toLocalInput = (s: string | null | undefined) => {
  if (!s) return "";
  const d = new Date(s); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : "");
export const nowLocalInput = () => toLocalInput(new Date(Date.now() + 5 * 60e3).toISOString());

/** Calls a Supabase RPC and keeps data / loading / error together. */
export function useRpc<T>(fn: string, args?: Record<string, unknown>, enabled = true) {
  const auth = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify(args ?? {});
  const load = useCallback(async () => {
    if (!auth.client || !enabled) return;
    setLoading(true);
    const { data: d, error: e } = await auth.client.rpc(fn, JSON.parse(key));
    setLoading(false);
    if (e) { setError(e.message); return; }
    setError(null); setData(d as T);
  }, [auth.client, fn, key, enabled]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load };
}

/** Run an RPC with a toast for errors. Returns data or undefined. */
export function useCall() {
  const auth = useAuth(); const { toast } = useApp();
  return useCallback(async <T,>(fn: string, args: Record<string, unknown>, okMsg?: string): Promise<T | undefined> => {
    if (!auth.client) return;
    const { data, error } = await auth.client.rpc(fn, args);
    if (error) { toast("⚠️ " + error.message); return undefined; }
    if (okMsg) toast(okMsg);
    return (data ?? true) as T;
  }, [auth.client, toast]);
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const unlock = lockScroll();
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); unlock(); };
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="adm-modal-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className={`adm-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
            initial={{ y: 40, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: "spring", stiffness: 320, damping: 28 }}>
            <div className="adm-modal-head"><h3>{title}</h3><button type="button" className="adm-x" aria-label="Close" onClick={onClose}>✕</button></div>
            <div className="adm-modal-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Ask for a short text (reason / remark / note) inside a modal. */
export function useAsk() {
  const [st, setSt] = useState<{ title: string; label: string; required: boolean; ok: string; resolve: (v: string | null) => void; initial: string } | null>(null);
  const [v, setV] = useState("");
  const ask = (title: string, label: string, opts: { required?: boolean; ok?: string; initial?: string } = {}) =>
    new Promise<string | null>((resolve) => { setV(opts.initial ?? ""); setSt({ title, label, required: !!opts.required, ok: opts.ok ?? "OK", resolve, initial: opts.initial ?? "" }); });
  const close = (val: string | null) => { st?.resolve(val); setSt(null); };
  const ui = (
    <Modal open={!!st} onClose={() => close(null)} title={st?.title ?? ""}>
      <form onSubmit={(e) => { e.preventDefault(); if (st?.required && v.trim().length < 3) return; close(v.trim()); }}>
        <div className="field"><label htmlFor="ask-v">{st?.label}{st?.required ? " *" : " (optional)"}</label>
          <textarea id="ask-v" rows={3} value={v} onChange={(e) => setV(e.target.value)} autoFocus maxLength={500} /></div>
        {st?.required && v.trim().length < 3 && <p className="muted" style={{ fontSize: 13 }}>At least 3 characters.</p>}
        <div className="adm-row-end"><button type="button" className="btn btn-white btn-sm" onClick={() => close(null)}>Back</button>
          <button type="submit" className="btn btn-ink btn-sm" disabled={!!st?.required && v.trim().length < 3}>{st?.ok}</button></div>
      </form>
    </Modal>
  );
  return { ask, ui };
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", pending: "Pending approval", approved: "Approved", active: "Active", completed: "Completed", cancelled: "Cancelled",
  rejected: "Rejected", withdrawn: "Withdrawn", inactive: "Inactive", deleted: "Deleted",
};
export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s;
export function Chip({ s }: { s: string }) {
  const icon: Record<string, string> = { draft: "✎", pending: "⏳", approved: "✓", active: "●", completed: "✔", cancelled: "✕", rejected: "✕", withdrawn: "↩", inactive: "◌" };
  return <span className={`adm-chip c-${s}`}>{icon[s] ? <i aria-hidden="true">{icon[s]}</i> : null}{statusLabel(s)}</span>;
}

export function Stars({ v, n }: { v: number | null | undefined; n?: number }) {
  if (v == null) return <span className="muted" style={{ fontSize: 13 }}>No ratings yet</span>;
  const pct = Math.max(0, Math.min(100, (Number(v) / 5) * 100));
  return (
    <span className="adm-stars" title={`${v} out of 5`}><span className="s-bg">★★★★★</span><span className="s-fg" style={{ width: `${pct}%` }}>★★★★★</span>
      <b>{Number(v).toFixed(1)}</b>{n != null && <small>({n})</small>}</span>
  );
}

const FIELD_LABEL: Record<string, string> = {
  title: "Title", category: "Category", city_slug: "City", host_id: "Host", host_name: "Host", starts_at: "Starts", ends_at: "Ends",
  booking_closes_at: "Booking closes", area: "Area", price: "Price ₹", price_type: "Price type", seats: "Seats", emoji: "Emoji",
  blurb: "Description", steps: "How it unfolds", tags: "Tags", reason: "Reason", name: "Name", bio: "Bio", photo_url: "Photo",
  phone: "Phone", email: "Email", instagram: "Instagram", status: "Status", city: "City", user_id: "Member", gallery: "Gallery",
  event_type: "Event type", image_url: "Event photo", maps_url: "Exact location", category_other: "Category (own words)",
  event_choice: "Event", assign_event: "Assigned event", new_event: "New event (goes live on approval)",
};
const show = (k: string, v: unknown) => {
  if (v == null || v === "") return "–";
  if (k === "gallery" && Array.isArray(v)) return `${v.length} photo${v.length === 1 ? "" : "s"}`;
  if (k === "event_choice") return ({ existing: "Assign an existing event", new: "Create a new event", none: "No event for now" } as Record<string, string>)[String(v)] ?? String(v);
  if (k === "new_event" && typeof v === "object") { const n = v as Record<string, string>; return `${n.title ?? "?"} · ${n.starts_at ? fmtDT(n.starts_at) : "?"} · ${n.area ?? ""}${n.price_type === "free" ? " · free" : n.price ? ` · ₹${n.price}` : ""}`; }
  if (k === "image_url" && typeof v === "string") return "photo ✓ (" + decodeURIComponent(v.split("/").slice(-2).join("/")).slice(0, 40) + ")";
  if (k === "photo_url" && typeof v === "string") return "photo ✓ (" + v.split("/").pop()!.slice(0, 18) + ")";
  if (/_at$/.test(k) && typeof v === "string") return fmtDT(v);
  if (k === "city_slug" || k === "city") return cityName(String(v));
  if (Array.isArray(v)) return v.length ? v.join(" · ") : "–";
  return String(v);
};
/** Old value vs new value table. */
export function Diff({ oldV, newV, hostNames }: { oldV: Record<string, unknown> | null; newV: Record<string, unknown> | null; hostNames?: Map<number, string> }) {
  const keys = [...new Set([...Object.keys(newV ?? {}), ...Object.keys(oldV ?? {})])].filter((k) => (k !== "host_name" || !newV?.host_id) && k !== "user_id" && k !== "application_id" && k !== "assign_plan_id");
  const linked = !!(newV?.user_id || oldV?.user_id);
  if (!keys.length) return null;
  const val = (k: string, o: Record<string, unknown> | null) => k === "host_id" && o?.[k] != null ? (hostNames?.get(Number(o[k])) ?? (o.host_name as string) ?? `#${o[k]}`) : show(k, o?.[k]);
  return (
    <div className="adm-diff"><table><thead><tr><th>Field</th>{oldV && <th>Old</th>}<th>{oldV ? "New" : "Value"}</th></tr></thead>
      <tbody>{keys.map((k) => {
        const o = val(k, oldV), n = val(k, newV); const changed = oldV && o !== n;
        return <tr key={k} className={changed ? "chg" : ""}><td>{FIELD_LABEL[k] ?? k}</td>{oldV && <td className="old">{o}</td>}<td className="new">{n}</td></tr>;
      })}{linked && <tr><td>Login</td>{oldV && <td />}<td className="new">Linked to the member&apos;s account ✓</td></tr>}</tbody></table></div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="adm-empty">{children}</div>;
}

/** 10-per-page paging that resets to page 1 when the list changes size (filters). */
export function usePaged<T>(list: T[], size = 10) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(list.length / size));
  useEffect(() => { setPage(1); }, [list.length]);
  const p = Math.min(page, pages);
  return { page: p, pages, setPage, items: list.slice((p - 1) * size, p * size), from: list.length ? (p - 1) * size + 1 : 0, to: Math.min(p * size, list.length), total: list.length };
}
export function Pager({ pg }: { pg: ReturnType<typeof usePaged<unknown>> }) {
  if (pg.total <= 10) return pg.total ? <p className="pager-sum">Showing all {pg.total}</p> : null;
  const go = (n: number) => { pg.setPage(n); setTimeout(() => window.scrollTo({ top: Math.max(0, (document.querySelector(".adm-tabs")?.getBoundingClientRect().top ?? 0) + window.scrollY - 70), behavior: "smooth" }), 0); };
  return (
    <nav className="pager" aria-label="Pages">
      <button disabled={pg.page <= 1} onClick={() => go(pg.page - 1)} aria-label="Previous page">‹ Prev</button>
      <span><b>{pg.from}–{pg.to}</b> of {pg.total}</span>
      <button disabled={pg.page >= pg.pages} onClick={() => go(pg.page + 1)} aria-label="Next page">Next ›</button>
    </nav>
  );
}
