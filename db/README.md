# meetra database (Postgres on Supabase)

One file: **`schema.sql`**. Run it once in Supabase → SQL Editor. There is no fake or sample data; the only starter rows are the three cities. Step-by-step setup is in [`../SETUP-LOGIN.md`](../SETUP-LOGIN.md).

## Assumptions
- **Login:** Supabase Auth with **Google** (Gmail) or **WhatsApp OTP** (through Twilio). Logging in the first time creates the member's account; there's no separate sign-up form.
- **Nobody is blocked for a short profile.** Every member gets a **priority score (0–100)** from how much they've filled in and verified. Seats and waiting-list places go to the highest score first, then whoever asked earlier.
- **Verified marks** (`phone_verified_at`, `email_verified_at`) are copied from the login system. Members can't set them. Changing a verified phone or email removes the mark until it's confirmed again.
- **Members are 18+.** Checked on the date of birth.
- **Plans still live in `docs/assets/js/data.js`.** Requests, the waiting list and swipe interest refer to a plan by its website id (`plan_ref`, e.g. `introverts-dinner-jaipur-20261123`). The seat count for auto-fill comes from `data.js`.
- **Swipe interest works without login.** It's counted per browser, using a random device id, so the same person on two phones counts twice.
- **Hosts see a guest's private details** only for guests of their own events (the `events` / `seat_requests` tables), and only until 7 days after it ends. Until hosts have accounts, admins handle plan requests.
- **Money in paise** (₹99 = `9900`), **times in UTC**, shown in India time.

## Priority score
| Item | Points |
|---|---|
| Photo | 15 |
| First name · city · occupation | 5 each |
| Bio of 20+ characters / 80+ characters | 10 / +5 |
| Full name · date of birth · gender | 5 each |
| WhatsApp number / **verified** | 5 / +10 |
| Email / **verified** | 5 / +5 |
| Instagram · LinkedIn · house rules accepted | 5 each |

`users.profile_score` is recalculated automatically whenever the profile or login changes. The same weights are in `docs/profile.html`; keep both in sync if you change them.

## Tables
| Table | Holds | Who can read it |
|---|---|---|
| `cities` | Jaipur, Ahmedabad, Udaipur (not live) | Everyone |
| `users` | Public profile: photo, first name, city, occupation, bio; hidden: role, score | Everyone sees the public part |
| `user_private` | Full name, date of birth, gender, WhatsApp, email, Instagram, LinkedIn, verified marks | The member, the hosts concerned, admins |
| `plan_requests` | **Seat requests and waiting list** for website plans: status pending / approved / waitlisted / declined / cancelled | The member (own), admins |
| `plan_interest` | **Swipes**: interested or skip, per device per plan | Admins only (anyone sees totals) |
| `hosts`, `events`, `seat_requests`, `saved_events`, `reviews` | For when plans move into the database | See `schema.sql` |

Profile photos go in the Storage bucket **`avatars`**; each member can only upload into their own folder.

## Functions the site calls
| Function | Who | Does |
|---|---|---|
| `me()` | logged in | Your id, name, photo, role, score, verified marks |
| `plan_counts(refs[])` | anyone | Seats filled, waiting-list size, ♥ interested, per plan (numbers only) |
| `record_interest(device, plan, reaction)` | anyone | Saves a swipe; swiping again changes the answer |
| `my_waitlist_position(plan)` | logged in | "You're #3 on the waiting list" |
| `admin_interest_summary()` | admins | Interested / skipped / requests / filled / waiting for every plan |
| `admin_plan_queue(plan)` | admins | Everyone who asked, best score first, with contact details |
| `admin_fill_plan(plan, seats)` | admins | Keeps those already approved, approves the next best until full, waitlists the rest in order |

## How the pages use it
| Page | Uses |
|---|---|
| `login.html` | Google or WhatsApp code; afterwards returns to the page you came from |
| `profile.html` | Live priority score, `users`, `user_private`, Storage `avatars`, verify phone or email |
| `event.html` | Real seats left and ♥ count; **Request a seat**, or **Join the waiting list** when full; shows your status, your waiting-list place and a Cancel button |
| `swipe.html` (Discover) | One card per upcoming plan; right = interested (also saved), left = skip |
| `saved.html` (Your plans) | Your requests with status |
| `admin.html` | Interest table, request queue, auto-fill |
| Every page | Header **Log in**, or your photo with score, *My profile / Your plans / Discover / Admin / Log out*; a yellow bar nudges members with a score under 70 |

With login switched off (empty keys in `config.js`), requests still go by WhatsApp and swipes are kept only in the visitor's browser.

## Keys
| Key | In the public repo? |
|---|---|
| Project URL, **anon / publishable** key | ✅ Safe. Goes in `docs/assets/js/config.js`. |
| **service_role / secret** key | ❌ Never. It skips every privacy rule. |
| Database password / connection string | ❌ Never |
| JWT secret | ❌ Never |
| Google client secret, Twilio Auth Token | ❌ Never. These go only inside Supabase's settings. |

If a secret is ever pushed by mistake, rotate it in Supabase or Google or Twilio right away. Deleting the file is not enough, because git keeps the history.

## Tested
`schema.sql` was run in a local Postgres with stand-ins for Supabase's login and storage. 46 checks passed, including:
- A short profile can still request; scores come out as expected (10, 80, 85)
- Auto-fill approves the highest scores and waitlists the rest; a low score that asked first is still behind
- After a cancellation, auto-fill promotes the next person from the waiting list
- Members can't approve themselves; only admins can run auto-fill or see the queue
- Logged-out swipes are counted; nobody but admins can see who swiped
- Members can't mark themselves verified, and under-18s are refused

It has not yet been run on a real Supabase project.

## Still missing
1. **Plans in the database:** plans and seat counts still come from `data.js`. Moving them in gives hosts their own dashboards.
2. **Notifications:** nobody is messaged automatically when approved or promoted from the waiting list yet. The team messages them from the admin page (WhatsApp link).
3. **Payments:** Razorpay/UPI with a server-side webhook.
4. **Show-up history** in the score (attended vs no-show), once attendance is recorded.
5. **ID checks** (Aadhaar or DigiLocker), reports and blocking, account deletion from the website.
