# meetra — hosted meetups for people coming solo

Live site: **https://shubhamdangii.github.io/meetra/**

| Folder | What's in it |
|---|---|
| `web/` | The website: **Next.js 16 + React 19 + Framer Motion**, exported as static files |
| `supabase/` | Database migrations and server functions (WhatsApp login) for Supabase |
| `db/` | Readable copy of the database schema + notes |
| `.github/` | Auto-deploy to GitHub Pages, and Dependabot security updates |
| `SETUP-LOGIN.md` | How Google and WhatsApp login are set up |

## Change things
- **Brand, cities, WhatsApp number, login switches** → `web/src/lib/config.ts`
- **Meetups, hosts, reviews** → `web/src/lib/data.ts`
  Add a plan once as a *template* with weekdays (`days: [1, 4]` = Mon & Thu); the site creates every date for the next 4 weeks.
- **Colours & fonts** → top of `web/src/app/globals.css`
- **Pages** → `web/src/app/<page>/page.tsx` and `web/src/components/pages/`

## Run on your computer
```
cd web
npm install
npm run dev
```
Open http://localhost:3000/meetra/

## Deploy
Just push to `main`. GitHub Actions (`.github/workflows/deploy.yml`) installs the exact locked packages, refuses to deploy if a dependency has a known high-severity security hole, type-checks, builds and publishes to GitHub Pages. About 2 minutes.

Moving to your own domain later: set `NEXT_PUBLIC_BASE_PATH=""` in the workflow, add the domain in **Settings → Pages → Custom domain**, and add the new address to Supabase's login redirect URLs.

## Security
- **The real protection is in the database:** every table has row level security, so even someone calling the database directly only gets what the rules allow (see `db/README.md`).
- **No secrets in this repo.** The Supabase *anon* key in `config.ts` is public by design. Secret keys live only in Supabase. The local `.secrets/` folder is git-ignored.
- **Content Security Policy** on every page: the browser blocks scripts, frames and connections to anything except this site and our Supabase project.
- **No third-party scripts or fonts at runtime:** fonts and the QR-code generator are bundled into the site.
- **Static site:** no server of our own to break into; logins run on Supabase.
- **Dependencies:** exact versions locked; `npm audit` gate in CI; Dependabot opens update PRs weekly.
