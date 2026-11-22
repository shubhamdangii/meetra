# Launch checklist (updated 23 Nov 2026)

**Short answer: the website works, but don't launch publicly tomorrow until the 🔴 items are done.** They're content and accounts, not code. Most take minutes.

## 🔴 Must do before launch
| # | What | Why | Where |
|---|---|---|---|
| 1 | **Turn off the example plans** (`samplePlans: false`) and add your real events in **Admin → 🚀 Events** (a draft goes live only after the other main admin approves it) | Right now the site shows a plan almost every day, generated from examples in `data.ts`. People will request seats for plans that won't happen. | `web/src/lib/config.ts` |
| 2 | **Real contact details**: WhatsApp number, email, Instagram, WhatsApp community link | They're placeholders (`910000000000`, `hello@example.com`). Requests without login and every "WhatsApp us" button go nowhere. | `web/src/lib/config.ts` |
| 3 | **Real hosts** (names, bios) or remove the example ones | The hosts (Aarav, Meera, Kabir…) are examples. The home page shows them as "verified hosts". | `HOSTS` in `web/src/lib/data.ts` |
| 4 | **Remove example reviews and "Past nights"** until you have real ones (`showSampleNotice` hides the notes, not the content) | Fake testimonials mislead people. | `REVIEWS`, stories in `web/src/lib/data.ts` |
| 5 | **Terms & privacy policy** | Placeholder text. You collect phone numbers, date of birth and photos, so a real privacy policy is needed. | `web/src/app/about/page.tsx` |
| 6 | **Google login open to everyone**: in Google Cloud → OAuth consent screen, check the app is **"In production"**, not "Testing" | In Testing mode only listed test users can log in. | console.cloud.google.com |
| 7 | **Second main admin logs in once**: akash.apply4@gmail.com logs in with Google | Until then nobody can approve your requests (no one approves their own). | the website |
| 8 | **Gmail SMTP in Supabase** (Authentication → Emails → SMTP) | Without it, email sign-up confirmation mails don't reach normal people. | supabase.com dashboard |
| 9 | **How guests pay the ₹99** after approval (UPI link / QR, who checks it) | The site says "pay after approval" but there's no payment step yet. It's done by hand on WhatsApp. | Process (and later a payment link) |

## 🟡 Soon after launch
- **WhatsApp login (Meta)**: still pending. Google login works now.
- **Your own domain** (e.g. meetra.in) instead of `shubhamdangii.github.io/meetra`. Then set `siteUrl` in config and `NEXT_PUBLIC_BASE_PATH=""`.
- **Supabase free plan** pauses a project after 7 days with no traffic. Upgrade, or make sure the site is used weekly.
- **Map tiles** come from OpenStreetMap's free servers. Fine for a small launch; for heavy traffic, switch to a paid tile provider.
- Sub-admins: they log in once, then **Admin → 👥 Team → Request add** (the other main admin approves).
- Each main admin: open the admin desk on your phone (installed app) → 🔔 → **Turn on phone alerts**.
- **2-factor login for main admins**: planned, not built yet.
- **WhatsApp number verification**: needs the Meta WhatsApp Business setup first.

## ✅ Ready
- Login (Google), profile with priority score, XP and badges
- Plans, filters (category, price dropdown, dates), map view, swipe Discover
- Seat requests → approve / waitlist / decline (by hand or auto-fill), statuses in "My plans"
- Door pass with QR, add to calendar, bring-a-friend links
- **Door check-in**: Admin → Door check-in scans passes with the phone camera
- Main admin + city admins with limited access (checked in the database, tested)
- Launch new plans from the admin page (live instantly)
- Host waiting list, games page (7 decks, 14 party games)
- Security: database rules on every table, no secret keys in the site, CSP
- robots.txt and sitemap for Google
