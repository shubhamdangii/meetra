// Builds every dated meetup from the templates in data.ts, plus small helpers.
// Dates are relative to "today", so this runs in the browser (never at build time).
import { CONFIG } from "./config";
import { CATEGORIES, PALETTES, TEMPLATES } from "./data";
import manifest from "./image-manifest.json";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
type Manifest = { events: Record<string, string[]> };
const M = manifest as unknown as Manifest;
/** Every folder in public/images/events is an event type, named exactly like the folder. */
export const EVENT_TYPES: string[] = Object.keys(M.events);
/** Site path of a photo in an event-type folder (stored in the database as this path). */
export const typeImagePath = (type: string, file: string) => `/images/events/${encodeURIComponent(type)}/${encodeURIComponent(file)}`;
/** Photos in public/images/events/<type>/ (cover.* first), as usable URLs. */
export const typeImages = (type: string | null | undefined): string[] => (type && M.events[type] ? M.events[type].map((f) => BASE + typeImagePath(type, f)) : []);
/** A stored image: "/images/…" paths get the site prefix, uploaded https:// links stay as they are. */
export const imgSrc = (u: string | null | undefined): string | null => (!u ? null : u.startsWith("/") ? BASE + u : u);
/** The example plans' photo folders. */
export const TEMPLATE_TYPE: Record<string, string> = {
  "introverts-dinner": "Introverts' Dinner", "board-games-chai": "Boards & Chai", "mafia-night": "Mafia Night", "pickleball-dinner": "Pickleball & Dinner",
  "run-club": "Run & Coffee", "home-cinema": "Home Cinema", "book-club-lunch": "Books & Bites", "open-mic": "Open Mic", "craft-workshop": "Craft & Chill",
  "sketch-walk": "Sketch Walk", "food-walk": "Street Food Walk", "sunrise": "Sunrise Trek", "quiz-night": "Quiz Night", "deep-talks": "2AM Deep Talks",
  "karaoke": "Karaoke Chaos", "bonfire": "Bonfire Jam", "life-lunch": "Life & Lunch", "badminton": "Smash & Chai", "women-brunch": "Sunday Breakfast Club",
  "salsa": "Salsa Social", "photo-walk": "Photo Walk", "night-sky-trip": "Stargazing Trip",
};
/** Photos for an example plan (by its key), from its event-type folder. */
export const eventImages = (key: string): string[] => typeImages(TEMPLATE_TYPE[key]);

export type MeetEvent = {
  id: string; key: string; city: string; date: Date; day: number; title: string;
  cat: string; time: string; end: string; area: string; hosts: string[];
  price: number; priceType: "free" | "reservation" | "per person" | "estimate";
  seats: number; left: number; emoji: string; pal: number; pattern: string;
  blurb: string; steps: string[]; tags: string[]; image: string | null;
  hostId?: number; bookingClosesAt?: Date;   // real events from the admin desk only
  eventType?: string | null;                 // folder name in public/images/events
  audience: Audience;                        // who can come
};
export type Audience = "mixed" | "men" | "women";
export const AUDIENCE_LABEL: Record<Audience, string> = { mixed: "Mixed", men: "Boys only", women: "Girls only" };
/** Day plan (starts before 5 pm) or night plan. */
export const dayPart = (e: Pick<MeetEvent, "time">): "day" | "night" => (mins(e.time) < 17 * 60 ? "day" : "night");

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
export const mins = (t: string) => { const m = /(\d+)(?::(\d+))?\s*(am|pm)/i.exec(t || ""); if (!m) return 0; let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12; return h * 60 + (+m[2] || 0); };
export const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return Math.abs(h); };

const PAST_DAYS = 35, AHEAD_DAYS = 28;

/** A plan added from the admin page (table custom_plans). */
export type CustomPlan = {
  id: number; city_slug: string; title: string; category: string; starts_on: string; time_label: string; end_label: string | null;
  area: string; price: number; price_type: MeetEvent["priceType"]; seats: number; emoji: string; blurb: string;
  steps: string[]; tags: string[]; host_name: string | null; status: string;
  plan_ref: string; host_id: number | null; category_other?: string | null; event_type?: string | null; image_url?: string | null; starts_at: string; ends_at: string; booking_closes_at: string; deleted_at: string | null; cancel_reason: string | null; is_active?: boolean; audience?: Audience;
};
const PATTERNS = ["dots", "grid", "rings", "stripes", "sun", "waves"];
export const customPlanId = (c: Pick<CustomPlan, "id" | "city_slug" | "starts_on"> & { plan_ref?: string }) => c.plan_ref || `x${c.id}-${c.city_slug}-${c.starts_on.replace(/-/g, "")}`;

