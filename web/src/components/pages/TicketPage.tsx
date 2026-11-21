"use client";
// /ticket/?id=<plan> — the door pass for a plan you're confirmed on.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { CalendarButton, DoorPass, InviteBox, STATUS_UI, useMyRequests } from "../plans";
import { burst } from "../fx";
import { CONFIG } from "@/lib/config";
import { addressDropAt, eventUrl, fmtWhen } from "@/lib/events";

export default function TicketPage() {
  const id = useSearchParams().get("id") ?? "";
  const { ready, byId } = useApp();
  const auth = useAuth();
  const { rows } = useMyRequests();
  const e = byId(id);
  const r = rows?.find((x) => x.plan_ref === id);
  const ok = !!e && (r?.status === "approved" || r?.status === "attended");
  useEffect(() => { if (ok) { const t = setTimeout(() => burst(innerWidth / 2, innerHeight * 0.35, ["🎫", "🎉", "✨", "💜"], 16), 500); return () => clearTimeout(t); } }, [ok]);

  if (!ready || (auth.enabled && auth.session && !rows)) return <div className="wrap" style={{ padding: "60px 20px" }}><div className="skeleton" style={{ minHeight: 480, maxWidth: 420, margin: "0 auto" }} /></div>;
  if (auth.enabled && !auth.session) return (
    <section className="wrap page-hero"><h1>Log in to see <span className="serif">your pass.</span></h1>
      <div style={{ marginTop: 24 }}><button className="btn btn-sun" onClick={() => auth.requireLogin(`/ticket/?id=${id}`)}>Log in →</button></div></section>
  );
  if (!e || !ok) return (
    <section className="wrap page-hero">
      <h1>No pass <span className="serif">here yet.</span></h1>
      <p>{r && e ? `Your status for ${e.title}: ${STATUS_UI[r.status]?.label ?? r.status}. The door pass appears once you're in.` : "Door passes appear once the team confirms your seat."}</p>
      <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link className="btn btn-sun" href="/saved/">Your plans →</Link>{e && <Link className="btn btn-white" href={eventUrl(e)}>See the plan</Link>}
      </div>
    </section>
  );
  const name = auth.me?.display_name && auth.me.display_name !== "New member" ? auth.me.display_name.split(" ")[0] : "Guest";
  const drop = addressDropAt(e);
  return (
    <div className="wrap ticket-wrap">
      <Link className="btn btn-white btn-sm back-btn" href="/saved/">‹ Your plans</Link>
      <DoorPass e={e} name={name} reqId={r!.id} partySize={r!.party_size} used={r!.status === "attended"} />
      <div className="ticket-facts">
        <p>{Date.now() >= drop.getTime() ? "📍 The exact spot is on your WhatsApp." : <>📍 Exact spot arrives <b>{fmtWhen(drop)}</b> on WhatsApp.</>}</p>
        <p>👋 Look for {CONFIG.brand}&apos;s host sign. Your host starts with a game, so nobody has to break the ice alone.</p>
        <div className="plan-btns"><CalendarButton e={e} /><Link className="btn btn-white btn-sm" href={eventUrl(e)}>Plan details</Link><Link className="btn btn-white btn-sm" href="/games/">🎲 Warm-up games</Link></div>
      </div>
      <InviteBox e={e} />
    </div>
  );
}
