"use client";
// "Add meetra to your home screen": registers the service worker, catches Chrome's install prompt,
// and shows iPhone users how to do it from Safari's share menu.
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const HIDE_KEY = "mt-install-hidden";
let deferred: BIP | null = null;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

const standalone = () => typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
const isIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Mount once (in the layout). */
export function PwaSetup() {
  useEffect(() => {
    // updateViaCache "none": the phone never reuses its 10-minute copy of sw.js. Check for a new worker now and every time the app is brought back to the front.
    let stopChecks = () => {};
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/`, updateViaCache: "none" }).then((reg) => {
        const check = () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); };
        check(); document.addEventListener("visibilitychange", check);
        stopChecks = () => document.removeEventListener("visibilitychange", check);
      }).catch(() => {});
    }
    const onBip = (e: Event) => { e.preventDefault(); deferred = e as BIP; ping(); };
    const onInstalled = () => { deferred = null; ping(); };
    window.addEventListener("beforeinstallprompt", onBip); window.addEventListener("appinstalled", onInstalled);
    return () => { stopChecks(); window.removeEventListener("beforeinstallprompt", onBip); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  return null;
}

function useInstall() {
  const [, force] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => { const f = () => force((x) => x + 1); subs.add(f); setReady(true); return () => { subs.delete(f); }; }, []);
  const canPrompt = !!deferred; const ios = ready && isIos();
  const installed = ready && standalone();
  const install = async (): Promise<"prompted" | "ios" | "none"> => {
    if (deferred) { const d = deferred; await d.prompt(); await d.userChoice.catch(() => null); deferred = null; ping(); return "prompted"; }
    return ios ? "ios" : "none";
  };
  return { ready, canPrompt, ios, installed, install, available: ready && !installed && (canPrompt || ios) };
}

function IosSteps({ onClose }: { onClose: () => void }) {
  return (
    <motion.div className="ios-steps" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} role="dialog" aria-label="How to add meetra to your home screen">
      <b>Add meetra to your Home Screen</b>
      <ol><li>Open this page in <b>Safari</b></li><li>Tap the <b>Share</b> button <span aria-hidden="true">⬆️</span></li><li>Choose <b>Add to Home Screen</b></li></ol>
      <button type="button" className="btn btn-ink btn-sm" onClick={onClose}>Got it</button>
    </motion.div>
  );
}

/** Row for the ☰ menu sheet. */
export function InstallMenuItem() {
  const i = useInstall(); const [steps, setSteps] = useState(false);
  if (!i.available) return null;
  return (
    <>
      <button type="button" className="sheet-item install-item" onClick={async () => { if ((await i.install()) === "ios") setSteps(true); }}>
        <span>📲</span><b>Get the app<small>Add meetra to your home screen</small></b><i>→</i>
      </button>
      <AnimatePresence>{steps && <IosSteps onClose={() => setSteps(false)} />}</AnimatePresence>
    </>
  );
}

/** Small banner above the tab bar on phones. Hidden for 14 days after "Not now". */
export function InstallBanner() {
  const i = useInstall(); const [show, setShow] = useState(false); const [steps, setSteps] = useState(false);
  useEffect(() => {
    if (!i.available || window.innerWidth > 720) return;
    let hidden = 0; try { hidden = Number(localStorage.getItem(HIDE_KEY) || 0); } catch {}
    if (Date.now() - hidden < 14 * 864e5) return;
    const t = setTimeout(() => setShow(true), 12000);   // let people look around first
    return () => clearTimeout(t);
  }, [i.available]);
  const hide = () => { setShow(false); setSteps(false); try { localStorage.setItem(HIDE_KEY, String(Date.now())); } catch {} };
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="install-banner" initial={{ y: 120, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 120, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 26 }}>
          {steps ? <IosSteps onClose={hide} /> : <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE}/icons/icon-192.png`} alt="" width={44} height={44} />
            <div><b>Get the meetra app</b><small>One tap from your home screen. Free.</small></div>
            <button type="button" className="btn btn-sun btn-sm" onClick={async () => { const r = await i.install(); if (r === "ios") setSteps(true); else hide(); }}>Add</button>
            <button type="button" className="ib-x" aria-label="Not now" onClick={hide}>✕</button>
          </>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
