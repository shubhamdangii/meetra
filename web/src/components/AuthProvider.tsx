"use client";
// Login state (Supabase Auth). If login is switched off in config, everything here is a no-op.
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getSupabase, loginEnabled } from "@/lib/supabase";

export type Me = {
  id: string; display_name: string; avatar_url: string | null; city_slug: string | null; role: string;
  is_host: boolean; profile_score: number; profile_complete: boolean; phone_verified: boolean; email_verified: boolean;
};
/** Team access: main admin (everything) or city admin (only these cities). */
export type Team = { is_super: boolean; cities: string[] };
type Ctx = {
  enabled: boolean; ready: boolean; team: Team | null;
  client: SupabaseClient | null; session: Session | null; me: Me | null;
  refreshMe: () => Promise<Me | null>;
  logout: () => Promise<void>;
  requireLogin: (next?: string) => boolean;   // true if logged in; otherwise goes to /login/
  rememberNext: (url: string) => void; takeNext: (fallback?: string) => string;
};
const AuthCtx = createContext<Ctx | null>(null);
export const useAuth = () => { const c = useContext(AuthCtx); if (!c) throw new Error("useAuth outside AuthProvider"); return c; };

const NEXT_KEY = "mt-after-login";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(!loginEnabled);
  const [team, setTeam] = useState<Team | null>(null);

  const loadMe = useCallback(async (c: SupabaseClient | null, s: Session | null) => {
    if (!c || !s) { setMe(null); setTeam(null); return null; }
    const [{ data, error }, t] = await Promise.all([c.rpc("me"), c.rpc("my_team_access")]);
    const m = error ? null : ((Array.isArray(data) ? data[0] : data) as Me) || null;
    const tm = t.error ? null : ((Array.isArray(t.data) ? t.data[0] : t.data) as Team) || null;
    setTeam(tm && (tm.is_super || tm.cities?.length) ? tm : null);
    setMe(m); return m;
  }, []);

  useEffect(() => {
    const c = getSupabase();
    if (!c) return;
    setClient(c);
    let alive = true;
    c.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadMe(c, data.session);
      setReady(true);
    });
    const { data: sub } = c.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      // Never await Supabase calls inside this callback (it holds Supabase's login lock).
      setTimeout(() => { loadMe(c, s); }, 0);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadMe]);

  const rememberNext = (url: string) => { try { sessionStorage.setItem(NEXT_KEY, url); } catch {} };
  const takeNext = (fallback = "/events/") => {
    let u: string | null = null;
    try { u = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY); } catch {}
    return u && u.startsWith("/") && !u.startsWith("//") ? u : fallback;   // same-site paths only
  };

  const value: Ctx = {
    enabled: loginEnabled, ready, client, session, me, team,
    refreshMe: () => loadMe(client, session),
    logout: async () => { try { await client?.auth.signOut(); } catch {} setSession(null); setMe(null); setTeam(null); router.push("/"); },
    requireLogin: (next) => {
      if (!loginEnabled) return true;
      if (session) return true;
      rememberNext(next ?? window.location.pathname.replace(process.env.NEXT_PUBLIC_BASE_PATH ?? "", "") + window.location.search);
      router.push("/login/");
      return false;
    },
    rememberNext, takeNext,
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/** A random id for this browser, used to count swipe interest without login. */
export function deviceId(): string {
  let id: string | null = null;
  try { id = localStorage.getItem("mt-device"); } catch {}
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    id = crypto.randomUUID();
    try { localStorage.setItem("mt-device", id); } catch {}
  }
  return id;
}
