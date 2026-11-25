"use client";
// Host desk (/host/ for approved hosts): propose events → the meetra team approves → live.
// Plus their events, seat numbers, guest list and the door scanner for their own plans.
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { burstFrom } from "../fx";
import { EventForm, type EventFormValue, blankEvent, eventToForm, formToPayload, useEventExtras, validateEvent } from "../admin/Events";
import { WhoComing } from "../EventBits";
import { DiaryUploader } from "../Diary";
import { usePlanCount } from "@/lib/eventMedia";

function WaitCount({ planRef }: { planRef: string }) {
  const c = usePlanCount(planRef, true);
  return c && c.waitlisted > 0 ? <> · <b>{c.waitlisted}</b> waiting</> : null;
}
import { Modal, fmtDT, statusLabel } from "../admin/shared";
import { AdminCheckIn } from "../pages/AdminTeam";
import { HostPhoto } from "../Home";
import { CONFIG } from "@/lib/config";

export type MyHost = { id: number; name: string; city_slug: string; bio: string; photo_url: string | null; status: string; avg_rating: number | null; reviews: number };
type HE = {
  id: number; plan_ref: string; title: string; city_slug: string; category: string; starts_at: string; ends_at: string; booking_closes_at: string;
  area: string; price: number; price_type: string; seats: number; emoji: string; blurb: string; steps: string[]; tags: string[];
  status: string; display_status: string; confirmed: number; attended: number; pending: number;
  req_id: number | null; req_no: string | null; req_status: string | null; req_remark: string | null;
};

/** Loads the logged-in member's host profile (null = not a host, undefined = still loading). */
export function useMyHost() {
  const auth = useAuth();
  const [host, setHost] = useState<MyHost | null | undefined>(undefined);
  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.client || !auth.session) { setHost(null); return; }
    auth.client.rpc("my_host").then(({ data, error }) => setHost(error ? null : ((data as MyHost) ?? null)));
  }, [auth.ready, auth.client, auth.session]);
  return host;
}

