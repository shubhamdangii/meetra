# Human audit of the live site (2026-11-29)

Live site, QA_ accounts only, phone (iPhone 13, WebKit) and desktop (Chrome), headed with video.
Step logs: `web/test-results/audit/phone-run1.json`, `phone-run2.json`, `desktop.json`. Screenshots: `web/test-results/audit/<device>/`. Videos: `web/test-results/videos/`.
Seriousness: A = broken, B = confusing, C = looks bad.

| # | Role | Page or action | What I did | Expected | What happened | Serious | Point | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | admin -> host | Assign a host (admin1 asks, admin2 approves) | Assigned QA_host to an event with a booking | Host gets a notification | Host saw the event in the host desk, but got NO notification | A | 30 | FIXED (batch 1) |
| 2 | admin | Approvals, review of a host's new event | Host filled Maps link and address; admin opened Review | Admin sees the exact location before approving | Maps link and address were not shown (they were saved) | B | chain 2 | FIXED (batch 1) |
| 3 | user | Event page, request box | Logged in, opened a free event | No "log in" advice | Sometimes said "Fill in your profile after logging in" while logged in | B | - | FIXED (batch 1) |
| 4 | user (phone) | My plans / Explore after opening a notification | Opened a notification, then My plans | Page loads | Empty page with "Log in" tab for several seconds, then fine (seen once) | B | - | needs re-check |
| 5 | host | Propose event form | Filled every field | A house rules field | No house rules field in the event form | B | chain 1 | needs your decision |
| 6 | visitor (phone) | Explore | Opened Explore in Safari | Clean console | "Fetch ... due to access control checks" errors (page prefetch, service worker) | C | - | open |
| 7 | all | Headings | Read pages on phone | No single word alone on the last line | "Been there, together.", "Swipe your week.", "Safe by design.", "Terms & privacy.", "Wear the plan.", "Brought the crew", merch names, event page "How it unfolds" | C | 2 | open (older point 2) |
| 8 | admin | Seat requests row | Opened a request | No WhatsApp verification | Row still has a "WhatsApp" contact link (not verification) | C | 26 | kept (contact, not verification) |
| 9 | visitor | Explore "Games" filter | Tapped Games | List changes | Count stayed 9 (may be my test tapping the wrong button) | B | - | needs re-check |

Worked (both sizes): every public page and 22 footer links open; landing h1 and "30+ plans" unchanged; game page; public host profile; login/logout with every role and the bottom bar after every switch (28); profile has 7 parts totalling 100 and updates on save (27); no WhatsApp verification for user, host, sub-admin, admin1 (26; only the invite "share on WhatsApp" button remains); request, cancel, request again gives a second "received" (24); mark read lowers the count (24); host proposal goes to admins with all data saved; admin approve -> event live in Events library with "Active on" (29); booking -> "1 booked" + "Needs a host" (29); assign -> admin2 approves -> host desk shows it, user gets "host announced", event page shows the host (24); sub-admin sees only Ahmedabad.

Not tested: payments, refunds, push, WhatsApp login, Google login, door scanner (camera). Admin2 could not approve one host proposal on phone because the owner account approved it first (real approval, not a bug).
