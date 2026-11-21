// localStorage that never throws (private mode, blocked storage, server rendering).
export const store = {
  get<T>(k: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try { const v = localStorage.getItem(k); return v == null ? fallback : (JSON.parse(v) as T); } catch { return fallback; }
  },
  set(k: string, v: unknown) {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
  },
};

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** Full URL of a page on this site, e.g. absUrl("/login/") */
export const absUrl = (path: string) => (typeof window === "undefined" ? path : `${window.location.origin}${BASE_PATH}${path}`);
