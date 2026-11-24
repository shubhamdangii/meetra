"use client";
// Team-only page. The database refuses these calls for anyone who isn't an admin,
// so hiding the page is only a convenience, not the protection.
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { useAuth } from "../AuthProvider";
import { AdminHosts } from "./AdminHosts";
import { AdminCheckIn } from "./AdminTeam";
import { AdminApprovals } from "../admin/Approvals";
import { AdminBell } from "../admin/Bell";
import { AdminDashboard } from "../admin/Dashboard";
import { AdminEvents } from "../admin/Events";
import { AdminHostsDesk } from "../admin/Hosts";
import { AdminActivity, AdminTeamDesk } from "../admin/TeamActivity";
import { SeatRequests } from "../admin/SeatRequests";
import { AdminInterest } from "../admin/Interest";
import { AdminBrands } from "../admin/Brands";
import { CONFIG } from "@/lib/config";
import { type MeetEvent, eventUrl, relDay } from "@/lib/events";



export default function AdminPage() {
  const auth = useAuth();
  const { all, inCity, byId, today, toast, ready } = useApp();
  const router = useRouter();
  type Tab = "dashboard" | "approvals" | "events" | "hosts" | "interest" | "requests" | "door" | "brands" | "team" | "activity";
  const [tab, setTabState] = useState<Tab>("interest");
  const [focusReq, setFocusReq] = useState<string | undefined>();
  const [unread, setUnread] = useState(0);
  const setTab = useCallback((t: Tab, req?: string) => {
    setTabState(t); setFocusReq(req);
    try { const u = new URL(window.location.href); u.searchParams.set("tab", t); if (req) u.searchParams.set("req", req); else u.searchParams.delete("req"); window.history.replaceState(null, "", u.toString()); } catch {}
  }, []);
  const team = auth.team;
  const isAdmin = !!team;
  const mine = useCallback((e: MeetEvent) => !!team && team.cities.includes(e.city), [team]);

  useEffect(() => { if (auth.enabled && auth.ready && !auth.session) { auth.rememberNext("/admin/" + window.location.search); router.replace("/login/"); } }, [auth, router]);

  // open the tab from the link (notifications use /admin/?tab=approvals&req=REQ-1001)
  const isMain = !!team?.is_super;
  useEffect(() => {
    if (!team) return;
    const p = new URLSearchParams(window.location.search);
    const want = p.get("tab") as Tab | null; const req = p.get("req") ?? undefined;
    const allowed: Tab[] = isMain ? ["dashboard", "approvals", "events", "hosts", "interest", "requests", "door", "brands", "team", "activity"] : ["requests", "door", "interest", "hosts"];
    setTabState(want && allowed.includes(want) ? want : isMain ? "dashboard" : "requests"); setFocusReq(req);
  }, [team, isMain]);

  // Safety: the admin desk logs you out after 30 minutes without any activity.
  useEffect(() => {
    if (!team) return;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const evs = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => { if (Date.now() - last > 30 * 60e3) { toast("Logged out after 30 minutes of no activity (admin safety)"); auth.logout(); } }, 30e3);
    return () => { clearInterval(t); evs.forEach((e) => window.removeEventListener(e, bump)); };
  }, [team, auth, toast]);
  // Phones: every table becomes a stack of cards. Each cell gets its column name as a label.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    const label = () => root.querySelectorAll("table").forEach((t) => {
      const hs = [...t.querySelectorAll("thead th")].map((th) => th.textContent?.replace(/[↑↓]/g, "").trim() ?? "");
      t.querySelectorAll("tbody tr").forEach((tr) => [...tr.children].forEach((td, i) => { if (td.getAttribute("data-label") !== hs[i]) td.setAttribute("data-label", hs[i] ?? ""); }));
    });
    label();
    const mo = new MutationObserver(label); mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  });
  const openLink = useCallback((link: string) => {
    try { const u = new URL(link, window.location.origin); const t = u.searchParams.get("tab") as Tab | null; if (t) setTab(t, u.searchParams.get("req") ?? undefined); } catch {}
  }, [setTab]);






  const head = (
    <section className="page-hero" style={{ paddingBottom: 0 }}>
      <span className="eyebrow">Team only</span>
      <div className="adm-head"><h1 style={{ fontSize: "clamp(40px,6vw,64px)" }}>{team && !team.is_super ? "City" : "Admin"} <span className="serif">desk.</span></h1>
        {team?.is_super && <AdminBell onOpenLink={openLink} onCount={setUnread} />}</div>
      {team && <p className="muted" style={{ marginTop: 6 }}>{team.is_super ? "Main admin · every city · changes need the other admin's approval" : `Sub-admin · ${team.cities.map((c) => CONFIG.cities[c]?.name ?? c).join(", ")}`}</p>}
    </section>
  );
  if (!auth.enabled) return <div className="wrap">{head}<div className="setup-note">Login isn&apos;t switched on, so there&apos;s nothing to show.</div></div>;
  if (!auth.ready || (auth.session && !auth.me) || !ready) return <div className="wrap">{head}<div className="skeleton" style={{ marginTop: 20 }} /></div>;
  if (!isAdmin) return <div className="wrap">{head}<div className="setup-note" style={{ marginTop: 20 }}>This page is for the {CONFIG.brand} team only.</div></div>;


  return (
    <div className="wrap adm-root" ref={rootRef} style={{ paddingBottom: 60 }}>
      {head}
      <nav className="adm-tabs" aria-label="Admin sections">
        {(isMain ? ([["dashboard", "📊 Dashboard"], ["approvals", "🛂 Approvals"], ["events", "🚀 Events"], ["hosts", "🎙️ Hosts"], ["requests", "🎟 Seat requests"], ["door", "📷 Door"], ["interest", "♥ Interest"], ["brands", "🤝 Brands"], ["team", "👥 Team"], ["activity", "🧾 Activity"]] as [Tab, string][])
          : ([["requests", "🎟 Seat requests"], ["door", "📷 Door check-in"], ["interest", "♥ Interest"], ["hosts", "🎙️ Host applications"]] as [Tab, string][])).map(([k, l]) => (
          <button key={k} className={`pill ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}{k === "approvals" && unread > 0 ? <span className="adm-badge in">{unread}</span> : null}</button>
        ))}
      </nav>

      {tab === "dashboard" && isMain ? <AdminDashboard go={(t, r) => setTab(t as Tab, r)} />
        : tab === "approvals" && isMain ? <AdminApprovals focus={focusReq} />
        : tab === "events" && isMain ? <AdminEvents goApprovals={(r) => setTab("approvals", r)} />
        : tab === "hosts" ? (isMain ? <AdminHostsDesk goApprovals={(r) => setTab("approvals", r)} /> : <AdminHosts />)
        : tab === "team" && isMain ? <AdminTeamDesk goApprovals={(r) => setTab("approvals", r)} />
        : tab === "activity" && isMain ? <AdminActivity />
        : tab === "brands" && isMain ? <AdminBrands />
        : tab === "door" ? <AdminCheckIn plans={all.filter((e) => mine(e) && e.day >= -1 && e.day <= 1)} /> : tab === "interest" ? <AdminInterest cities={team!.cities} />
        : <SeatRequests cities={team!.cities} />}
    </div>
  );
}
