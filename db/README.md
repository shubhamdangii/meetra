# meetra database (Postgres on Supabase)

One file: **`schema.sql`**. Run it once in Supabase → SQL Editor. There is no fake or sample data. The only starter rows are the three cities. Step-by-step setup is in [`../SETUP-LOGIN.md`](../SETUP-LOGIN.md).

## Assumptions
- **Login:** Supabase Auth with **Google** (Gmail) or **WhatsApp OTP** (through Twilio). Logging in the first time creates the member's account; there's no separate sign-up form.
- **Trust:** a member must complete their profile before they can request a seat or apply to host. The database checks this, not only the website.
- **Verified marks** (`phone_verified_at`, `email_verified_at`) are copied from the login system. Members can't set them. Changing a verified phone or email removes the mark until it's confirmed again.
- **Members are 18+.** Checked on the date of birth.
- **Hosts see a guest's private details** only for guests who requested their event, and only until 7 days after it ends.
- **One host per event.** Each date of a repeating plan is its own row in `events`.
- **Money in paise** (₹99 = `9900`), **times in UTC**, shown in India time.

## Tables
| Table | Holds | Who can read it |
|---|---|---|
| `cities` | Jaipur, Ahmedabad, Udaipur (not live) | Everyone |
| `users` | Public profile: photo, first name, city, occupation, bio, "profile complete" | Everyone; role and login link are hidden |
| `user_private` | Full name, date of birth, gender, WhatsApp number, email, Instagram, LinkedIn, verified marks, house-rules agreement | The member, hosts of events they requested (time-limited), admins |
| `hosts` | Verified hosts | Everyone sees active hosts |
| `events` | One dated meetup | Everyone; exact address only for approved guests via `event_address()` |
| `seat_requests` | Requests and their status | The member, that event's host, admins |
| `saved_events` | ♥ saved plans | Only the member |
| `reviews` | Ratings from members who attended | Everyone sees published, public ones |

Profile photos go in the Storage bucket **`avatars`**, which `schema.sql` creates. Each member can only upload into their own folder.

## A complete profile needs
Photo · first name · city · occupation · bio (20+ characters) · full name · date of birth (18+) · gender · WhatsApp number · email · Instagram **or** LinkedIn · house rules accepted · at least one of phone/email verified by login.
`users.profile_completed_at` is set automatically when all of these are present, and cleared if one is removed.

## How the pages use it
| Page | Uses |
|---|---|
| `login.html` | Supabase Auth: Google, or WhatsApp code |
| `profile.html` | `me()`, `users`, `user_private`, Storage `avatars`; verify phone or email |
| Every page | Header shows **Log in**, or your photo with **My profile / Your plans / Log out**; a yellow bar reminds members with an incomplete profile |
| `event.html`, `host.html` | Must be logged in with a complete profile before requesting a seat or applying to host |
| Other pages | Still read meetups from `docs/assets/js/data.js` (not from the database yet) |

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
`schema.sql` was run in a local Postgres with stand-ins for Supabase's login and storage. 24 checks passed, including:
- Google login pre-fills name, photo and a verified email
- WhatsApp is verified only after the code is entered
- Members can't mark themselves verified, and under-18s are refused
- An incomplete profile can't request a seat
- Hosts see only their own guests' private details

It has not yet been run on a real Supabase project.

## Still missing
1. **Meetups in the database:** the pages still read `data.js`. Moving events and seat requests into the database is the next step.
2. **Payments:** Razorpay/UPI with a server-side webhook.
3. **Host dashboard and admin page:** approve guests, verify hosts, check profiles.
4. **ID checks** (for example Aadhaar or DigiLocker), if you want stronger verification later. That needs a provider and a careful privacy policy.
5. **Reports and blocking** between members.
6. **Deleting an account** from the website. Deleting the database row already removes all of the member's data.
7. **Old photos:** uploading a new photo doesn't delete the old file yet.
