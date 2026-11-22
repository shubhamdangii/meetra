"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthProvider";
import { useApp } from "../AppProvider";
import { CONFIG } from "@/lib/config";
import { absUrl } from "@/lib/store";

type WaReq = { id: string; secret: string; code: string; waNumber: string; waLink: string; expiresAt: string };
const WA_KEY = "mt-wa-login";
const loadWa = (): WaReq | null => { try { return JSON.parse(sessionStorage.getItem(WA_KEY) || "null"); } catch { return null; } };
const saveWa = (r: WaReq | null) => { try { r ? sessionStorage.setItem(WA_KEY, JSON.stringify(r)) : sessionStorage.removeItem(WA_KEY); } catch {} };

const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
);
const WaIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#06301A" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" /></svg>
);

export default function LoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [wa, setWa] = useState<WaReq | null>(null);
  const [waState, setWaState] = useState<"waiting" | "done" | "expired" | "error">("waiting");
  const [waMsg, setWaMsg] = useState("");
  const [left, setLeft] = useState(0);
  const [qr, setQr] = useState<string | null>(null);
  const [waTest, setWaTest] = useState(false);
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  const errText = params.get("error_description") || params.get("error");
  const cameBack = params.has("code");
  const resetMode = params.get("reset") === "1";   // came back from a "reset password" email
  const showWa = CONFIG.loginWithWhatsApp || waTest;

  useEffect(() => { setWaTest(window.location.hash === "#whatsapp-test"); }, []);

  // Already logged in → go on, exactly once. (Running again when the profile loaded used to throw away
  // the saved "next" page and bounce people to /profile/ instead of back to the plan they were booking.)
  const went = useRef(false);
  useEffect(() => {
    if (!auth.ready || !auth.session || went.current || resetMode) return;
    went.current = true;
    (async () => {
      const m = auth.me ?? (await auth.refreshMe());
      router.replace(auth.takeNext(m && m.profile_score >= 70 ? "/events/" : "/profile/"));
    })();
  }, [auth.ready, auth.session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Instagram / Facebook / WhatsApp in-app browsers: Google refuses to log in there.
  const [inApp, setInApp] = useState(false);
  useEffect(() => { setInApp(/Instagram|FBAN|FBAV|FB_IAB|Line\/|WhatsApp|Snapchat|; wv\)/i.test(navigator.userAgent)); }, []);

  // Came back from WhatsApp (page reloaded)? Keep waiting for the same code.
  useEffect(() => { const p = loadWa(); if (p && new Date(p.expiresAt) > new Date()) setWa(p); }, []);

  useEffect(() => {
    if (!wa || !auth.client) return;
    setWaState("waiting"); setWaMsg("");
    if (!/Android|iPhone|iPad/i.test(navigator.userAgent)) QRCode.toDataURL(wa.waLink, { width: 180, margin: 1 }).then(setQr).catch(() => setQr(null));
    const tick = setInterval(() => setLeft(Math.max(0, Math.round((new Date(wa.expiresAt).getTime() - Date.now()) / 1000))), 1000);
    const check = async () => {
      const { data, error } = await auth.client!.functions.invoke("wa-login", { body: { action: "poll", id: wa.id, secret: wa.secret } });
      if (error && !data) return;
      if (data.status === "pending") return;
      if (polling.current) clearInterval(polling.current);
      saveWa(null);
      if (data.status === "done" && data.session) {
        setWaState("done"); setWaMsg("Got your message. Logging you in…");
        await auth.client!.auth.setSession(data.session);   // AuthProvider sees the new session and redirects
      } else if (data.status === "expired") { setWaState("expired"); setWaMsg('This code expired. Tap "Get a new code".'); }
      else { setWaState("error"); setWaMsg(data.error || 'That code was already used. Tap "Get a new code".'); }
    };
    polling.current = setInterval(check, 2500); check();
    return () => { clearInterval(tick); if (polling.current) clearInterval(polling.current); };
  }, [wa, auth.client]);

  async function google() {
    if (!auth.client) return;
    setBusy(true);
    const { error } = await auth.client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: absUrl("/login/"), queryParams: { prompt: "select_account" } } });
    if (error) { setBusy(false); setMsg("Google login didn't start: " + error.message); }
  }

  async function startWa() {
    if (!auth.client) return;
    setBusy(true); setMsg("Getting your code…");
    const { data, error } = await auth.client.functions.invoke("wa-login", { body: { action: "start" } });
    setBusy(false);
    if (error || data?.error) return setMsg(data?.error || "WhatsApp login isn't available right now.");
    setMsg(""); saveWa(data); setWa(data);
  }
  const stopWa = () => { if (polling.current) clearInterval(polling.current); saveWa(null); setWa(null); setQr(null); };

  return (
    <div className="wrap">
      <div className="auth-wrap">
        <motion.div className="auth-card" initial={{ opacity: 0, y: 24, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 20 }}>
          {!auth.enabled && <div className="setup-note"><b>Login isn&apos;t switched on yet.</b> Add your Supabase URL and anon key in <code>src/lib/config.ts</code>.</div>}
          {auth.enabled && auth.ready && !auth.session && (errText || cameBack) && (
            <div className="setup-note"><b>Login didn&apos;t finish.</b> {errText ? errText.replace(/\+/g, " ") : "Google sent you back, but this browser blocked the last step."}<br />
              Try again. If it keeps happening: turn off ad/tracker blocking for this site (in Brave: the lion icon → Shields off), or use Chrome or an incognito window.</div>
          )}
          {auth.enabled && inApp && !auth.session && (
            <div className="setup-note"><b>Open this page in Chrome or Safari to log in.</b> Google blocks login inside Instagram and WhatsApp.
              Tap <b>⋮</b> or <b>…</b> at the top → <b>Open in browser</b>.{" "}
              <button type="button" className="btn btn-white btn-sm" style={{ marginTop: 8 }} onClick={() => { navigator.clipboard?.writeText(window.location.href).then(() => setMsg("Link copied. Paste it in Chrome or Safari."), () => {}); }}>Copy link</button>
            </div>
          )}
          {waTest && !CONFIG.loginWithWhatsApp && <div className="setup-note"><b>WhatsApp test mode.</b> Hidden from the public until switched on in config.</div>}

          <AnimatePresence mode="wait">
            {resetMode && auth.session ? (
              <motion.section key="reset" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                <NewPassword onDone={() => router.replace(auth.takeNext("/events/"))} />
              </motion.section>
            ) : !wa ? (
              <motion.section key="choose" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h1>Welcome to <span className="serif">{CONFIG.brand}.</span></h1>
                <p>Log in to request seats. New here? Google creates your account in one tap, or sign up with email.</p>
                {CONFIG.loginWithGoogle && <motion.button whileTap={{ scale: 0.97 }} className="provider" type="button" disabled={!auth.enabled || busy} onClick={google}><GoogleIcon /> Continue with Google</motion.button>}
                {auth.enabled && <><div className="or">or use email</div><EmailBox /></>}
                {CONFIG.loginWithGoogle && showWa && <div className="or">or</div>}
                {showWa && <motion.button whileTap={{ scale: 0.97 }} className="provider wa" type="button" disabled={!auth.enabled || busy} onClick={startWa}><WaIcon /> Continue with WhatsApp</motion.button>}
                <p className="form-msg err" role="status">{msg}</p>
              </motion.section>
            ) : (
              <motion.section key="wa" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <h1>Send one <span className="serif">WhatsApp.</span></h1>
                <p>Tap the button. WhatsApp opens with your code already typed. Just press <b>Send</b> and come back here.</p>
                <a className="provider wa" href={wa.waLink} target="_blank" rel="noopener noreferrer"><WaIcon /> Open WhatsApp &amp; send</a>
                <motion.div className="wa-code" initial={{ scale: 0.9 }} animate={{ scale: 1 }}><small>Your message</small><b>LOGIN {wa.code}</b><small>to {wa.waNumber}</small></motion.div>
                {qr && <div className="wa-qr"><small>On a computer? Scan with your phone&apos;s camera:</small>{/* eslint-disable-next-line @next/next/no-img-element */}<div id="waQrImg"><img src={qr} alt="QR code that opens WhatsApp with your login message" width={160} height={160} /></div></div>}
                {waState === "waiting" && <p className="wa-wait"><span className="spinner" aria-hidden="true" /> Waiting for your message… ({Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")})</p>}
                <p className={`form-msg ${waState === "done" ? "ok" : "err"}`} role="status">{waMsg}</p>
                <p style={{ marginTop: 14, fontSize: 14, display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <button className="linkish" type="button" onClick={() => { stopWa(); startWa(); }}>Get a new code</button>
                  <button className="linkish" type="button" onClick={stopWa}>Back</button>
                </p>
              </motion.section>
            )}
          </AnimatePresence>
          <p className="fine" style={{ marginTop: 20 }}>By continuing you agree to our <Link href="/about/#terms" style={{ textDecoration: "underline" }}>terms</Link> and <Link href="/about/#safety" style={{ textDecoration: "underline" }}>house rules</Link>. We never post anything or message your contacts.</p>
        </motion.div>
      </div>
    </div>
  );
}

/* ---------- email + password: log in, sign up, forgot password ---------- */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
function EmailBox() {
  const auth = useAuth();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false); const [note, setNote] = useState<{ t: string; ok: boolean } | null>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!auth.client) return;
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) return setNote({ t: "Enter a valid email address.", ok: false });
    if (mode !== "forgot" && pw.length < 8) return setNote({ t: "Password must be at least 8 characters.", ok: false });
    setBusy(true); setNote(null);
    try {
      if (mode === "login") {
        const { error } = await auth.client.auth.signInWithPassword({ email: em, password: pw });
        if (error) setNote({ t: /confirm/i.test(error.message) ? "Please confirm your email first. Check your inbox (and spam) for our link." : /invalid/i.test(error.message) ? "Wrong email or password. Forgot it? Tap \"Forgot password\"." : error.message, ok: false });
        // success → the login page sees the new session and sends you on
      } else if (mode === "signup") {
        const { data, error } = await auth.client.auth.signUp({ email: em, password: pw, options: { emailRedirectTo: absUrl("/login/") } });
        if (error) setNote({ t: /already|registered/i.test(error.message) ? "This email already has an account. Log in instead." : error.message, ok: false });
        else if (data.user && (data.user.identities?.length ?? 1) === 0) setNote({ t: "This email already has an account. Log in instead (or use Google if you signed up with it).", ok: false });
        else if (!data.session) setNote({ t: "Almost done! We sent a link to " + em + ". Open it on this phone to finish signing up.", ok: true });
      } else {
        const { error } = await auth.client.auth.resetPasswordForEmail(em, { redirectTo: absUrl("/login/?reset=1") });
        setNote(error ? { t: error.message, ok: false } : { t: "If that email has an account, a reset link is on its way. Check your inbox (and spam).", ok: true });
      }
    } catch { setNote({ t: "Network problem. Try again.", ok: false }); }
    setBusy(false);
  }

  const tabs: [typeof mode, string][] = [["login", "Log in"], ["signup", "Sign up"]];
  return (
    <form className="email-box" onSubmit={submit} noValidate>
      {mode !== "forgot" && <div className="auth-seg" role="tablist">{tabs.map(([m, l]) => (
        <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => { setMode(m); setNote(null); }}>{l}</button>
      ))}</div>}
      {mode === "forgot" && <p style={{ margin: "0 0 8px" }}><b>Reset your password.</b> We&apos;ll email you a link.</p>}
      <div className="field"><label htmlFor="em">Email</label><input id="em" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></div>
      {mode !== "forgot" && <div className="field"><label htmlFor="pw">Password</label>
        <div className="pw-wrap"><input id="pw" type={show ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} placeholder={mode === "signup" ? "At least 8 characters" : ""} required />
          <button type="button" className="pw-eye" onClick={() => setShow((x) => !x)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button></div></div>}
      <motion.button whileTap={{ scale: 0.97 }} className="btn btn-ink btn-block" type="submit" disabled={busy}>
        {busy ? "Please wait…" : mode === "login" ? "Log in →" : mode === "signup" ? "Create account →" : "Send reset link →"}
      </motion.button>
      <p style={{ marginTop: 10, fontSize: 14 }}>
        {mode === "login" && <button type="button" className="linkish" onClick={() => { setMode("forgot"); setNote(null); }}>Forgot password?</button>}
        {mode === "forgot" && <button type="button" className="linkish" onClick={() => { setMode("login"); setNote(null); }}>← Back to log in</button>}
      </p>
      {note && <p className={`form-msg ${note.ok ? "ok" : "err"}`} role="status">{note.t}</p>}
    </form>
  );
}

function NewPassword({ onDone }: { onDone: () => void }) {
  const auth = useAuth(); const { toast } = useApp();
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (pw.length < 8) return setErr("Password must be at least 8 characters.");
    if (pw !== pw2) return setErr("The two passwords don't match.");
    setBusy(true);
    const { error } = await auth.client!.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(error.message);
    toast("Password updated ✓"); onDone();
  }
  return (
    <form className="email-box" onSubmit={save} noValidate>
      <h1>New <span className="serif">password.</span></h1>
      <div className="field"><label htmlFor="np">New password</label><input id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" /></div>
      <div className="field"><label htmlFor="np2">Type it again</label><input id="np2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
      <button className="btn btn-ink btn-block" type="submit" disabled={busy}>{busy ? "Saving…" : "Save password →"}</button>
      {err && <p className="form-msg err" role="status">{err}</p>}
    </form>
  );
}
