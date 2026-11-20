# meetra — hosted meetups website

A static website (plain HTML/CSS/JS, no build step). **All website files are in the `docs/` folder.** Free to host on GitHub Pages; later you can move it to any hosting by uploading this folder.

## Pages
| File | Page |
|---|---|
| `docs/index.html` | Home — hero, this weekend / this week / next week, hosts, reviews, FAQ |
| `docs/events.html` | Explore — every plan, filter by day strip, category, date, price, search |
| `docs/event.html#<plan-id>` | Event detail — running order, host, before you go, seat request (WhatsApp) |
| `docs/past.html` | Past nights / photo stories |
| `docs/saved.html` | Your plans — saved ♥ and requested seats (stored in the visitor's browser) |
| `docs/host.html` | Host a meetup — pitch form (WhatsApp) |
| `docs/partners.html` | For brands & venues |
| `docs/about.html` | How it works, safety, terms & privacy |
| `docs/404.html` | Not-found page |

## Change things
- **Brand name, WhatsApp number, email, cities** → `docs/assets/js/config.js`
- **Meetups, hosts, reviews** → `docs/assets/js/data.js`
  - Add a plan once as a *template* with weekdays (`days: [1, 4]` = Mon & Thu) and the site generates every date for the next 4 weeks automatically.
  - Add a city: add it in `config.js` (`live: true`) and add an entry for it inside each template's `cities`.
  - Real photos: put them in `docs/assets/img/` and add `image: "assets/img/dinner.jpg"` to a template or city entry.
- **Colours & fonts** → top of `docs/assets/css/style.css`

Before launch: set your real WhatsApp number, replace the sample reviews and hosts, then set `showSampleNotice: false`.

## Deploy on GitHub Pages (free)
This repo is set up for GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / `/docs`**.

To update the live site, edit files and push:
```
git add .
git commit -m "Update meetups"
git push
```
GitHub redeploys automatically in about a minute.

## Moving to your own domain later
- Buy the domain, then in **Settings → Pages → Custom domain** enter it (e.g. `meetra.in`) and follow GitHub's DNS instructions. You can keep hosting free on GitHub.
- Or upload this folder to any web host (Hostinger, Netlify, Vercel, cPanel) — no server code needed.

## Run locally
Run `node server.js` and open http://localhost:5173, or open `docs/index.html` in a browser.
