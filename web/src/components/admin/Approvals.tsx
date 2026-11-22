"use client";
// Approval Center: every Maker-Checker request with who asked, what changes (old vs new), remarks and dates.
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { EventForm, type AdminHost, type EventFormValue, eventToForm, formToPayload, validateEvent } from "./Events";
import { HostForm, type HostFormValue, hostPayload, hostToForm, validateHost } from "./Hosts";
import { Chip, Diff, Empty, Modal, fmtDT, useAsk, useCall, useRpc } from "./shared";

export type Req = {
  id: number; req_no: string; entity: "event" | "host" | "team"; action: string; target_id: number | null; target_label: string;
  old_value: Record<string, unknown> | null; new_value: Record<string, unknown>; status: string; maker_id: string; maker_name: string | null;
  maker_note: string | null; checker_name: string | null; checker_remark: string | null; resubmits: number; created_at: string; decided_at: string | null; mine: boolean;
};
const ACTION: Record<string, string> = { create: "New", update: "Change", cancel: "Cancel", delete: "Remove", activate: "Activate", deactivate: "Deactivate", add_sub_admin: "Add sub-admin", remove_sub_admin: "Remove sub-admin" };
const ENTITY: Record<string, string> = { event: "🚀 Event", host: "🎙️ Host", team: "👥 Team" };
const TABS = [["waiting", "Waiting for me"], ["mine", "My requests"], ["pending", "All pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]] as const;

export function AdminApprovals({ focus, onChanged }: { focus?: string; onChanged?: () => void }) {
  const r = useRpc<Req[]>("admin_requests_list", { p_status: null, p_limit: 300 });
  const hs = useRpc<AdminHost[]>("admin_hosts");
  const call = useCall(); const { ask, ui } = useAsk(); const app = useApp() as ReturnType<typeof useApp> & { reloadCustom?: () => void };
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("waiting");
  const [edit, setEdit] = useState<{ req: Req; ev?: EventFormValue; host?: HostFormValue; reason?: string } | null>(null); const [err, setErr] = useState<string | null>(null);
  const focused = useRef<string | null>(null);
  const hostNames = useMemo(() => new Map((hs.data ?? []).map((h) => [h.id, h.name])), [hs.data]);

  useEffect(() => {
    if (!focus || !r.data || focused.current === focus) return;
    const f = r.data.find((x) => x.req_no === focus); if (!f) return;
    focused.current = focus;
    setTab(f.status === "pending" ? (f.mine ? "mine" : "waiting") : (f.status as typeof tab) in Object.fromEntries(TABS) ? (f.status as typeof tab) : "all");
    setTimeout(() => document.getElementById("req-" + focus)?.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
  }, [focus, r.data]);

  const list = (r.data ?? []).filter((x) => tab === "all" || (tab === "waiting" ? x.status === "pending" && !x.mine : tab === "mine" ? x.mine && ["pending", "rejected"].includes(x.status) : x.status === tab));
  const count = (t: string) => (r.data ?? []).filter((x) => t === "all" || (t === "waiting" ? x.status === "pending" && !x.mine : t === "mine" ? x.mine && ["pending", "rejected"].includes(x.status) : x.status === t)).length;
  const done = () => { r.reload(); hs.reload(); app.reloadCustom?.(); onChanged?.(); };

  async function decide(x: Req, approve: boolean) {
    const remark = await ask(approve ? `Approve ${x.req_no}?` : `Reject ${x.req_no}?`, approve ? "Remark" : "Reason for rejecting (the maker sees this)", { required: !approve, ok: approve ? "Approve ✓" : "Reject" });
    if (remark === null) return;
    if (await call("admin_decide_request", { p_id: x.id, p_approve: approve, p_remark: remark }, approve ? `${x.req_no} approved ✓ Live now` : `${x.req_no} rejected`)) done();
  }
  async function withdraw(x: Req) { if (await call("admin_withdraw_request", { p_id: x.id }, `${x.req_no} withdrawn`)) done(); }
  function openResubmit(x: Req) {
    setErr(null);
    if (x.entity === "event" && ["create", "update"].includes(x.action)) setEdit({ req: x, ev: eventToForm({ ...(x.old_value ?? {}), ...x.new_value }) });
    else if (x.entity === "host" && ["create", "update"].includes(x.action)) setEdit({ req: x, host: hostToForm({ ...(x.old_value ?? {}), ...x.new_value }) });
    else setEdit({ req: x, reason: String(x.new_value.reason ?? "") });
  }
  async function resubmit() {
    if (!edit) return; const x = edit.req; let payload: Record<string, unknown> | null = null;
    if (edit.ev) { const p = validateEvent(edit.ev); if (p) return setErr(p); const full = formToPayload(edit.ev) as Record<string, unknown>;
      const base = formToPayload(eventToForm({ ...(x.old_value ?? {}), ...x.new_value })) as Record<string, unknown>;
      payload = x.action === "create" ? full : Object.fromEntries(Object.entries(full).filter(([k, v]) => k in x.new_value || JSON.stringify(v) !== JSON.stringify(base[k]))); }
    else if (edit.host) { const p = validateHost(edit.host); if (p) return setErr(p); const full = hostPayload(edit.host) as Record<string, unknown>;
      const base = hostPayload(hostToForm({ ...(x.old_value ?? {}), ...x.new_value })) as Record<string, unknown>;
      payload = x.action === "create" ? full : Object.fromEntries(Object.entries(full).filter(([k, v]) => k in x.new_value || JSON.stringify(v ?? null) !== JSON.stringify(base[k] ?? null))); }
    else if (x.action === "cancel") { if ((edit.reason ?? "").trim().length < 3) return setErr("Write a reason."); payload = { reason: edit.reason!.trim() }; }
    const note = await ask(`Resubmit ${x.req_no}`, "What did you fix?", { ok: "Resubmit" }); if (note === null) return;
    if (await call("admin_resubmit_request", { p_id: x.id, p_payload: payload, p_note: note }, `${x.req_no} sent again ✓`)) { setEdit(null); done(); }
  }

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <p className="adm-note">Every important change waits here until the <b>other</b> admin approves it. Nothing goes live before that, and nobody can approve their own request.</p>
      <div className="adm-seg">{TABS.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l} <small>{count(k)}</small></button>)}
        <button onClick={done} aria-label="Refresh">↻</button></div>
      {r.error && <p className="form-msg err">{r.error}</p>}
      {!r.data ? <div className="skeleton" style={{ minHeight: 160 }} /> : !list.length ? <Empty>{tab === "waiting" ? "Nothing waiting for you. 🎉" : "No requests here."}</Empty> : (
        <div className="adm-list one">{list.map((x, i) => (
          <motion.article key={x.id} id={"req-" + x.req_no} className={`adm-card req ${focus === x.req_no ? "focus" : ""}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
            <div className="adm-card-top"><span className="adm-reqno">{x.req_no}</span>
              <div className="grow"><b>{ENTITY[x.entity]} · {ACTION[x.action] ?? x.action}: {x.target_label}</b>
                <small>By <b>{x.mine ? "you" : x.maker_name ?? "admin"}</b> · {fmtDT(x.created_at)}{x.resubmits ? ` · resubmitted ${x.resubmits}×` : ""}</small></div>
              <Chip s={x.status} /></div>
            {x.maker_note && <p className="adm-quote">“{x.maker_note}”</p>}
            <Diff oldV={x.old_value} newV={x.new_value} hostNames={hostNames} />
            {x.decided_at && <p className="adm-decided"><b>{x.status === "approved" ? "Approved" : x.status === "rejected" ? "Rejected" : "Closed"}</b>{x.checker_name ? ` by ${x.checker_name}` : ""} · {fmtDT(x.decided_at)}
              {x.checker_remark && <><br />Remark: “{x.checker_remark}”</>}</p>}
            <div className="acts">
              {x.status === "pending" && !x.mine && <><button className="ok" onClick={() => decide(x, true)}>✓ Approve</button><button className="no" onClick={() => decide(x, false)}>✕ Reject</button></>}
              {x.status === "pending" && x.mine && <><span className="muted" style={{ fontSize: 13 }}>Waiting for the other admin…</span><button onClick={() => withdraw(x)}>Withdraw</button></>}
              {x.status === "rejected" && x.mine && <><button className="ok" onClick={() => openResubmit(x)}>✎ Edit & resubmit</button><button onClick={() => withdraw(x)}>Drop it</button></>}
            </div>
          </motion.article>
        ))}</div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} wide title={edit ? `Edit & resubmit ${edit.req.req_no}` : ""}>
        {edit && <>
          {edit.req.checker_remark && <p className="adm-quote">Rejected because: “{edit.req.checker_remark}”</p>}
          {edit.ev && <EventForm value={edit.ev} onChange={(f) => setEdit({ ...edit, ev: f })} hosts={hs.data ?? []} lockCity={edit.req.action === "update"} />}
          {edit.host && <HostForm value={edit.host} onChange={(f) => setEdit({ ...edit, host: f })} />}
          {edit.reason !== undefined && edit.req.action === "cancel" && <div className="field"><label>Reason</label><textarea rows={3} value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} /></div>}
          {edit.reason !== undefined && edit.req.action !== "cancel" && <p className="muted">Nothing to edit for this request. Resubmit it with a note.</p>}
          {err && <p className="form-msg err" role="alert">{err}</p>}
          <div className="adm-row-end"><button className="btn btn-white btn-sm" onClick={() => setEdit(null)}>Close</button><button className="btn btn-ink btn-sm" onClick={resubmit}>Resubmit for approval</button></div>
        </>}
      </Modal>
      {ui}
    </motion.section>
  );
}
