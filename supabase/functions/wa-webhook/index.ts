// Meta WhatsApp Cloud API webhook.
//   GET  → Meta's one-time check when you save the webhook (hub.verify_token must match WA_VERIFY_TOKEN)
//   POST → incoming messages. Every request must be signed by Meta with your App Secret
//          (X-Hub-Signature-256); unsigned or wrongly signed requests are ignored.
// When a message contains a waiting 6-digit code, that login request is marked
// verified with the sender's WhatsApp number.
import { admin, safeEqual } from "../_shared/common.ts";

const VERIFY_TOKEN = Deno.env.get("WA_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WA_APP_SECRET") ?? "";
const ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN") ?? "";      // optional: only for the "You're logged in" reply
const PHONE_NUMBER_ID = Deno.env.get("WA_PHONE_NUMBER_ID") ?? "";

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function reply(to: string, text: string) {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) return;
  try {
    await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
    });
  } catch (e) { console.error("reply failed", e); }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && VERIFY_TOKEN &&
      safeEqual(url.searchParams.get("hub.verify_token") ?? "", VERIFY_TOKEN);
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 })
              : new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  const sig = (req.headers.get("x-hub-signature-256") ?? "").replace(/^sha256=/, "");
  if (!APP_SECRET || !sig || !safeEqual(sig, await hmacHex(APP_SECRET, raw))) {
    console.warn("Rejected webhook: bad or missing signature");
    return new Response("Forbidden", { status: 403 });
  }

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return new Response("ok"); }

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      for (const msg of change?.value?.messages ?? []) {
        const from = String(msg?.from ?? "").replace(/\D/g, "");
        const text = String(msg?.text?.body ?? msg?.button?.text ?? "");
        const code = text.match(/\b(\d{6})\b/)?.[1];
        if (!from || !code) continue;

        const { data } = await admin.from("wa_login_requests")
          .update({ status: "verified", phone: from, verified_at: new Date().toISOString() })
          .eq("code", code).eq("status", "pending").gt("expires_at", new Date().toISOString())
          .select("purpose").maybeSingle();

        await reply(from, data
          ? (data.purpose === "link" ? "✅ Number verified! Go back to meetra." : "✅ You're logged in! Go back to meetra.")
          : "That code didn't work or has expired. Go back to meetra and tap \"Continue with WhatsApp\" again.");
      }
    }
  }
  return new Response("ok");   // always 200 so Meta doesn't retry
});
