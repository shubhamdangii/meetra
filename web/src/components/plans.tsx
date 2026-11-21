"use client";
// Pieces shared by Your plans, the event page and the door pass:
// my seat requests from the database, the door pass with its QR code,
// the calendar button and the bring-a-friend invite.
import { motion } from "framer-motion";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { useAuth } from "./AuthProvider";
import { burstFrom, buzz } from "./fx";
import { CONFIG } from "@/lib/config";
import { type MeetEvent, downloadCalendar, eventUrl, fmtDay } from "@/lib/events";
import { absUrl } from "@/lib/store";

export type ReqStatus = "pending" | "approved" | "waitlisted" | "declined" | "cancelled";
export type MyRequest = { id: number; plan_ref: string; status: ReqStatus; party_size: number; created_at: string; decided_at: string | null };

/** All my seat requests (newest first). null while loading or when logged out. */
export function useMyRequests() {
  const auth = useAuth();
  const [rows, setRows] = useState<MyRequest[] | null>(null);
  const load = useCallback(() => {
    if (!auth.client || !auth.me) { setRows(null); return; }
    auth.client.from("plan_requests").select("id,plan_ref,status,party_size,created_at,decided_at").eq("user_id", auth.me.id).order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as MyRequest[]) ?? []));
  }, [auth.client, auth.me]);
  useEffect(load, [load]);
  return { rows, reload: load, setRows };
}

/** Friendly words for every status, upcoming and past. */
export const STATUS_UI: Record<string, { label: string; tone: string; past?: string }> = {
  pending: { label: "Requested ⏳", tone: "#FFF2C7", past: "Not picked this time" },
  waitlisted: { label: "On the waitlist 🕒", tone: "#FFE9A8", past: "Not picked this time" },
  approved: { label: "You're in ✅", tone: "#C9F5E4", past: "You went 🎉" },
  declined: { label: "Not this time", tone: "#FFE3EC", past: "Not picked this time" },
};

/** Short value printed in the QR code. A host scanning it sees who this is and for which plan. */
export const passCode = (reqId: number, planRef: string) => `${CONFIG.brand.toUpperCase()}-PASS:${reqId}:${planRef}`;

export function DoorPass({ e, name, reqId, partySize = 1 }: { e: MeetEvent; name: string; reqId: number; partySize?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toString(passCode(reqId, e.id), { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#16122B", light: "#FFFFFF" } })
      .then(setSvg).catch(() => setSvg(null));
  }, [reqId, e.id]);
  return (
    <motion.div className="pass" initial={{ rotateX: 70, opacity: 0, y: 30 }} animate={{ rotateX: 0, opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 140, damping: 16 }}>
      <div className="pass-top">
        <span className="pass-eyebrow">Your door pass · show at entry</span>
        <b className="pass-title">{e.title}</b>
        <span className="pass-when">{fmtDay(e.date)} · {e.time} · {e.area}, {CONFIG.cities[e.city].name}</span>
        <span className="pass-name">{name}{partySize > 1 ? <small> +1</small> : null}</span>
        <span className="pass-em" aria-hidden="true">{e.emoji}</span>
      </div>
      <div className="pass-cut" aria-hidden="true" />
      <div className="pass-qr">
        {svg ? <div className="qr" role="img" aria-label={`Door pass for ${name}`} dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="qr skeleton" />}
        <span className="pass-shine" aria-hidden="true" />
        <small>Turn your brightness up. Only your host scans this.</small>
        <code>#{String(reqId).padStart(5, "0")}</code>
      </div>
    </motion.div>
  );
}

export function CalendarButton({ e, className = "btn btn-white btn-sm" }: { e: MeetEvent; className?: string }) {
  const { toast } = useApp();
  return <button type="button" className={className} onClick={() => { downloadCalendar(e); toast("📅 Calendar file downloaded"); buzz(); }}>📅 Add to calendar</button>;
}

export function InviteBox({ e }: { e?: MeetEvent }) {
  const { toast } = useApp();
  const url = absUrl(e ? eventUrl(e) : "/");
  const text = e ? `I'm going to ${e.title} on ${fmtDay(e.date)}. Come with me? ${url}` : `Come to a ${CONFIG.brand} plan with me: ${url}`;
  const copy = async (el: Element) => {
    try { await navigator.clipboard.writeText(url); toast("Link copied"); burstFrom(el, ["🔗", "✨"], 6); } catch { toast("Copy the link from your address bar"); }
  };
  const share = async (el: Element) => {
    try { if (navigator.share) { await navigator.share({ title: e?.title ?? CONFIG.brand, text, url }); return; } } catch (err) { if ((err as Error)?.name === "AbortError") return; }
    copy(el);
  };
  return (
    <div className="invite">
      <span className="eyebrow" style={{ color: "var(--sun)" }}>Bring a friend</span>
      <h3>Plans are better <span className="serif">with your people.</span></h3>
      <p>Friends who join with your link sit at the same table when there&apos;s space.</p>
      <div className="invite-btns">
        <button className="btn btn-sun" onClick={(ev) => share(ev.currentTarget)}>Invite friends ↗</button>
        <a className="btn btn-white" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <button className="btn btn-white" onClick={(ev) => copy(ev.currentTarget)}>Copy link</button>
      </div>
    </div>
  );
}