export function HostDesk({ host }: { host: MyHost }) {
  const auth = useAuth(); const { toast, confirm, all, reloadCustom } = useApp();
  const [events, setEvents] = useState<HE[] | null>(null);
  const [form, setForm] = useState<{ id: number | null; f: EventFormValue } | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [door, setDoor] = useState(false);

  const load = useCallback(async () => {
    if (!auth.client) return;
    const { data, error } = await auth.client.rpc("host_my_events");
    if (error) { toast("Couldn't load your events: " + error.message); setEvents([]); return; }
    setEvents(data as HE[]);
  }, [auth.client, toast]);
  useEffect(() => { load(); }, [load]);
  const extras = useEventExtras(events ? events.map((x) => x.id) : null);
  const formOf = (e: HE) => eventToForm({ ...e, ...(extras.get(e.id) ?? {}) });
  // "＋ Add a plan" from the menus lands here with ?new=1
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get("new") === "1") {
      setForm({ id: null, f: blankEvent(host.city_slug) });
      u.searchParams.delete("new"); window.history.replaceState(null, "", u.toString());
    }
  }, [host.city_slug]);

  const call = async <T,>(fn: string, args: Record<string, unknown>): Promise<T | undefined> => {
    const { data, error } = await auth.client!.rpc(fn, args);
    if (error) { toast("⚠️ " + error.message); return undefined; }
    return (data ?? true) as T;
  };

  async function save(send: boolean, ev: React.MouseEvent<HTMLButtonElement>) {
    if (!form) return;
    const p = validateEvent(form.f); if (p) return setErr(p);
    setErr(""); setBusy(true);
    const btn = ev.currentTarget;
    const id = await call<number>("host_save_event_draft", { p_id: form.id, p_payload: formToPayload(form.f) });
    if (id && send) {
      const no = await call<string>("host_submit_event", { p_id: id, p_note: null });
      if (no) { burstFrom(btn, ["🎉", "✨", "🙌"], 14); toast(`Sent to the team ✓ (${no}) You'll see their answer here`); }
    } else if (id) toast("Draft saved ✓ (not public yet)");
    setBusy(false);
    if (id) { setForm(null); load(); }
  }
  async function send(e: HE) {
    const p = validateEvent(formOf(e)); if (p) { setErr(p); setForm({ id: e.id, f: formOf(e) }); return; }
    const no = await call<string>("host_submit_event", { p_id: e.id, p_note: null });
    if (no) { toast(`Sent to the team ✓ (${no})`); load(); }
  }
  async function withdraw(e: HE) {
    if (!(await confirm({ title: "Take it back?", body: `"${e.title}" goes back to your drafts so you can change it.`, ok: "Withdraw" }))) return;
    if (await call("host_withdraw_event", { p_id: e.id })) { toast("Back in your drafts ✓"); load(); }
  }
  async function discard(e: HE) {
    if (!(await confirm({ title: "Delete this draft?", body: e.title, danger: true, ok: "Delete draft", cancel: "Keep it" }))) return;
    if (await call("host_discard_draft", { p_id: e.id })) { toast("Draft deleted"); load(); }
  }

  const now = Date.now();
  const live = (events ?? []).filter((e) => e.display_status === "active");
  const doorPlans = useMemo(() => all.filter((x) => x.hostId === host.id && x.day >= -1 && x.day <= 1), [all, host.id]);
  useEffect(() => { reloadCustom(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const groups: [string, HE[]][] = [
    ["Needs your attention", (events ?? []).filter((e) => e.status === "draft")],
    ["Waiting for the team", (events ?? []).filter((e) => e.status === "pending")],
    ["Live", live],
    ["Past & cancelled", (events ?? []).filter((e) => ["completed", "cancelled"].includes(e.display_status))],
  ];

  return (
    <section className="hd">
      <motion.div className="hd-head" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <HostPhoto h={host} className="hd-av" />
        <div className="grow">
          <span className="eyebrow">Your host desk</span>
          <h2>Hi {host.name.split(" ")[0]} 👋</h2>
          <p className="muted">{CONFIG.cities[host.city_slug]?.name} · {host.reviews ? `★ ${Number(host.avg_rating).toFixed(1)} from ${host.reviews} review${host.reviews > 1 ? "s" : ""}` : "no reviews yet"}</p>
        </div>
        <Link className="btn btn-white btn-sm" href={`/host-profile/?id=${host.id}`}>Public profile</Link>
      </motion.div>

      <div className="hd-actions">
        <motion.button whileTap={{ scale: 0.96 }} className="btn btn-sun" onClick={() => { setErr(""); setForm({ id: null, f: blankEvent(host.city_slug) }); }}>＋ Propose an event</motion.button>
        {doorPlans.length > 0 && <button className="btn btn-ink" onClick={() => setDoor((d) => !d)}>{door ? "Hide door" : "📷 Door check-in"}</button>}
      </div>
      <AnimatePresence>{door && doorPlans.length > 0 && (
        <motion.div className="hd-door" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
          <AdminCheckIn plans={doorPlans} guestsFn="host_guest_list" />
        </motion.div>
      )}</AnimatePresence>

      <ol className="hd-how">
        <li><b>1</b>Propose an event</li><li><b>2</b>The team checks it</li><li><b>3</b>It goes live everywhere</li>
      </ol>

      {!events ? <div className="skeleton" style={{ minHeight: 160 }} /> : !events.length ? (
        <div className="hd-empty"><span aria-hidden="true">🎙️</span><b>No events yet.</b><p>Propose your first one. The team usually replies within a day.</p></div>
      ) : groups.filter(([, l]) => l.length).map(([title, list]) => (
        <div key={title} className="hd-group">
          <h3>{title} <small>{list.length}</small></h3>
          {list.map((e) => {
            const pct = Math.min(100, Math.round((e.confirmed / Math.max(1, e.seats)) * 100));
            const rejected = e.status === "draft" && e.req_status === "rejected";
            return (
              <motion.article key={e.id} className="hd-ev" layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="top"><span className="em" aria-hidden="true">{e.emoji}</span>
                  <div className="grow"><b>{e.title}</b><small>{fmtDT(e.starts_at)} · {e.area}</small></div>
                  <span className={`adm-chip c-${rejected ? "rejected" : e.display_status}`}>{rejected ? "Changes needed" : statusLabel(e.display_status)}</span></div>
                {rejected && e.req_remark && <p className="hd-remark">💬 The team said: “{e.req_remark}”</p>}
                {e.status === "pending" && <p className="muted" style={{ fontSize: 13 }}>⏳ {e.req_no} · the team is checking it.</p>}
                {(e.display_status === "active" || e.display_status === "completed") && (
                  <div className="adm-occ"><div><i style={{ width: `${pct}%` }} /></div>
                    <small><b>{e.confirmed}/{e.seats}</b> confirmed · {Math.max(0, e.seats - e.confirmed)} seats left{e.attended ? ` · ${e.attended} came` : ""}{e.pending ? ` · ${e.pending} new requests` : ""}<WaitCount planRef={e.plan_ref} /></small></div>
                )}
                {(e.display_status === "active" || e.display_status === "completed") && <div className="hd-who"><span>Who&apos;s coming</span><WhoComing planRef={e.plan_ref} seats={e.seats} /></div>}
                <div className="acts">
                  {e.status === "draft" && <><button onClick={() => { setErr(""); setForm({ id: e.id, f: formOf(e) }); }}>Edit</button>
                    <button className="ok" onClick={() => send(e)}>{rejected ? "Send again" : "Send to the team"}</button>
                    <button onClick={() => discard(e)}>Delete</button></>}
                  {e.status === "pending" && <button onClick={() => withdraw(e)}>Withdraw</button>}
                  {e.status === "approved" && <Link href={`/event/?id=${e.plan_ref}`}>View live page</Link>}
                  {e.status === "approved" && new Date(e.starts_at).getTime() - now < 3600e3 && <DiaryUploader planRef={e.plan_ref} />}
                  {e.status === "approved" && new Date(e.starts_at).getTime() < now && <Link href={`/past/?diary=${e.plan_ref}`}>Photo diary</Link>}
                  {e.display_status === "active" && new Date(e.starts_at).getTime() - now < 36 * 3600e3 && <button onClick={() => setDoor(true)}>📷 Door</button>}
                </div>
              </motion.article>
            );
          })}
        </div>
      ))}
      <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>Need to change or cancel a live event? Message the {CONFIG.brand} team on WhatsApp and they&apos;ll update it.</p>

      <Modal open={!!form} onClose={() => setForm(null)} wide title={form?.id ? "Edit your event" : "Propose an event"}>
        {form && <>
          <p className="adm-note">Saved as a draft first. Nothing is public until the team approves it.</p>
          <EventForm value={form.f} onChange={(f) => setForm({ ...form, f })} hosts={[]} lockCity hideHost />
          {err && <p className="form-msg err" role="alert">{err}</p>}
          <div className="adm-row-end">
            <button className="btn btn-white btn-sm" onClick={() => setForm(null)}>Close</button>
            <button className="btn btn-white btn-sm" disabled={busy} onClick={(ev) => save(false, ev)}>Save draft</button>
            <button className="btn btn-ink btn-sm" disabled={busy} onClick={(ev) => save(true, ev)}>Send to the team →</button>
          </div>
        </>}
      </Modal>
    </section>
  );
}
