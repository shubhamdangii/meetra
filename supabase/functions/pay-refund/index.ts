// Refunds a seat's Razorpay payment. Called ONLY by the database (trigger on plan_requests when a
// paid request is declined, or cancelled before approval) with the shared X-Push-Secret header.
//   POST { request_id }
import { admin, safeEqual } from "../_shared/common.ts";

const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
const HOOK = Deno.env.get("PUSH_HOOK_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  if (!HOOK || !safeEqual(req.headers.get("x-push-secret") ?? "", HOOK)) return new Response("Forbidden", { status: 403 });
  let requestId = 0;
  try { requestId = Number((await req.json()).request_id); } catch { /* ignore */ }
  if (!requestId) return new Response("Missing request_id", { status: 400 });

  // the database trigger marks exactly the payments to refund (refund_pending) at decline/cancel time,
  // so a fresh payment made after re-requesting is never touched
  const { data: pays } = await admin.from("payments").select("*").eq("request_id", requestId).eq("status", "refund_pending");
  const AUTH = "Basic " + btoa(`${KEY_ID}:${KEY_SECRET}`);
  let ok = 0, failed = 0;
  for (const p of pays ?? []) {
    // a payment that isn't captured yet can't be refunded: capture it first
    const cur = await (await fetch(`https://api.razorpay.com/v1/payments/${p.rzp_payment_id}`, { headers: { Authorization: AUTH } })).json().catch(() => ({}));
    if (cur?.status === "authorized") {
      await fetch(`https://api.razorpay.com/v1/payments/${p.rzp_payment_id}/capture`, {
        method: "POST", headers: { Authorization: AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: p.amount, currency: "INR" }),
      });
    }
    const r = await fetch(`https://api.razorpay.com/v1/payments/${p.rzp_payment_id}/refund`, {
      method: "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: p.amount, speed: "normal", notes: { reason: "Seat not confirmed", request_id: String(requestId) } }),
    });
    const j = await r.json();
    if (r.ok) { ok++; await admin.from("payments").update({ status: "refunded", refund_id: j.id, refunded_at: new Date().toISOString() }).eq("id", p.id); }
    else { failed++; await admin.from("payments").update({ status: "refund_failed", refund_error: j?.error?.description ?? "refund failed" }).eq("id", p.id); }
  }
  // only touch the request's refund flag if it's still the declined/cancelled one (not re-paid since)
  if (ok || failed) await admin.from("plan_requests").update({ refund_status: failed ? "failed" : "refunded" }).eq("id", requestId).eq("refund_status", "pending");
  return new Response(JSON.stringify({ ok, failed }), { headers: { "content-type": "application/json" } });
});
