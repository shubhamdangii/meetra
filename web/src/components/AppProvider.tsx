"use client";
// App-wide state: today's events, chosen city, saved plans, requested seats, toasts.
import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CONFIG } from "@/lib/config";
import { buildEvents, type CustomPlan, type MeetEvent, startOfToday } from "@/lib/events";
import { getSupabase } from "@/lib/supabase";
import { store } from "@/lib/store";

type Req = { id: string; name: string; friend: boolean; at: number };
type Ctx = {
  ready: boolean;                       // false during the static pre-render; true in the browser
  today: Date;
  all: MeetEvent[]; upcoming: MeetEvent[]; past: MeetEvent[];
  byId: (id: string) => MeetEvent | undefined;
  city: string; setCity: (c: string) => void; inCity: (e: MeetEvent) => boolean;
  isSaved: (id: string) => boolean; toggleSave: (id: string) => void; savedIds: string[];
  requests: Req[]; addRequest: (r: Req) => void;
  toast: (msg: string) => void;
  reloadCustom: () => void;
};
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error("useApp outside AppProvider"); return c; };

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState(() => new Date(0));
  const [city, setCityState] = useState(CONFIG.defaultCity);
  const [saved, setSaved] = useState<string[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [custom, setCustom] = useState<CustomPlan[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Everything that depends on the date or the visitor's browser starts after mount.
  useEffect(() => {
    setToday(startOfToday());
    const c = store.get("mt-city", CONFIG.defaultCity);
    setCityState(c === "all" || CONFIG.cities[c]?.live ? c : CONFIG.defaultCity);
    setSaved(store.get<string[]>("mt-saved", []));
    setRequests(store.get<Req[]>("mt-requests", []));
    setReady(true);
    // Plans the team added from the admin page (launches, specials).
    const sb = getSupabase();
    const from = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10);
    sb?.from("custom_plans").select("*").gte("starts_on", from).then(({ data }) => { if (data?.length) setCustom(data as CustomPlan[]); });
  }, []);

  const data = useMemo(() => (ready ? buildEvents(today, custom) : { all: [], upcoming: [], past: [] }), [ready, today, custom]);
  const index = useMemo(() => new Map(data.all.map((e) => [e.id, e])), [data]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const value: Ctx = {
    ready, today, ...data,
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
    reloadCustom: () => { const from = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10); getSupabase()?.from("custom_plans").select("*").gte("starts_on", from).then(({ data }) => setCustom((data as CustomPlan[]) ?? [])); },
  };

  return (
    <AppCtx.Provider value={value}>
      {children}
      <AnimatePresence>
        {toastMsg && (
          <motion.div key={toastMsg} className="toast show" role="status"
            initial={{ y: 40, opacity: 0, x: "-50%" }} animate={{ y: 0, opacity: 1, x: "-50%" }} exit={{ y: 40, opacity: 0, x: "-50%" }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}>
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </AppCtx.Provider>
  );
}
