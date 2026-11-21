// WhatsApp login for the website (called from the browser).
//
//   POST { action: "start" }                     → { id, secret, code, waNumber, waLink, expiresAt }
//   POST { action: "start", purpose: "link" }    → same, but adds the number to the logged-in member
//                                                  (send the member's access token in Authorization)
//   POST { action: "poll", id, secret }          → { status: "pending" | "expired" }
//                                                  or { status: "done", session } after a login
//                                                  or { status: "done", linked: true } after adding a number
//
// The member proves the number is theirs by SENDING "LOGIN <code>" from it
// on WhatsApp; the wa-webhook function records the sender's number.
import { admin, anonClient, cors, json, randomSecret, safeEqual, sha256Hex, sixDigitCode } from "../_shared/common.ts";

const WA_NUMBER = (Deno.env.get("WA_DISPLAY_NUMBER") ?? "").replace(/\D/g, "");   // meetra's WhatsApp number, digits

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Use POST" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: "Invalid JSON" }, 400); }

  try {
    if (body.action === "start") return await start(req, body);
    if (body.action === "poll") return await poll(req, body);
    return json(req, { error: "Unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json(req, { error: "Something went wrong. Please try again." }, 500);
  }
});

async function start(req: Request, body: Record<string, unknown>) {
  if (!WA_NUMBER) return json(req, { error: "WhatsApp login isn't set up yet." }, 503);
  const purpose = body.purpose === "link" ? "link" : "login";

  let linkUserId: string | null = null;
  if (purpose === "link") {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return json(req, { error: "Please log in first." }, 401);
    linkUserId = data.user.id;
  }

  // Tidy up: expire old requests, delete day-old ones.
  await admin.from("wa_login_requests").update({ status: "expired" }).eq("status", "pending").lt("expires_at", new Date().toISOString());
  await admin.from("wa_login_requests").delete().lt("created_at", new Date(Date.now() - 864e5).toISOString());

  const secret = randomSecret();
  const secretHash = await sha256Hex(secret);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = sixDigitCode();
    const { data, error } = await admin.from("wa_login_requests")
      .insert({ purpose, code, secret_hash: secretHash, link_user_id: linkUserId })
      .select("id, expires_at").single();
    if (error) { if (error.code === "23505") continue; throw error; }   // code already waiting → try another
    const text = `LOGIN ${code}`;
    return json(req, {
      id: data.id, secret, code, waNumber: "+" + WA_NUMBER, expiresAt: data.expires_at,
      waLink: `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`,
    });
  }
  return json(req, { error: "Busy, please try again." }, 503);
}

async function poll(req: Request, body: Record<string, unknown>) {
  const id = String(body.id ?? ""), secret = String(body.secret ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{64}$/.test(secret)) return json(req, { error: "Bad request" }, 400);

  const { data: r } = await admin.from("wa_login_requests").select("*").eq("id", id).maybeSingle();
  if (!r || !safeEqual(r.secret_hash, await sha256Hex(secret))) return json(req, { error: "Not found" }, 404);

  if (r.status === "pending") {
    if (new Date(r.expires_at) < new Date()) {
      await admin.from("wa_login_requests").update({ status: "expired" }).eq("id", id);
      return json(req, { status: "expired" });
    }
    return json(req, { status: "pending" });
  }
  if (r.status !== "verified") return json(req, { status: r.status });

  // One use only: claim it before doing anything.
  const { data: claimed } = await admin.from("wa_login_requests").update({ status: "used" })
    .eq("id", id).eq("status", "verified").select("id").maybeSingle();
  if (!claimed) return json(req, { status: "used" });

  const phone = r.phone as string;                 // digits, e.g. 917852090270
  const { data: ownerId } = await admin.rpc("wa_find_user_by_phone", { p_phone: phone });

  if (r.purpose === "link") {
    if (ownerId && ownerId !== r.link_user_id) {
      return json(req, { status: "error", error: "This WhatsApp number is already used by another meetra account." }, 409);
    }
    const { error } = await admin.auth.admin.updateUserById(r.link_user_id, { phone: "+" + phone, phone_confirm: true });
    if (error) throw error;
    return json(req, { status: "done", linked: true, phone: "+" + phone });
  }

  // Login: find or create the account for this number, then open a session with a
  // one-time login link made on the server (never emailed). Members who only use
  // WhatsApp get a placeholder address @wa.meetra.invalid that the site ignores.
  const placeholder = `${phone}@wa.meetra.invalid`;
  let email: string;
  if (ownerId) {
    const { data: u, error } = await admin.auth.admin.getUserById(ownerId);
    if (error || !u.user) throw error ?? new Error("User not found");
    email = u.user.email ?? "";
    const fix: Record<string, unknown> = {};
    if (!u.user.phone_confirmed_at) fix.phone_confirm = true;
    if (!email) { email = placeholder; fix.email = placeholder; fix.email_confirm = true; }
    if (Object.keys(fix).length) {
      const { error: e2 } = await admin.auth.admin.updateUserById(ownerId, fix);
      if (e2) throw e2;
    }
  } else {
    email = placeholder;
    const { error } = await admin.auth.admin.createUser({ phone: "+" + phone, phone_confirm: true, email, email_confirm: true });
    if (error) throw error;
  }
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link.properties?.hashed_token) throw linkErr ?? new Error("No login link");
  const { data: s, error: signErr } = await anonClient().auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (signErr || !s.session) throw signErr ?? new Error("No session");

  return json(req, {
    status: "done",
    session: { access_token: s.session.access_token, refresh_token: s.session.refresh_token },
  });
}
