"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { Empty, EventCard } from "../ui";

const LABEL: Record<string, [string, string]> = {
  pending: ["⏳ Pending", "#fff"], approved: ["🎉 You're in", "#C9F5E4"], waitlisted: ["🕒 Waiting list", "#FFE9A8"], declined: ["Not this time", "#FFE3EC"],
};

export default function SavedPage() {
  const { ready, upcoming, byId, requests, savedIds } = useApp();
  const auth = useAuth();
  const [db, setDb] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!auth.client || !auth.me) return;
    auth.client.from("plan_requests").select("plan_ref,status").eq("user_id", auth.me.id)
      .then(({ data }) => data && setDb(Object.fromEntries(data.map((r: any) => [r.plan_ref, r.status]))));
  }, [auth.client, auth.me]);

  let reqIds = requests.map((r) => r.id);
  if (db) reqIds = [...new Set([...Object.keys(db), ...reqIds])].filter((id) => db[id] !== "cancelled");
  const reqs = reqIds.map(byId).filter((e): e is NonNullable<typeof e> => !!e && e.day >= 0);
  const saved = upcoming.filter((e) => savedIds.includes(e.id));
  const find = <Link className="btn btn-sun btn-sm" href="/events/" style={{ marginTop: 16 }}>Find a plan →</Link>;

  return (
    <div className="wrap">
      <section className="page-hero">
        <span className="eyebrow">Your plans</span>
        <h1>Your little <span className="serif">calendar.</span></h1>
        <p>{db ? "Your seat requests with their status, and plans you've saved." : "Seats you've requested and plans you've saved. Saved on this device."}</p>
      </section>
      <div className="group">
        <div className="group-head"><h3>Requested seats</h3><span>{reqs.length ? `${reqs.length} upcoming` : ""}</span></div>
        <div className="grid">
          {!ready ? <div className="skeleton" /> : reqs.length ? reqs.map((e, i) => {
            const st = db?.[e.id];
            return <EventCard key={e.id} e={e} index={i} extra={st && LABEL[st] ? <span className="tag" style={{ alignSelf: "flex-start", background: LABEL[st][1], marginBottom: 4 }}>{LABEL[st][0]}</span> : undefined} />;
          }) : <Empty title="No seat requests yet.">Request a seat on any plan and it shows up here.<div>{find}</div></Empty>}
        </div>
      </div>
      <div className="group">
        <div className="group-head"><h3>Saved for later ♥</h3><span>{saved.length ? `${saved.length} saved` : ""}</span></div>
        <div className="grid">
          {!ready ? <div className="skeleton" /> : saved.length ? saved.map((e, i) => <EventCard key={e.id} e={e} index={i} />)
            : <Empty title="Nothing saved yet.">Tap the ♡ on any plan, or swipe right on <Link href="/swipe/" style={{ textDecoration: "underline" }}>Discover</Link>.<div>{find}</div></Empty>}
        </div>
      </div>
    </div>
  );
}
