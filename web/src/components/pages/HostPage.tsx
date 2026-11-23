"use client";
// Host waiting list: apply → see your place in line → follow your application through to "Live".
// With login off, the pitch goes to the team on WhatsApp instead.
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { HostDesk, useMyHost } from "../host/HostDesk";
import { burstFrom, Gallery } from "../fx";
import { Reveal, WhatsAppDone } from "../ui";
import { CONFIG } from "@/lib/config";
import { CATEGORIES } from "@/lib/data";
import { whatsappLink } from "@/lib/events";

type App = {
  id: number; city_slug: string; plan_title: string; category: string; pitch: string | null; experience: string | null;
  frequency: string | null; group_size: number | null; availability: string | null; status: string; team_note: string | null; created_at: string;
};
const OPEN = ["applied", "shortlisted", "call_scheduled", "trial", "waitlisted"];
const STEPS = [["applied", "Applied"], ["shortlisted", "Shortlisted"], ["call_scheduled", "Call with us"], ["trial", "Trial plan"], ["approved", "Live 🎉"]] as const;
const STATUS_TEXT: Record<string, [string, string, string]> = {
  applied: ["📨", "You're in the host line", "We read every pitch. Best-explained plans and fuller profiles move up first."],
  shortlisted: ["⭐", "You've been shortlisted!", "Someone from the team will message you to set up a quick call."],
  call_scheduled: ["📞", "Call booked", "Check the note below for the time. It's a relaxed 15-minute chat."],
  trial: ["🧪", "Trial plan time", "You'll run one small plan with a buddy host. Then you go live."],
  waitlisted: ["🕒", "On the host waiting list", "We have enough hosts for this kind of plan right now. You keep your place in line."],
  approved: ["🎉", "You're a meetra host!", "Welcome to the crew. The team will set up your first public plan with you."],
};
const IDEAS: [string, string][] = [
  ["Sunday chess + chai", "games"], ["Silent book club", "outing"], ["Sunrise cycling to Nahargarh", "sports"], ["Pickleball for beginners", "sports"],
  ["Street-food walk in the old city", "food"], ["Pottery for first-timers", "art"], ["Stand-up open mic", "night"], ["Indie film + chat", "film"],
  ["Run club, 5 km easy", "sports"], ["Language swap café", "games"], ["Sketching at the stepwell", "art"], ["Weekend trip to Pushkar", "trips"],
  ["Startup founders' breakfast", "food"], ["Dance class: Bollywood basics", "art"], ["Karaoke night", "night"], ["Board games for introverts", "games"],
];
const PERKS = [
  ["🙋", "var(--sun)", "We fill the table", "Your plan goes in front of our whole community in your city, every week."],
  ["📍", "var(--mint)", "Venues sorted", "Partner cafés, courts and studios that already know us."],
  ["💸", "#FFB3CB", "Earn from every plan", "A share of every paid seat, paid out weekly."],
  ["🧰", "var(--sky)", "A host playbook", "Icebreakers, running orders and a buddy host for your first plan."],
  ["✓", "var(--violet)", "The blue tick", "After a quick call with our team, you're a verified host."],
];
const DRAFT_KEY = "mt-host-draft";
const cats = (CATEGORIES as { id: string; label: string; icon: string }[]).filter((c) => c.id !== "all");
const liveCities = Object.entries(CONFIG.cities).filter(([, c]) => c.live);

const blank = (city: string) => ({ city_slug: CONFIG.cities[city]?.live ? city : CONFIG.defaultCity, plan_title: "", category: "games", pitch: "", experience: "", frequency: "monthly", group_size: "10", availability: "" });

/** /host/: approved hosts get their Host desk; everyone else sees the application. */
export function HostPage() {
  const host = useMyHost();
  const auth = useAuth();
  if (auth.enabled && auth.session && host === undefined) return <div className="skeleton" style={{ minHeight: 320, marginBottom: 40 }} />;
  if (host) return <HostDesk host={host} />;
  return <HostApply />;
}

