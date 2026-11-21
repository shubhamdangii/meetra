# Switch on login (Google + WhatsApp)

The website already has the login, profile and logout pages. They stay switched off until you do the steps below. You need to do these yourself, because they involve creating accounts and keys. About 30–45 minutes for Google; WhatsApp takes longer because Meta has to approve your sender.

---

## 1. Create the database (free)
1. Go to **supabase.com** → sign up → **New project**.
   - Name: `meetra` · Region: **Mumbai (ap-south-1)** · choose a strong database password and keep it private.
2. Open **SQL Editor** → **New query** → paste everything from `db/schema.sql` → **Run**. It should say *Success*.

## 2. Connect the website
1. Supabase → **Project Settings → API** (or **API Keys**).
2. Copy the **Project URL** and the **anon / publishable** key.
3. Paste them into `docs/assets/js/config.js`:
   ```js
   supabaseUrl: "https://abcdefgh.supabase.co",
   supabaseAnonKey: "eyJhbGciOi…",
   ```
   ✅ These two are safe in the public repo.
   ❌ **Never** paste the `service_role` / `secret` key, the database password, the Google client secret or any Twilio token into any file in this repo.
4. Supabase → **Authentication → URL Configuration**:
   - **Site URL:** `https://shubhamdangii.github.io/meetra/`
   - **Redirect URLs:** add both:
     - `https://shubhamdangii.github.io/meetra/profile.html`
     - `http://localhost:5173/profile.html` (for testing on your computer)

## 3. Login with Google (Gmail)
1. Go to **console.cloud.google.com** → create a project called `meetra`.
2. **APIs & Services → OAuth consent screen** → External → app name `meetra`, your support email, add your website link → Save. Then **Publish app**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Type: **Web application**
   - **Authorized redirect URI:** `https://<your-project>.supabase.co/auth/v1/callback`. The exact link is shown in Supabase → Authentication → Providers → Google.
4. Copy the **Client ID** and **Client secret**.
5. Supabase → **Authentication → Providers → Google** → Enable → paste both → Save.
   The client secret lives only inside Supabase, never in the repo.

Test it: open the site → **Log in** → **Continue with Google**. You'll land on the profile page.

## 4. Login with WhatsApp (OTP code)
Supabase sends WhatsApp codes through **Twilio**.
1. Create an account at **twilio.com**.
2. **For testing:** Twilio Console → Messaging → *Try WhatsApp* (the sandbox). Only phones that join the sandbox can receive codes.
3. **For real users:** register a **WhatsApp Business sender** in Twilio. This needs a Meta Business account, and Meta must approve it, which can take a few days. Twilio charges a small fee per message; check Twilio's pricing for India.
4. Supabase → **Authentication → Providers → Phone** → Enable → SMS provider **Twilio** (or **Twilio Verify**) → paste the Account SID, Auth Token and sender / Message Service SID → Save.
   The Auth Token is secret. It goes only in Supabase.

Until WhatsApp is approved, you can launch with Google only. Set this in `config.js`:
```js
loginWithWhatsApp: false
```

## 5. Make yourself an admin
After you log in once, run this in the Supabase SQL Editor with your email:
```sql
update public.users set role = 'admin'
where auth_id = (select id from auth.users where email = 'YOUR-EMAIL@gmail.com');
```
Admins can see every member's private details. Give this role only to people you fully trust.

## 6. Put it live
Commit and push the changed `config.js`. GitHub Pages updates within a minute.

---

## What members see
1. **Log in** button at the top right → Google or WhatsApp.
2. First time → **profile page** with a progress bar. Required:
   - **Shown to everyone:** photo, first name, city, what they do, a short bio (20+ characters)
   - **Private:** full name, date of birth (18+ only), gender, WhatsApp number, email, Instagram *or* LinkedIn, and agreeing to the house rules
3. Badges show **WhatsApp verified** and **Email verified**. A Google user can verify their WhatsApp number on the profile page, and a WhatsApp user can verify their email.
4. **Request a seat** and **Host a meetup** only work once the profile is complete. Otherwise the member is sent to log in or finish the profile first, then brought back.
5. **Log out:** avatar menu at the top right, or the bottom of the profile page.

## Who can see what
| Data | Who sees it |
|---|---|
| Photo, first name, city, occupation, bio | Everyone |
| Full name, date of birth, gender, phone, email, Instagram, LinkedIn | The member, hosts of plans they requested (until 7 days after the plan), and admins |
| "Verified" marks | Set only by the login itself. Members can't fake them. |

The database enforces all of this, not only the website, so it holds even if someone bypasses the pages.

## Check after setup
- [ ] Google login lands on the profile page, with name and photo filled in from Google
- [ ] WhatsApp code arrives and logs you in
- [ ] Saving the full profile shows "Profile complete"
- [ ] Logged out → "Request a seat" sends you to the login page
- [ ] **Verify** on the phone field (after Google login) sends a WhatsApp code. This uses Supabase's phone-change check; test it once your Twilio sender is live.
