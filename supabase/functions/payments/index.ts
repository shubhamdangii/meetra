// Razorpay payments for seat requests (called from the browser with the member's login token).
//
//   POST { action: "order", plan_ref, party_size, icebreaker?, price_hint?, request_id? }
//        → { key_id, order_id, amount, currency, name, description, prefill }
//        New request on a paid plan (request_id empty), or "pay to confirm" an approved unpaid seat (request_id).
//   POST { action: "verify", order_id, payment_id, signature }
//        → { request: { id, status, party_size } }   (HMAC checked with the key secret; only then the seat request is made)
//
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.
import { admin, anonClient, cors, json } from "../_shared/common.ts";

const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
const RZP = "https://api.razorpay.com/v1";
const auth = "Basic " + btoa(`${KEY_ID}:${KEY_SECRET}`);

async function hmacHex(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function sameHex(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const titleOf = (ref: string) => ref.replace(/-[a-z]+-\d{8}$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Use POST" }, 405);
  if (!KEY_ID || !KEY_SECRET) return json(req, { error: "Payments aren't set up yet" }, 503);

  // who is paying
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await anonClient().auth.getUser(jwt);
  if (!who?.user) return json(req, { error: "Please log in again" }, 401);
  const { data: me } = await admin.from("users").select("id, display_name").eq("auth_id", who.user.id).single();
  if (!me) return json(req, { error: "Account not found" }, 401);
  const { data: priv } = await admin.from("user_private").select("full_name, phone, email").eq("user_id", me.id).maybeSingle();

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }

  try {
    if (body.action === "order") {
      const requestId = body.request_id ? Number(body.request_id) : null;
      let planRef = String(body.plan_ref ?? "");
      let party = Math.min(2, Math.max(1, Number(body.party_size) || 1));
      if (requestId) {
        const { data: r } = await admin.from("plan_requests").select("id, user_id, plan_ref, status, party_size, paid_at").eq("id", requestId).single();
        if (!r || r.user_id !== me.id) return json(req, { error: "Seat not found" }, 404);
        if (r.paid_at) return json(req, { error: "Already paid ✓" }, 409);
        if (r.status !== "approved") return json(req, { error: "You can pay once the team gives you a seat" }, 409);
        planRef = r.plan_ref; party = r.party_size;
      } else {
        const { data: existing } = await admin.from("plan_requests").select("status").eq("plan_ref", planRef).eq("user_id", me.id).maybeSingle();
        if (existing && existing.status !== "cancelled") return json(req, { error: "You already asked for this plan" }, 409);
      }
      if (!/^[a-z0-9][a-z0-9-]{2,120}$/.test(planRef)) return json(req, { error: "Unknown plan" }, 400);

      const { data: pp } = await admin.rpc("plan_price_public", { p_ref: planRef });
      const p = Array.isArray(pp) ? pp[0] : pp;
      let price: number;
      if (p && p.price !== null) {
        if (!requestId && !p.open_ok) return json(req, { error: p.reason ?? "This plan isn't open" }, 409);
        price = p.price; if (p.price_type === "free") price = 0;
      } else {
        // sample plans (not in the database): use the listed price, capped
        price = Math.min(5000, Math.max(0, Math.round(Number(body.price_hint) || 0)));
      }
      if (price <= 0) return json(req, { error: "This plan is free, no payment needed" }, 400);
      const amount = price * 100 * party;   // paise

      const title = (p && p.title) || titleOf(planRef);
      const receipt = `mt_${me.id.slice(0, 8)}_${Date.now().toString(36)}`;
      const r = await fetch(`${RZP}/orders`, {
        method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency: "INR", receipt, notes: { plan_ref: planRef, user: me.id, request_id: requestId ? String(requestId) : "" } }),
      });
      const order = await r.json();
      if (!r.ok) return json(req, { error: order?.error?.description ?? "Couldn't start the payment" }, 502);
      const { error: insErr } = await admin.from("payments").insert({
        user_id: me.id, plan_ref: planRef, request_id: requestId, party_size: party,
        icebreaker: body.icebreaker ? String(body.icebreaker).slice(0, 300) : null, amount, rzp_order_id: order.id,
      });
      if (insErr) return json(req, { error: insErr.message }, 500);
      return json(req, {
        key_id: KEY_ID, order_id: order.id, amount, currency: "INR", name: "meetra",
        description: `${title}${party > 1 ? " · 2 seats" : ""}`,
        prefill: { name: priv?.full_name || me.display_name || "", email: priv?.email || who.user.email || "", contact: priv?.phone || "" },
      });
    }

    if (body.action === "verify") {
      const orderId = String(body.order_id ?? ""), paymentId = String(body.payment_id ?? ""), signature = String(body.signature ?? "");
      const { data: pay } = await admin.from("payments").select("*").eq("rzp_order_id", orderId).single();
      if (!pay || pay.user_id !== me.id) return json(req, { error: "Payment not found" }, 404);
      if (!sameHex(await hmacHex(`${orderId}|${paymentId}`), signature)) {
        await admin.from("payments").update({ status: "failed" }).eq("id", pay.id);
        return json(req, { error: "Payment could not be verified" }, 400);
      }
      if (pay.status === "paid" && pay.request_id) {
        const { data: done } = await admin.from("plan_requests").select("id, status, party_size").eq("id", pay.request_id).single();
        return json(req, { request: done });
      }
      const now = new Date().toISOString();
      let requestId = pay.request_id as number | null;
      if (requestId) {
        await admin.from("plan_requests").update({ paid_amount: pay.amount, paid_at: now }).eq("id", requestId);
      } else {
        // the paid seat request (re-uses a cancelled one if the member asked before)
        const { data: old } = await admin.from("plan_requests").select("id, status").eq("plan_ref", pay.plan_ref).eq("user_id", me.id).maybeSingle();
        const fields = { status: "pending", party_size: pay.party_size, icebreaker: pay.icebreaker, paid_amount: pay.amount, paid_at: now, refund_status: null };
        if (old) {
          const { error } = await admin.from("plan_requests").update(fields).eq("id", old.id);
          if (error) return json(req, { error: error.message }, 500);
          requestId = old.id;
        } else {
          const { data: ins, error } = await admin.from("plan_requests").insert({ ...fields, plan_ref: pay.plan_ref, user_id: me.id }).select("id").single();
          if (error) return json(req, { error: error.message }, 500);
          requestId = ins.id;
        }
      }
      await admin.from("payments").update({ status: "paid", rzp_payment_id: paymentId, request_id: requestId, paid_at: now }).eq("id", pay.id);
      const { data: seat } = await admin.from("plan_requests").select("id, status, party_size, paid_at").eq("id", requestId).single();
      return json(req, { request: seat });
    }

    return json(req, { error: "Unknown action" }, 400);
  } catch (e) {
    return json(req, { error: (e as Error).message }, 500);
  }
});