export function buildEvents(today: Date, custom: CustomPlan[] = [], hidden: Set<string> = new Set()) {
  const diff = (d: Date) => Math.round((d.getTime() - today.getTime()) / 864e5);
  const all: MeetEvent[] = [];
  Object.entries(CONFIG.cities).filter(([, c]) => c.live).forEach(([city]) => {
    (CONFIG.samplePlans ? TEMPLATES : []).filter((t: any) => !hidden.has(t.key)).forEach((t: any) => {
      const ov = t.cities && t.cities[city]; if (!ov) return;
      const dates: Date[] = [];
      if (t.once != null) dates.push(addDays(today, t.once));
      else for (let i = -PAST_DAYS; i < AHEAD_DAYS; i++) {
        const d = addDays(today, i);
        if (!t.days.includes(d.getDay())) continue;
        const week = Math.floor(d.getTime() / (7 * 864e5));
        if (t.every && week % t.every !== 0) continue;
        dates.push(d);
      }
      dates.forEach((d) => {
        const week = Math.floor(d.getTime() / (7 * 864e5));
        let title = ov.title || t.title;
        if (t.themes) title += " · " + t.themes[week % t.themes.length];
        const id = `${t.key}-${city}-${ymd(d)}`;
        const seats = ov.seats || t.seats;
        const taken = Math.min(seats, Math.floor(seats * (0.35 + (hash(id) % 60) / 100)));
        all.push({
          id, key: t.key, city, date: d, day: diff(d), title,
          cat: t.cat, time: ov.time || t.time, end: ov.end || t.end, area: ov.area,
          hosts: ["tba"], price: ov.price ?? t.price, priceType: t.priceType,
          seats, left: Math.max(0, seats - taken), emoji: ov.emoji || t.emoji,
          pal: ov.pal ?? t.pal, pattern: t.pattern, blurb: ov.blurb || t.blurb,
          steps: t.steps, tags: t.tags || [], image: ov.image || t.image || eventImages(t.key)[0] || null, eventType: TEMPLATE_TYPE[t.key] ?? null,
          audience: (t.tags || []).includes("Girls only") ? "women" : "mixed",
        });
      });
    });
  });
  custom.forEach((c) => {
    if (c.status !== "approved" || c.deleted_at || c.is_active === false || !CONFIG.cities[c.city_slug]) return;
    const [y, m, dd] = c.starts_on.split("-").map(Number);
    const d = new Date(y, m - 1, dd);
    const id = customPlanId(c);
    all.push({
      id, key: `x${c.id}`, city: c.city_slug, date: d, day: diff(d), title: c.title, cat: c.category,
      time: c.time_label, end: c.end_label || "", area: c.area, hosts: [c.host_name || "tba"],
      price: c.price, priceType: c.price_type, seats: c.seats, left: c.seats, emoji: c.emoji || "✨",
      pal: hash(id) % 8, pattern: PATTERNS[hash(id) % PATTERNS.length], blurb: c.blurb,
      steps: c.steps?.length ? c.steps : ["Your host starts with an easy game", "Settle in with the group", "Swap numbers only if you want to"],
      tags: ["New", ...(c.category === "other" && c.category_other ? [c.category_other] : []), ...(c.tags || [])].slice(0, 3), image: imgSrc(c.image_url) ?? typeImages(c.event_type)[0] ?? null, eventType: c.event_type ?? null,
      hostId: c.host_id ?? undefined, bookingClosesAt: c.booking_closes_at ? new Date(c.booking_closes_at) : undefined,
      audience: c.audience ?? "mixed",
    });
  });
  // A real event added from an example plan (same plan, city and day) replaces that day's example copy: one card, never two.
  const norm = (e: MeetEvent) => `${e.city}|${ymd(e.date)}|${e.title.split(" · ")[0].trim().toLowerCase()}`;
  const realDays = new Set(all.filter((e) => e.key.startsWith("x")).map(norm));
  const seen = new Set<string>();
  const list = all.filter((e) => (e.key.startsWith("x") || !realDays.has(norm(e))) && !seen.has(e.id) && (seen.add(e.id), true));
  list.sort((a, b) => a.date.getTime() - b.date.getTime() || mins(a.time) - mins(b.time));
  return { all: list, upcoming: list.filter((e) => e.day >= 0), past: list.filter((e) => e.day < 0).reverse() };
}

