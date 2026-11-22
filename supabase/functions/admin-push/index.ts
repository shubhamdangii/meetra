// Sends a phone push for one admin notification. Called ONLY by the database (pg_net trigger on
// public.admin_notifications) with the shared X-Push-Secret header.
//   POST { id: <admin_notifications.id> }
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_HOOK_SECRET (set with `supabase secrets set`).
import webpush from "npm:web-push@3.6.7";
import { admin, safeEqual } from "../_shared/common.ts";

const PUB = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const PRIV = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const HOOK = Deno.env.get("PUSH_HOOK_SECRET") ?? "";
const SITE = "https://shubhamdangii.github.io/meetra";
webpush.setVapidDetails("https://shubhamdangii.github.io/meetra/", PUB, PRIV);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  if (!HOOK || !safeEqual(req.headers.get("x-push-secret") ?? "", HOOK)) return new Response("Forbidden", { status: 403 });
  let id = 0;
  try { id = Number((await req.json()).id); } catch { /* ignore */ }
  if (!id) return new Response("Missing id", { status: 400 });

  const { data: n } = await admin.from("admin_notifications").select("id,user_id,title,body,link").eq("id", id).maybeSingle();
  if (!n) return new Response("Not found", { status: 404 });
  const { data: subs } = await admin.from("admin_push_subs").select("endpoint,p256dh,auth").eq("user_id", n.user_id);
  const payload = JSON.stringify({ title: n.title, body: n.body, url: SITE + (n.link ?? "/admin/"), tag: "adm-" + n.id });
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "high" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("admin_push_subs").delete().eq("endpoint", s.endpoint);   // phone unsubscribed
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { "content-type": "application/json" } });
});
