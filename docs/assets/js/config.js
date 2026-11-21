/* =========================================================
   SITE SETTINGS — change the brand, cities and contact here.
   Everything on every page reads from this file.
   ========================================================= */
window.CONFIG = {
  brand: "meetra",                 // shown as "meetra." everywhere
  tagline: "Hosted meetups for people coming solo.",
  whatsapp: "910000000000",        // your WhatsApp number with country code, no +
  email: "hello@example.com",
  instagram: "https://instagram.com/",
  whatsappCommunity: "https://chat.whatsapp.com/",

  defaultCity: "jaipur",
  cities: {
    jaipur:    { name: "Jaipur",    tag: "the Pink City",   live: true },
    ahmedabad: { name: "Ahmedabad", tag: "Amdavad",         live: true },
    udaipur:   { name: "Udaipur",   tag: "coming soon",     live: false }
  },

  // Set to false once you replace the sample reviews/stories with real ones.
  showSampleNotice: true,

  /* ---------- LOGIN (Supabase) ----------
     Paste these from Supabase → Project Settings → API.
     ✅ SAFE to put here (the site is public): the Project URL and the
        "anon" / "publishable" key. They can only do what the database's
        security rules allow.
     ❌ NEVER put the "service_role" / "secret" key, the database password
        or any payment key in this file or anywhere in this repo.
     Leave both empty and login stays switched off. */
  supabaseUrl: "https://eqzwolwhecotwiphmjrd.supabase.co",          // e.g. "https://abcdefgh.supabase.co"
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxendvbHdoZWNvdHdpcGhtanJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyMzcwMDQsImV4cCI6MjExMDgxMzAwNH0.vLSh3R25fNUzIN9UJ_VMlrd1KU_PWATJyQzy03HO-5w",      // e.g. "eyJhbGciOi…" or "sb_publishable_…"
  loginWithGoogle: true,
  loginWithWhatsApp: false  // switch to true once Twilio WhatsApp is connected in Supabase (see SETUP-LOGIN.md)
};
