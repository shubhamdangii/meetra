"use client";
// Is the logged-in member a host? (cached per login so menus don't re-ask)
import { createElement, Fragment, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../AuthProvider";

type HostStatus = "none" | "active" | "inactive";
const cache = new Map<string, Promise<HostStatus>>();

/** "active" / "inactive" host profile, "none", or undefined while loading. */
export function useHostStatus(): HostStatus | undefined {
  const auth = useAuth();
  const uid = auth.session?.user.id;
  const [st, setSt] = useState<HostStatus | undefined>(undefined);
  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.client || !uid) { setSt("none"); return; }
    if (!cache.has(uid)) cache.set(uid, Promise.resolve(auth.client.rpc("my_host")).then(({ data, error }) =>
      error || !data ? "none" : (data as { status?: string }).status === "active" ? "active" : "inactive", () => "none" as const));
    let alive = true; cache.get(uid)!.then((v) => { if (alive) setSt(v); });
    return () => { alive = false; };
  }, [auth.ready, auth.client, uid]);
  return st;
}

/** An active host (can add plans). */
export function useIsHost(): boolean {
  return useHostStatus() === "active";
}

/** Renders its children only for people who aren't hosts yet (hides every "Become a host" entry point). */
export function NotHost({ children }: { children: ReactNode }) {
  const st = useHostStatus();
  return st === "none" ? createElement(Fragment, null, children) : null;
}
