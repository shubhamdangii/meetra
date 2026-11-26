"use client";
// App-wide state: today's events, chosen city, saved plans, requested seats, toasts.
import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CONFIG } from "@/lib/config";
import { buildEvents, type CustomPlan, type MeetEvent, startOfToday } from "@/lib/events";
import { getSupabase } from "@/lib/supabase";
import { store } from "@/lib/store";

export type ConfirmOpts = { title: string; body?: string; ok?: string; cancel?: string; danger?: boolean; icon?: string };
type Req = { id: string; name: string; friend: boolean; at: number };
type Ctx = {
  ready: boolean;                       // false during the static pre-render; true in the browser
  customLoaded: boolean;                // real events (from the database) have arrived
  today: Date;
  all: MeetEvent[]; upcoming: MeetEvent[]; past: MeetEvent[];
  byId: (id: string) => MeetEvent | undefined;
  city: string; setCity: (c: string) => void; inCity: (e: MeetEvent) => boolean;
  isSaved: (id: string) => boolean; toggleSave: (id: string) => void; savedIds: string[];
  requests: Req[]; addRequest: (r: Req) => void;
  toast: (msg: string) => void;
  /** Styled "Are you sure?" dialog. Resolves true when the person confirms. */
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  reloadCustom: () => void;
  /** Example plans a main admin removed from the site (Event library). */
  hiddenKeys: Set<string>; reloadHidden: () => void;
};
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error("useApp outside AppProvider"); return c; };

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [customLoaded, setCustomLoaded] = useState(false);
  const [today, setToday] = useState(() => new Date(0));
  const [city, setCityState] = useState(CONFIG.defaultCity);
  const [saved, setSaved] = useState<string[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [custom, setCustom] = useState<CustomPlan[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ask, setAsk] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirmFn = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setAsk({ ...o, resolve })), []);
  const answer = (v: boolean) => { ask?.resolve(v); setAsk(null); };
  useEffect(() => {
    if (!ask) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { ask.resolve(false); setAsk(null); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [ask]);

  // Everything that depends on the date or the visitor's browser starts after mount.
  useEffect(() => {
    setToday(startOfToday());
    const c = store.get("mt-city", CONFIG.defaultCity);
    setCityState(CONFIG.cities[c]?.live ? c : CONFIG.defaultCity);   // "all" is no longer offered
    setSaved(store.get<string[]>("mt-saved", []));
    setRequests(store.get<Req[]>("mt-requests", []));
    setReady(true);
    // Plans the team added from the admin page (launches, specials).
    const sb = getSupabase();
    const from = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10);
    if (!sb) setCustomLoaded(true);
    sb?.from("custom_plans").select("*").gte("starts_on", from).then(({ data }) => { if (data?.length) setCustom(data as CustomPlan[]); setCustomLoaded(true); }, () => setCustomLoaded(true));
  }, []);

  const [hiddenKeys, setHidden] = useState<Set<string>>(new Set());
  const reloadHidden = useCallback(() => {
    getSupabase()?.from("hidden_templates").select("key").then(({ data }) => setHidden(new Set(((data ?? []) as { key: string }[]).map((r) => r.key))));
  }, []);
  useEffect(() => { reloadHidden(); }, [reloadHidden]);
  const data = useMemo(() => (ready ? buildEvents(today, custom, hiddenKeys) : { all: [], upcoming: [], past: [] }), [ready, today, custom, hiddenKeys]);
  const index = useMemo(() => new Map(data.all.map((e) => [e.id, e])), [data]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), /couldn|⚠️|error|failed|not saved/i.test(msg) ? 5000 : 3000);
  }, []);

  const value: Ctx = {
    ready, customLoaded, today, ...data, hiddenKeys, reloadHidden,
    byId: (id) => index.get(id),
    city,
    setCity: (c) => { setCityState(c); store.set("mt-city", c); },
    inCity: (e) => city === "all" || e.city === city,
    isSaved: (id) => saved.includes(id),
    savedIds: saved,
    toggleSave: (id) => {
      setSaved((s) => {
        const on = !s.includes(id);
        const next = on ? [...s, id] : s.filter((x) => x !== id);
        store.set("mt-saved", next);
        toast(on ? "♥ Saved to your plans" : "Removed from saved");
        return next;
      });
    },
    requests,
    addRequest: (r) => setRequests((l) => { const next = [r, ...l.filter((x) => x.id !== r.id)]; store.set("mt-requests", next); return next; }),
    toast,
    confirm: confirmFn,
    reloadCustom: () => { const from = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10); getSupabase()?.from("custom_plans").select("*").gte("starts_on", from).then(({ data }) => setCustom((data as CustomPlan[]) ?? [])); },
  };

  return (
    <AppCtx.Provider value={value}>
      {children}
      <AnimatePresence>
        {toastMsg && (
          <motion.div key={toastMsg} className={`toast show ${/couldn|⚠️|error|failed|not saved/i.test(toastMsg) ? "t-err" : /✓|✅|🎉|saved|sent|cancelled|updated|thanks/i.test(toastMsg) ? "t-ok" : ""}`} role={/couldn|⚠️|error|failed/i.test(toastMsg) ? "alert" : "status"}
            initial={{ y: 40, opacity: 0, x: "-50%" }} animate={{ y: 0, opacity: 1, x: "-50%" }} exit={{ y: 40, opacity: 0, x: "-50%" }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}>
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {ask && (
          <motion.div className="cfm-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => answer(false)}>
            <motion.div className="cfm" role="alertdialog" aria-modal="true" aria-labelledby="cfm-t" onClick={(e) => e.stopPropagation()}
              initial={{ y: 60, scale: 0.9, rotate: -2, opacity: 0 }} animate={{ y: 0, scale: 1, rotate: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 24 }}>
              <motion.span className="cfm-ic" aria-hidden="true" initial={{ scale: 0.3, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 12, delay: 0.08 }}>{ask.icon ?? (ask.danger ? "⚠️" : "🤔")}</motion.span>
              <h3 id="cfm-t">{ask.title}</h3>
              {ask.body && <p>{ask.body}</p>}
              <div className="cfm-btns">
                <button type="button" className="btn btn-white" onClick={() => answer(false)} autoFocus>{ask.cancel ?? "Go back"}</button>
                <button type="button" className={`btn ${ask.danger ? "btn-danger" : "btn-ink"}`} onClick={() => answer(true)}>{ask.ok ?? "Yes"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppCtx.Provider>
  );
}
