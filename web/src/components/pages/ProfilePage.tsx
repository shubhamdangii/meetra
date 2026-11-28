"use client";
import { compressImage } from "@/lib/imageCompress";
import { PhotoCropper } from "../PhotoCropper";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { Reveal } from "../ui";
import { burst } from "../fx";
import { XpCard } from "../xp";
import { InviteCard, Quests, useInvites, useQuestData } from "../Quests";
import { CONFIG } from "@/lib/config";

type Form = {
  displayName: string; city: string; occupation: string; bio: string; fullName: string; dob: string; gender: string;
  phone: string; email: string; instagram: string; linkedin: string; heard: string; rules: boolean;
};
const EMPTY: Form = { displayName: "", city: "", occupation: "", bio: "", fullName: "", dob: "", gender: "", phone: "", email: "", instagram: "", linkedin: "", heard: "", rules: false };

/* links → the exact formats the database accepts (undefined = invalid) */
function instaUrl(v: string) {
  v = v.trim(); if (!v) return null;
  const m = v.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?/i) || v.match(/^@?([A-Za-z0-9._]{1,30})$/);
  return m ? `https://instagram.com/${m[1]}` : undefined;
}
function linkedinUrl(v: string) {
  v = v.trim(); if (!v) return null;
  const m = v.match(/^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9_-]{3,100})\/?/i);
  return m ? `https://www.linkedin.com/in/${m[1]}` : undefined;
}

// Priority score: 7 parts, exactly 100. Same weights as the database (private.refresh_profile_status, migration 20261128060000).
function scoreParts(f: Form, avatar: string | null, emailVerified: boolean, words: boolean, prompt: boolean): [string, number, boolean][] {
  const bio = f.bio.trim().length;
  return [
    ["photo", 20, !!avatar], ["bio (20+ characters)", 15, bio >= 20], ["longer bio (80+ characters)", 10, bio >= 80],
    ["house rules", 15, f.rules], ["email verified", 15, emailVerified],
    ["three words", 10, words], ["prompt answer", 15, prompt],
  ];
}

const HOUSE_RULES = [
  "I'll be kind and include everyone at the table.",
  "I'll be on time, or tell my host if I'm running late.",
  "No pushy dating, selling or recruiting at plans.",
  "I'll respect privacy: no photos or numbers shared without a yes.",
  "If something feels off, I'll tell my host or the team.",
  "The details in my profile are true.",
];

