"use client";
// Is the logged-in member an approved host? (cached per login so menus don't re-ask)
import { useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";

const cache = new Map<string, Promise<boolean>>();
export function useIsHost(): boolean {
  const auth = useAuth();
  const uid = auth.session?.user.id;
  const [isHost, setIsHost] = useState(false);
  useEffect(() => {
    if (!auth.client || !uid) { setIsHost(false); return; }
    if (!cache.has(uid)) cache.set(uid, Promise.resolve(auth.client.rpc("my_host")).then(({ data, error }) => !error && !!data && (data as { status?: string }).status === "active", () => false));
    let alive = true; cache.get(uid)!.then((v) => { if (alive) setIsHost(v); });
    return () => { alive = false; };
  }, [auth.client, uid]);
  return isHost;
}