/* ---------- formatting ---------- */
export const fmtDay = (d: Date) => `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
export const relDay = (d: Date, today: Date) => {
  const n = Math.round((d.getTime() - today.getTime()) / 864e5);
  return n === 0 ? "Today" : n === 1 ? "Tomorrow" : n === -1 ? "Yesterday" : fmtDay(d);
};
export const hostNames = (e: MeetEvent) => e.hosts.map((h) => (h === "tba" ? "Host TBA" : h)).join(" & ");
/** True when a real event has no host picked yet. */
export const hostTba = (e: MeetEvent) => e.hosts.length === 1 && e.hosts[0] === "tba";
/** "Hosted by <host from the database>" - or "Host announced soon" when the team hasn't picked one yet. */
export const hostLine = (e: MeetEvent) => (hostTba(e) ? "Host announced soon" : `Hosted by ${hostNames(e)}`);
export const priceShort = (e: MeetEvent) =>
  e.priceType === "free" ? "Free" : e.priceType === "estimate" ? `~₹${e.price.toLocaleString("en-IN")}` : `₹${e.price.toLocaleString("en-IN")}`;
export const priceLabel = (e: MeetEvent) =>
  ({ free: "no charge", reservation: "seat reservation", "per person": "per person", estimate: "estimated total" })[e.priceType];
export const catOf = (id: string) => CATEGORIES.find((c: any) => c.id === id) || (id === "other" ? { id: "other", label: "Something new", icon: "✦" } : CATEGORIES[0]);
export const eventUrl = (e: MeetEvent | string) => `/event/?id=${encodeURIComponent(typeof e === "string" ? e : e.id)}`;
export const palette = (i: number): [string, string] => PALETTES[i % PALETTES.length];
export const cityName = (c: string) => (c === "all" ? "All cities" : CONFIG.cities[c]?.name ?? c);

export function whatsappLink(text: string) {
  return `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;
}

/** Price filter shared by Home and Explore: Free · ₹99 · more than ₹99 */
export type PriceBand = "all" | "free" | "99" | "more";
export const PRICE_BANDS: [PriceBand, string][] = [["all", "Any price"], ["free", "Free"], ["99", "₹99"], ["more", "Above ₹99"]];
export const priceOk = (e: MeetEvent, b: string) =>
  b === "all" || (b === "free" ? e.priceType === "free" || e.price === 0 : b === "99" ? e.priceType !== "free" && e.price > 0 && e.price <= 99 : e.priceType !== "free" && e.price > 99);

/* ---------- plan times (used by Your plans, the door pass and calendar files) ---------- */
export const startsAt = (e: MeetEvent) => { const d = new Date(e.date); const m = mins(e.time); d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d; };
export const endsAt = (e: MeetEvent) => { const s = startsAt(e); const m = mins(e.end); if (!m) return new Date(s.getTime() + 2 * 36e5); const d = new Date(e.date); d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d <= s ? new Date(d.getTime() + 864e5) : d; };
/** When requests stop: the event's own deadline, else 4 hours before the start. */
export const bookingClosesAt = (e: MeetEvent) => e.bookingClosesAt ?? new Date(startsAt(e).getTime() - 4 * 36e5);
/** "open" → can request · "closed" → registration closed, event not started · "ended" → the event has started/finished. */
export const bookingState = (e: MeetEvent, now = Date.now()): "open" | "closed" | "ended" =>
  now >= startsAt(e).getTime() ? "ended" : now >= bookingClosesAt(e).getTime() ? "closed" : "open";
/** The exact spot is shared 2 hours before the start (8 pm the night before for morning plans). */
export const addressDropAt = (e: MeetEvent) => {
  const s = startsAt(e);
  if (s.getHours() < 10) { const d = new Date(s); d.setDate(d.getDate() - 1); d.setHours(20, 0, 0, 0); return d; }
  return new Date(s.getTime() - 2 * 36e5);
};
export const fmtTime = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s+/g, " ").toLowerCase();
export const fmtWhen = (d: Date) => `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}, ${fmtTime(d)}`;

/** Downloads an .ics file so the plan lands in the phone's calendar. */
export function downloadCalendar(e: MeetEvent) {
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[\,;]/g, (m) => "\\" + m).replace(/\n/g, "\n");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${CONFIG.brand}//plans//EN`, "BEGIN:VEVENT",
    `UID:${e.id}@${CONFIG.brand}`, `DTSTAMP:${z(new Date())}`, `DTSTART:${z(startsAt(e))}`, `DTEND:${z(endsAt(e))}`,
    `SUMMARY:${esc(`${e.title} · ${CONFIG.brand}`)}`, `LOCATION:${esc(`${e.area}, ${CONFIG.cities[e.city].name}`)}`,
    `DESCRIPTION:${esc(`Hosted by ${hostNames(e)}. The exact spot is shared on WhatsApp before the plan. Show your door pass at the door.`)}`,
    "BEGIN:VALARM", "TRIGGER:-PT3H", "ACTION:DISPLAY", "DESCRIPTION:Plan today", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `${e.key}.ics`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Home "real moments" strip: event photos (captioned) interleaved with the miscellaneous folder. */
export function momentPhotos(limit = 24): { src: string; caption?: string }[] {
  const ev = EVENT_TYPES.flatMap((t) => typeImages(t).slice(0, 2).map((src) => ({ src, caption: t })));
  const misc = EVENT_TYPES.flatMap((t) => typeImages(t).slice(2)).map((src) => ({ src }));
  const out: { src: string; caption?: string }[] = [];
  for (let i = 0; out.length < limit && (i < ev.length || i < misc.length); i++) {
    if (ev[i]) out.push(ev[i]);
    if (misc[i] && out.length < limit) out.push(misc[i]);
  }
  return out;
}