function HostApply() {
  const { city, toast, confirm } = useApp();
  const auth = useAuth();
  const [v, setV] = useState(() => blank(city));
  const [app, setApp] = useState<App | null | undefined>(undefined); // undefined = loading
  const [place, setPlace] = useState<{ place: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [waText, setWaText] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  // Bring back a pitch typed before logging in.
  useEffect(() => {
    try { const d = sessionStorage.getItem(DRAFT_KEY); if (d) { setV((x) => ({ ...x, ...JSON.parse(d) })); sessionStorage.removeItem(DRAFT_KEY); } } catch {}
  }, []);

  const load = useCallback(async () => {
    if (!auth.client || !auth.me) { setApp(auth.ready ? null : undefined); return; }
    const { data } = await auth.client.from("host_applications").select("*").eq("user_id", auth.me.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setApp((data as App) ?? null);
    if (data && OPEN.includes((data as App).status)) {
      const { data: q } = await auth.client.rpc("my_host_queue_position");
      setPlace(q?.[0] ? { place: q[0].place, total: q[0].total } : null);
    } else setPlace(null);
  }, [auth.client, auth.me, auth.ready]);
  useEffect(() => { load(); }, [load]);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const btn = formRef.current?.querySelector("button[type=submit]") ?? null;
    if (!auth.enabled) {
      const c = CONFIG.cities[v.city_slug]?.name ?? v.city_slug;
      setWaText(`Hi! I'd like to host on ${CONFIG.brand}.\n\nCity: ${c}\nPlan: ${v.plan_title}\nHow often: ${v.frequency}\nWhat happens: ${v.pitch}${v.experience ? "\nExperience: " + v.experience : ""}`);
      return;
    }
    if (!auth.session) { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(v)); } catch {} auth.requireLogin("/host/"); return; }
    if (!auth.client || !auth.me) return toast("Still loading your account — try again in a second.");
    setBusy(true);
    const { error } = await auth.client.from("host_applications").insert({
      city_slug: v.city_slug, plan_title: v.plan_title.trim(), category: v.category, pitch: v.pitch.trim() || null,
      experience: v.experience.trim() || null, frequency: v.frequency, group_size: Number(v.group_size) || null, availability: v.availability.trim() || null,
    });
    setBusy(false);
    if (error) return toast(/one_open|duplicate|unique/i.test(error.message) ? "You already have an open application." : "Couldn't send it: " + error.message);
    burstFrom(btn, ["🎙️", "🎉", "✨", "🙌", "⭐"]);
    toast("You're in the host line ✓");
    load();
  }

  async function withdraw() {
    if (!app || !auth.client) return;
    if (!(await confirm({ title: "Withdraw your host application?", body: "You can apply again later.", danger: true, ok: "Yes, withdraw", cancel: "Keep it" }))) return;
    const { error } = await auth.client.from("host_applications").update({ status: "withdrawn" }).eq("id", app.id);
    if (error) return toast("Couldn't withdraw: " + error.message);
    toast("Application withdrawn"); setV(blank(city)); load();
  }

  const open = app && (OPEN.includes(app.status) || app.status === "approved");
  const stepIdx = app ? STEPS.findIndex(([s]) => s === app.status) : -1;
  const name = auth.me?.display_name && auth.me.display_name !== "New member" ? auth.me.display_name.split(" ")[0] : "";

  return (
    <>
      <ol className="host-steps" aria-label="How hosting works">
        {STEPS.map(([s, label], i) => (
          <motion.li key={s} data-n={i + 1} className={open && stepIdx >= 0 ? (i < stepIdx ? "done" : i === stepIdx ? "now" : "") : ""}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>{label}</motion.li>
        ))}
      </ol>

      <section className="split host-split" style={{ paddingBottom: 30 }}>
        <Reveal className="panel" id="apply">
          <AnimatePresence mode="wait">
            {waText ? <WhatsAppDone key="wa" text={waText} heading="Love it — one last tap" link={whatsappLink(waText)} />
              : app === undefined && auth.enabled && auth.session ? <div key="load" className="skeleton" style={{ minHeight: 320 }} />
              : open ? (
                <motion.div key="status" className={`status-card s-${app!.status === "approved" ? "approved" : app!.status === "waitlisted" ? "waitlisted" : "pending"}`}
                  initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
                  <motion.div className="st-ic" initial={{ rotate: -20, scale: 0.5 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 10 }}>{STATUS_TEXT[app!.status][0]}</motion.div>
                  <b>{STATUS_TEXT[app!.status][1]}</b>
                  {place && app!.status !== "approved" && (
                    <div style={{ margin: "12px 0 4px" }}>
                      <div className="queue-big">#{place.place}</div>
                      <small className="muted">in line for {CONFIG.cities[app!.city_slug]?.name ?? app!.city_slug} · {place.total} {place.total === 1 ? "application" : "applications"}</small>
                    </div>
                  )}
                  <p>{STATUS_TEXT[app!.status][2]}</p>
                  <p style={{ fontWeight: 700 }}>“{app!.plan_title}”</p>
                  {app!.team_note && <div className="team-note"><b style={{ fontSize: 13, display: "inline" }}>Note from the team:</b> {app!.team_note}</div>}
                  {app!.status !== "approved" && (
                    <p className="fine" style={{ marginTop: 12 }}>Move up the line: <Link href="/profile/" style={{ textDecoration: "underline" }}>complete your profile</Link> (score {auth.me?.profile_score ?? 0}/100).</p>
                  )}
                  {app!.status !== "approved" && <button className="linkish" type="button" onClick={withdraw}>Withdraw application</button>}
                </motion.div>
              ) : (
                <motion.form key="form" ref={formRef} exit={{ opacity: 0 }} onSubmit={submit}>
                  <h2 style={{ fontSize: 30, letterSpacing: "-.04em", marginBottom: 6 }}>{name ? `Pitch your plan, ${name}` : "Pitch your plan"}</h2>
                  <p className="muted" style={{ marginBottom: 18 }}>
                    {app?.status === "rejected" ? "Not this time last round — try a new idea! " : app?.status === "withdrawn" ? "Welcome back. " : ""}
                    Takes 2 minutes. {auth.enabled ? "You'll get your place in the host line straight away." : "We reply on WhatsApp within a day."}
                  </p>
                  <div className="field"><label htmlFor="hp">What&apos;s the plan?</label><input id="hp" required minLength={3} maxLength={120} placeholder="e.g. Sunday chess + chai at a café" value={v.plan_title} onChange={set("plan_title")} /></div>
                  <div className="field-row">
                    <div className="field"><label htmlFor="hc">Kind of plan</label><select id="hc" value={v.category} onChange={set("category")}>{cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}<option value="other">✦ Something else</option></select></div>
                    <div className="field"><label htmlFor="hcity">City</label><select id="hcity" value={v.city_slug} onChange={set("city_slug")}>{liveCities.map(([slug, c]) => <option key={slug} value={slug}>{c.name}</option>)}</select></div>
                  </div>
                  <div className="field"><label htmlFor="hw">What happens, and who&apos;s it for?</label><textarea id="hw" required maxLength={1500} placeholder="Walk us through the first 15 minutes. How do strangers end up talking?" value={v.pitch} onChange={set("pitch")} /></div>
                  <div className="field-row">
                    <div className="field"><label htmlFor="hf">How often?</label><select id="hf" value={v.frequency} onChange={set("frequency")}><option value="once">Just once</option><option value="monthly">Monthly</option><option value="fortnightly">Every 2 weeks</option><option value="weekly">Weekly</option></select></div>
                    <div className="field"><label htmlFor="hg">Group size</label><input id="hg" type="number" min={2} max={200} value={v.group_size} onChange={set("group_size")} /></div>
                  </div>
                  <div className="field"><label htmlFor="ha">When are you free? (optional)</label><input id="ha" maxLength={200} placeholder="Weekday evenings, Sunday mornings…" value={v.availability} onChange={set("availability")} /></div>
                  <div className="field"><label htmlFor="he">Hosted anything before? (optional)</label><textarea id="he" maxLength={800} placeholder="Clubs, events, classes, college fests — or nothing yet, that's fine!" value={v.experience} onChange={set("experience")} /></div>
                  <motion.button whileTap={{ scale: 0.96 }} className="btn btn-sun btn-block" type="submit" disabled={busy}>
                    {!auth.enabled ? "Send on WhatsApp →" : auth.session ? (busy ? "Sending…" : "Join the host line →") : "Log in & join the host line →"}
                  </motion.button>
                  {auth.enabled && <p className="fine" style={{ marginTop: 8 }}>Your name, photo and Instagram come from <Link href="/profile/" style={{ textDecoration: "underline" }}>your profile</Link>. Fuller profiles move up the line.</p>}
                </motion.form>
              )}
          </AnimatePresence>
        </Reveal>

        <div>
          {!open && (
            <div style={{ marginBottom: 26 }}>
              <h3 style={{ fontSize: 20, letterSpacing: "-.03em", marginBottom: 10 }}>Stuck for an idea? Tap one ✨</h3>
              <Gallery label="Plan ideas">
                {IDEAS.map(([t, c]) => (
                  <motion.button key={t} type="button" className="idea-chip" whileTap={{ scale: 0.92 }}
                    onClick={() => { setV((x) => ({ ...x, plan_title: t, category: c })); document.getElementById("hp")?.focus(); }}>{t}</motion.button>
                ))}
              </Gallery>
            </div>
          )}
          <div className="perks">
            {PERKS.map(([ic, bg, t, d], i) => (
              <Reveal key={t} delay={i * 0.06} className="perk"><span className="ic" style={{ background: bg, color: bg === "var(--violet)" ? "#fff" : undefined }}>{ic}</span><div><b>{t}</b><p>{d}</p></div></Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
