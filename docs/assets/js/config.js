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
  showSampleNotice: true
};
