"use client";
// Razorpay Checkout (UPI / QR, cards, netbanking, wallets). The order is created and the payment
// verified by our `payments` edge function; the key secret never reaches the browser.
import type { SupabaseClient } from "@supabase/supabase-js";

type Order = { key_id: string; order_id: string; amount: number; currency: string; name: string; description: string; prefill: Record<string, string> };
type RzpResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RzpCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (r: { error?: { description?: string } }) => void) => void };
export type PaidSeat = { id: number; status: string; party_size: number; paid_at?: string | null };

let loading: Promise<void> | null = null;
function loadCheckout(): Promise<void> {
  if ((window as unknown as { Razorpay?: RzpCtor }).Razorpay) return Promise.resolve();
  if (!loading) loading = new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.async = true;
    s.onload = () => ok(); s.onerror = () => { loading = null; fail(new Error("Couldn't load the payment window. Check your internet and try again.")); };
    document.head.appendChild(s);
  });
  return loading;
}

/** Opens Razorpay. Resolves with the paid seat, or null if the person closed the window. */
export async function payForSeat(client: SupabaseClient, body: { plan_ref: string; party_size?: number; icebreaker?: string | null; price_hint?: number; request_id?: number }): Promise<PaidSeat | null> {
  await loadCheckout();
  const { data, error } = await client.functions.invoke("payments", { body: { action: "order", ...body } });
  const order = data as Order & { error?: string };
  if (error || !order?.order_id) throw new Error(order?.error || (await readError(error)) || "Couldn't start the payment");
  const Razorpay = (window as unknown as { Razorpay: RzpCtor }).Razorpay;
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: order.key_id, order_id: order.order_id, amount: order.amount, currency: order.currency,
      name: order.name, description: order.description, prefill: order.prefill,
      theme: { color: "#6C4CF5" },
      modal: { ondismiss: () => resolve(null), confirm_close: true },
      handler: async (r: RzpResponse) => {
        const v = await client.functions.invoke("payments", { body: { action: "verify", order_id: r.razorpay_order_id, payment_id: r.razorpay_payment_id, signature: r.razorpay_signature } });
        const vd = v.data as { request?: PaidSeat; error?: string };
        if (v.error || !vd?.request) reject(new Error(vd?.error || (await readError(v.error)) || "Payment received but we couldn't confirm it. Contact us, you won't be charged twice."));
        else resolve(vd.request);
      },
    });
    rzp.on("payment.failed", (r) => reject(new Error(r.error?.description || "Payment failed. No money was taken.")));
    rzp.open();
  });
}

async function readError(e: unknown): Promise<string | null> {
  const ctx = (e as { context?: Response } | null)?.context;
  try { const j = await ctx?.json(); return j?.error ?? null; } catch { return null; }
}

export const rupees = (paise: number | null | undefined) => (paise == null ? "" : `₹${(paise / 100).toLocaleString("en-IN")}`);