export default function ProfilePage() {
  const auth = useAuth();
  const { toast, city } = useApp();
  const router = useRouter();
  const [f, setF] = useState<Form>(EMPTY);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [photoMsg, setPhotoMsg] = useState("");
  const [verifyMsg, setVerifyMsg] = useState("");
  const [link, setLink] = useState<{ code: string; waNumber: string; waLink: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string>("");   // snapshot of the form as last loaded/saved
  const linkPoll = useRef<ReturnType<typeof setInterval> | null>(null);
  const me = auth.me;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!auth.enabled || !auth.ready) return;
    if (!auth.session) { router.replace("/login/"); return; }
    if (!me || !auth.client || loaded) return;
    (async () => {
      const [u, p] = await Promise.all([
        auth.client!.from("users").select("display_name,avatar_url,bio,city_slug,occupation").eq("id", me.id).single(),
        auth.client!.from("user_private").select("full_name,date_of_birth,gender,phone,email,instagram_url,linkedin_url,heard_from,accepted_rules_at").eq("user_id", me.id).single(),
      ]);
      if (u.error || p.error) { setMsg({ text: "Couldn't load your profile: " + (u.error || p.error)!.message, ok: false }); return; }
      const U: any = u.data, P: any = p.data;
      setAvatar(U.avatar_url); setAcceptedAt(P.accepted_rules_at);
      const loadedForm: Form = {
        displayName: U.display_name === "New member" ? "" : U.display_name, city: U.city_slug || (city !== "all" ? city : ""), occupation: U.occupation || "", bio: U.bio || "",
        fullName: P.full_name || "", dob: P.date_of_birth || "", gender: P.gender || "", phone: (P.phone || "").replace(/^\+91/, ""), email: P.email || "",
        instagram: P.instagram_url ? "@" + P.instagram_url.split("/").filter(Boolean).pop() : "", linkedin: P.linkedin_url || "", heard: P.heard_from || "", rules: !!P.accepted_rules_at,
      };
      setF(loadedForm); setSaved(JSON.stringify(loadedForm));
      setLoaded(true);
    })();
  }, [auth.enabled, auth.ready, auth.session, me, auth.client, loaded, city, router]);
  useEffect(() => () => { if (linkPoll.current) clearInterval(linkPoll.current); }, []);
  // warn before leaving with unsaved changes
  const dirty = loaded && JSON.stringify(f) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // house rules: one tick per rule; all ticked = agreed (that's what's saved)
  const [ticks, setTicks] = useState<boolean[]>(() => HOUSE_RULES.map(() => false));
  useEffect(() => { if (loaded) setTicks(HOUSE_RULES.map(() => f.rules)); }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const tick = (i: number, on: boolean) => { const t = ticks.map((x, j) => (j === i ? on : x)); setTicks(t); set("rules", t.every(Boolean)); };
  const quest = useQuestData();
  const parts = scoreParts(f, avatar, !!me?.email_verified, (quest.data?.three_words?.length ?? 0) === 3, !!quest.data?.prompt_a?.trim());
  const score = parts.reduce((s, p) => s + (p[2] ? p[1] : 0), 0);
  const todo = parts.filter((p) => !p[2]).sort((a, b) => b[1] - a[1]);
  const maxDob = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10); })();

  const [cropFile, setCropFile] = useState<File | null>(null);
  const invites = useInvites();
  // the three words and the prompt are saved by the quest cards (their own save); the database recomputes the score, so fetch it again
  const questKey = quest.data ? `${quest.data.three_words?.length ?? 0}|${quest.data.prompt_a ?? ""}` : "";
  const firstQuest = useRef(true);
  useEffect(() => { if (!questKey) return; if (firstQuest.current) { firstQuest.current = false; return; } auth.refreshMe(); }, [questKey]); // eslint-disable-line react-hooks/exhaustive-deps
  async function upload(file: File) {
    if (!auth.client || !auth.session || !me) { setAvatar(URL.createObjectURL(file)); return; }
    setPhotoMsg("Uploading…");
    try {
      const small = await compressImage(file, "avatar");
      const path = `${auth.session.user.id}/photo-${Date.now()}.${small.ext}`;
      const up = await auth.client.storage.from("avatars").upload(path, small.blob, { contentType: small.type, upsert: true });
      if (up.error) throw up.error;
      const url = auth.client.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const r = await auth.client.from("users").update({ avatar_url: url }).eq("id", me.id);
      if (r.error) throw r.error;
      setAvatar(url); setPhotoMsg("Photo saved ✓"); toast("Photo saved ✓"); auth.refreshMe();
    } catch (e) { setPhotoMsg("Upload failed: " + (e as Error).message); toast("Couldn't upload the photo. Try a smaller one."); }
  }

  async function verifyWhatsApp() {
    if (!auth.client) return;
    const { data, error } = await auth.client.functions.invoke("wa-login", { body: { action: "start", purpose: "link" } });
    if (error || data?.error) return setVerifyMsg(data?.error || "WhatsApp verification isn't available right now.");
    setLink(data); setVerifyMsg("");
    if (linkPoll.current) clearInterval(linkPoll.current);
    linkPoll.current = setInterval(async () => {
      const r = await auth.client!.functions.invoke("wa-login", { body: { action: "poll", id: data.id, secret: data.secret } });
      const d = r.data; if (!d || d.status === "pending") return;
      clearInterval(linkPoll.current!); setLink(null);
      if (d.linked) { set("phone", d.phone.replace(/^\+91/, "")); await auth.refreshMe(); setVerifyMsg("WhatsApp number verified ✓"); }
      else setVerifyMsg(d.error || (d.status === "expired" ? "That code expired. Tap Verify again." : "Couldn't verify. Tap Verify again."));
    }, 2500);
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (!auth.client || !me) return;
    const insta = instaUrl(f.instagram), li = linkedinUrl(f.linkedin);
    if (insta === undefined) return setMsg({ text: "That Instagram handle doesn't look right. Use @yourhandle.", ok: false });
    if (li === undefined) return setMsg({ text: "Use your LinkedIn profile link, like linkedin.com/in/yourname.", ok: false });
    if (f.dob && f.dob > maxDob) return setMsg({ text: "You must be 18 or older to join.", ok: false });
    const phoneVal = /^[6-9]\d{9}$/.test(f.phone) ? "+91" + f.phone : null;
    if (CONFIG.mobileVerification && f.phone && !phoneVal) return setMsg({ text: "Enter a valid 10-digit WhatsApp number.", ok: false });
    setSaving(true); setMsg({ text: "Saving…", ok: true });
    const pub = { display_name: f.displayName.trim() || "New member", city_slug: f.city || null, occupation: f.occupation.trim() || null, bio: f.bio.trim() || null };
    const pri: Record<string, unknown> = {
      full_name: f.fullName.trim() || null, date_of_birth: f.dob || null, gender: f.gender || null, instagram_url: insta, linkedin_url: li,
      heard_from: f.heard || null, accepted_rules_at: f.rules ? acceptedAt || new Date().toISOString() : null,
    };
    if (CONFIG.mobileVerification && !me.phone_verified) pri.phone = phoneVal;                 // verified values are locked
    if (!me.email_verified) pri.email = f.email.trim().toLowerCase() || null;
    // one after the other, then one final score recompute (two parallel saves could leave a stale score everywhere else)
    const r1 = await auth.client.from("users").update(pub).eq("id", me.id);
    const r2 = r1.error ? { error: null } : await auth.client.from("user_private").update(pri).eq("user_id", me.id);
    if (!r1.error && !r2.error) await auth.client.rpc("refresh_my_profile");
    setSaving(false);
    const err = r1.error || r2.error;
    if (err) return setMsg({ text: /18 or older/.test(err.message) ? "You must be 18 or older to join." : "Couldn't save: " + err.message, ok: false });
    setAcceptedAt((pri.accepted_rules_at as string) ?? null); setSaved(JSON.stringify(f));
    const m = await auth.refreshMe();
    setMsg({ text: `Saved ✓ Your priority score is ${m?.profile_score ?? score}/100.`, ok: true });
    toast(`Saved · score ${m?.profile_score ?? score}/100`);
    if ((m?.profile_score ?? score) >= 70) burst(window.innerWidth / 2, window.innerHeight / 2, ["⭐", "🎉", "✨", "💪"]);
    const next = auth.takeNext("");
    if (next) setTimeout(() => router.push(next), 900);
  }

  const field = (id: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, full = false) => (
    <div className={`field ${full ? "full" : ""}`}><label htmlFor={id}>{label}</label>
      <input id={id} value={f[id] as string} onChange={(e) => set(id, e.target.value as never)} {...props} /></div>
  );

  return (
    <div className="wrap profile-wrap">
      <section className="page-hero" style={{ paddingBottom: 0 }}>
        <span className="eyebrow">Your profile</span>
        <h1 style={{ fontSize: "clamp(40px,6vw,68px)" }}>Let hosts <span className="serif">know you.</span></h1>
        <p>The more you share, the higher your <b>priority score</b>. When a plan is popular, seats and waiting-list places go to the most complete profiles first.</p>
        {!auth.enabled && <div className="setup-note" style={{ marginTop: 16 }}><b>Preview only.</b> Login isn&apos;t switched on, so this form can&apos;t be saved.</div>}
        <div className="ps">
          <div className="ps-head">
            <div className="ps-num"><motion.b key={score} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{score}</motion.b><span>/100</span></div>
            <div className="ps-meta"><b>Priority score</b><small>{score >= 100 ? "Top priority. Everything's done ✓" : score >= 70 ? "High priority. You're near the front." : `${70 - score} more points to reach high priority`}</small></div>
          </div>
          <div className="ps-bar" role="progressbar" aria-label="Priority score" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}>
            <motion.i animate={{ width: `${score}%` }} transition={{ type: "spring", stiffness: 110, damping: 20 }} /><span className="ps-mark" title="High priority from 70" />
          </div>
          <div className="ps-verify">
            {([["WhatsApp", !!me?.phone_verified, "#phone"], ["Email", !!me?.email_verified, "#email"]] as const).filter(([l]) => CONFIG.mobileVerification || l !== "WhatsApp").map(([l, ok, href]) => (
              <a key={l} href={href} className={`ps-v ${ok ? "ok" : ""}`}><i aria-hidden="true">{ok ? "✓" : "!"}</i><span>{l}</span><b>{ok ? "Verified" : "Not verified"}</b></a>
            ))}
          </div>
          <p className="ps-sum">Done: <b>{parts.filter((p) => p[2]).length}</b> of {parts.length} · Left: <b>{parts.filter((p) => !p[2]).reduce((n, p) => n + p[1], 0)}</b> points to get</p>
          <ul className="ps-checks" aria-label="Ways to raise your score">
            {[...todo, ...parts.filter((p) => p[2])].map(([l, w, ok]) => (
              <motion.li layout key={l} className={ok ? "ok" : ""}><i aria-hidden="true">{ok ? "✓" : ""}</i><span>{l[0].toUpperCase() + l.slice(1)}</span><b>+{w}</b></motion.li>
            ))}
          </ul>
        </div>
      </section>

      {auth.session && loaded && <Reveal><XpCard score={me?.profile_score ?? score} hasPhoto={!!avatar} bio={f.bio.trim().length} phoneVerified={!!me?.phone_verified}
        words={(quest.data?.three_words?.length ?? 0) === 3} prompt={!!quest.data?.prompt_a?.trim()} friends={invites?.joined ?? 0} friendsCame={invites?.came ?? 0} /></Reveal>}
      {auth.session && loaded && <Reveal><Quests q={quest} /></Reveal>}
      {auth.session && loaded && <Reveal><div id="invite"><InviteCard inv={invites} /></div></Reveal>}

      <form onSubmit={save} noValidate>
        <Reveal className="pcard">
          <h2>Your photo</h2><p className="muted">A clear photo of your face. Shown to other guests and hosts.</p>
          <div className="photo-row">
            <motion.div className="photo-prev" key={avatar || "none"} initial={{ scale: 0.8, rotate: -6 }} animate={{ scale: 1, rotate: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {avatar ? <img src={avatar} alt="Your photo" /> : "🙂"}
            </motion.div>
            <div>
              <label id="photo-btn" className="btn btn-white btn-sm" htmlFor="photo" style={{ cursor: "pointer" }}>Upload photo</label>
              <input id="photo" type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = ""; }} />
              <PhotoCropper file={cropFile} onCancel={() => setCropFile(null)} onDone={(f) => { setCropFile(null); upload(f); }} />
              <p className="hint" style={{ marginTop: 8 }}>Pick a photo, then choose the part that goes in the circle.</p>
              <p className="form-msg ok">{photoMsg}</p>
            </div>
          </div>
        </Reveal>

        <Reveal className="pcard">
          <h2>About you</h2><p className="muted">👀 Public: other guests see this.</p>
          <div className="pgrid">
            {field("displayName", "First name", { maxLength: 60, autoComplete: "given-name" })}
            <div className="field"><label htmlFor="city">City</label>
              <select id="city" value={f.city} onChange={(e) => set("city", e.target.value)}>
                <option value="">Choose…</option>{Object.entries(CONFIG.cities).filter(([, c]) => c.live).map(([k, c]) => <option key={k} value={k}>{c.name}</option>)}
              </select></div>
            {field("occupation", "What do you do?", { maxLength: 80, placeholder: "e.g. Product designer, CA student, Café owner" }, true)}
            <div className="field full"><label htmlFor="bio">A few lines about you <span className="hint">{f.bio.trim().length}/500</span></label>
              <textarea id="bio" maxLength={500} placeholder="What you're into, what you'd love to talk about, why you're joining…" value={f.bio} onChange={(e) => set("bio", e.target.value)} /></div>
          </div>
        </Reveal>

        <Reveal className="pcard">
          <h2>Private details</h2><p className="muted">🔒 Only you, the hosts of plans you request, and the {CONFIG.brand} team can see these.</p>
          <div className="pgrid">
            {field("fullName", "Full name (as on your ID)", { maxLength: 100, autoComplete: "name" }, true)}
            <div className="field"><label htmlFor="dob">Date of birth <span className="hint">18+ only</span></label><input id="dob" type="date" max={maxDob} value={f.dob} onChange={(e) => set("dob", e.target.value)} /></div>
            <div className="field"><label htmlFor="gender">Gender</label>
              <select id="gender" value={f.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="">Choose…</option><option value="woman">Woman</option><option value="man">Man</option><option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option>
              </select></div>
            {CONFIG.mobileVerification && (
            <div className="full verify-row">
              <div className="field"><label htmlFor="phone">WhatsApp number <span className={`vtag ${me?.phone_verified ? "yes" : "no"}`}>{me?.phone_verified ? "✓ verified" : "not verified"}</span></label>
                <div className="phone-row"><span>+91</span><input id="phone" inputMode="numeric" maxLength={10} autoComplete="tel-national" readOnly={!!me?.phone_verified} value={f.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} /></div></div>
              {auth.enabled && !me?.phone_verified && CONFIG.loginWithWhatsApp && <button className="btn btn-white btn-sm" type="button" onClick={verifyWhatsApp}>Verify</button>}
            </div>
            )}
            <AnimatePresence>
              {link && (
                <motion.div className="full" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  <div className="wa-code"><small>Send this on WhatsApp from your number</small><b>LOGIN {link.code}</b><small>to {link.waNumber}</small></div>
                  <a className="btn btn-sun btn-sm" href={link.waLink} target="_blank" rel="noopener noreferrer">Open WhatsApp &amp; send</a>
                  <p className="wa-wait" style={{ marginTop: 10 }}><span className="spinner" aria-hidden="true" /> Waiting for your message…</p>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="field full"><label htmlFor="email">Email <span className={`vtag ${me?.email_verified ? "yes" : "no"}`}>{me?.email_verified ? "✓ verified" : "not verified"}</span></label>
              <input id="email" type="email" maxLength={200} autoComplete="email" readOnly={!!me?.email_verified} value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
            <p className="form-msg ok full">{verifyMsg}</p>
          </div>
        </Reveal>

        <Reveal className="pcard">
          <h2>Social profile</h2><p className="muted">Helps hosts see you&apos;re a real person. 🔒 Private.</p>
          <div className="pgrid">
            {field("instagram", "Instagram (optional)", { placeholder: "@yourhandle" })}
            {field("linkedin", "LinkedIn (optional)", { placeholder: "linkedin.com/in/yourname" })}
            <div className="field full"><label htmlFor="heard">How did you hear about us?</label>
              <select id="heard" value={f.heard} onChange={(e) => set("heard", e.target.value)}>
                <option value="">Choose…</option>{["Instagram", "A friend", "WhatsApp group", "Google", "At a café or venue", "Other"].map((o) => <option key={o}>{o}</option>)}
              </select></div>
          </div>
        </Reveal>

        <Reveal className="pcard">
          <h2>House rules</h2><p className="muted">Tick each one to agree. <Link href="/safety/" style={{ textDecoration: "underline" }}>Read the full rules</Link></p>
          <div className="hr-list" role="group" aria-label="House rules">
            {HOUSE_RULES.map((rule, i) => (
              <label key={i} className={`hr-item ${ticks[i] ? "on" : ""}`}>
                <input type="checkbox" checked={ticks[i]} onChange={(e) => tick(i, e.target.checked)} />
                <span className="hr-box" aria-hidden="true"><svg viewBox="0 0 24 24"><motion.path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={false} animate={{ pathLength: ticks[i] ? 1 : 0 }} transition={{ duration: 0.25 }} /></svg></span>
                <span className="hr-txt">{rule}</span>
              </label>
            ))}
          </div>
          <p className={`hr-sum ${f.rules ? "ok" : ""}`}>{f.rules ? "✓ You've agreed to the house rules (+10)" : `${ticks.filter(Boolean).length} of ${HOUSE_RULES.length} ticked`}</p>
        </Reveal>

        <div className="save-bar">
          <div><b>Priority score: {score}/100</b><br /><small>{dirty ? <span style={{ color: "#B3134B", fontWeight: 700 }}>● Unsaved changes</span> : score === 100 ? "Top priority. All saved ✓" : "Save to update your priority. Nothing here is required."}</small></div>
          <motion.button whileTap={{ scale: 0.94 }} className="btn btn-sun" type="submit" disabled={!auth.enabled || saving || (loaded && !dirty)}>{saving ? "Saving…" : dirty || !loaded ? "Save" : "Saved ✓"}</motion.button>
        </div>
        {msg && <p className={`form-msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.text}</p>}
      </form>
      {auth.enabled && <div style={{ marginTop: 30, textAlign: "center" }}><button className="linkish" type="button" onClick={auth.logout}>Log out</button></div>}
    </div>
  );
}
