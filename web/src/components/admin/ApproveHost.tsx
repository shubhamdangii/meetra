"use client";
// "Make this member a host": the admin also gives them an event — the one they asked for, any event that
// still needs a host, or a brand new one created right here. All of it goes to the other admin as one request.
import { useEffect, useState } from "react";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { EventForm, type EventFormValue, blankEvent, formToPayload, validateEvent } from "./Events";
import { Modal, cityName, fmtDT } from "./shared";

export type HostApp = {
  id: number; city_slug: string; plan_title: string; category?: string; display_name: string; full_name: string | null;
  plan_id?: number | null; plan_event?: string | null; new_event?: { title?: string; starts_at?: string; area?: string } | null;
};
type Unassigned = { id: number; plan_ref: string; title: string; city_slug: string; event_type: string | null; starts_at: string; area: string; status: string };
type Choice = { kind: "applicant" } | { kind: "existing"; id: number } | { kind: "new" } | { kind: "none" };

export function ApproveHostDialog({ app, onClose, onSent }: { app: HostApp | null; onClose: () => void; onSent: (reqNo: string) => void }) {
  const auth = useAuth(); const { toast } = useApp();
  const [free, setFree] = useState<Unassigned[] | null>(null);
  const [choice, setChoice] = useState<Choice>({ kind: "none" });
  const [form, setForm] = useState<EventFormValue | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const hasOwn = !!app && (!!app.plan_id || !!app.new_event);

  useEffect(() => {
    if (!app || !auth.client) return;
    setErr(""); setForm(null); setFree(null);
    setChoice(app.plan_id || app.new_event ? { kind: "applicant" } : { kind: "none" });
    auth.client.rpc("unassigned_events", { p_city: app.city_slug }).then(({ data }) =>
      setFree(((data ?? []) as Unassigned[]).filter((x) => x.id !== app.plan_id)));
  }, [app, auth.client]);

  function pickNew() {
    setChoice({ kind: "new" });
    if (!form && app) setForm({ ...blankEvent(app.city_slug), title: app.new_event?.title || app.plan_title || "", category: app.category || "food" });
  }

  async function send() {
    if (!app || !auth.client) return;
    let args: Record<string, unknown> = { p_app_id: app.id, p_note: null };
    if (choice.kind === "existing") args = { ...args, p_plan_id: choice.id };
    if (choice.kind === "none") args = { ...args, p_skip_event: true };
    if (choice.kind === "new") {
      if (!form) return;
      const p = validateEvent(form); if (p) return setErr(p);
      args = { ...args, p_new_event: formToPayload(form) };
    }
    setErr(""); setBusy(true);
    const { data, error } = await auth.client.rpc("admin_approve_host_application", args);
    setBusy(false);
    if (error) return setErr(error.message);
    toast(`${data} sent ✓ The other admin approves it`);
    onSent(String(data));
  }

  const name = app ? app.full_name || app.display_name : "";
  const opt = (on: boolean, onClick: () => void, title: React.ReactNode, sub?: React.ReactNode) => (
    <button type="button" role="radio" aria-checked={on} className={on ? "on" : ""} onClick={onClick}><b>{title}</b>{sub && <small>{sub}</small>}</button>
  );

  return (
    <Modal open={!!app} onClose={onClose} wide title={app ? `Make ${name} a host` : ""}>
      {app && <>
        <p className="adm-note">Their host profile is built from their own profile. Pick the event they&apos;ll host. Everything goes to the other main admin in one request; once approved, the event is theirs.</p>
        <div className="pick-list" role="radiogroup" aria-label="Event for this host">
          {hasOwn && opt(choice.kind === "applicant", () => setChoice({ kind: "applicant" }),
            app.plan_id ? `Their pick: ${app.plan_event ?? app.plan_title}` : `Their own event: ${app.new_event?.title ?? app.plan_title}`,
            app.plan_id ? "Assigned to them when approved (if it still has no host)." : `${app.new_event?.starts_at ? fmtDT(app.new_event.starts_at) + " · " : ""}${app.new_event?.area ?? ""} · becomes a draft on their Host desk to finish and send.`)}
          {free === null ? <div className="skeleton" style={{ minHeight: 60 }} />
            : free.map((x) => opt(choice.kind === "existing" && choice.id === x.id, () => setChoice({ kind: "existing", id: x.id }),
              x.title, `${fmtDT(x.starts_at)} · ${x.area}${x.status !== "approved" ? ` · ${x.status}` : ""}`))}
          {free && !free.length && <p className="muted" style={{ fontSize: 13 }}>No events in {cityName(app.city_slug)} are waiting for a host.</p>}
          {opt(choice.kind === "new", pickNew, "＋ Create a new event instantly", "Fill it in below. It goes live with this host as soon as the request is approved.")}
          {opt(choice.kind === "none", () => setChoice({ kind: "none" }), "No event for now", "They can propose one from their Host desk.")}
        </div>
        {choice.kind === "new" && form && <div style={{ marginTop: 14 }}>
          <EventForm value={form} onChange={setForm} hosts={[]} lockCity hideHost />
        </div>}
        {err && <p className="form-msg err" role="alert">{err}</p>}
        <div className="adm-row-end">
          <button className="btn btn-white btn-sm" onClick={onClose}>Close</button>
          <button className="btn btn-ink btn-sm" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send for approval 🎙️"}</button>
        </div>
      </>}
    </Modal>
  );
}
