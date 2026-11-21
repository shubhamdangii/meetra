// Builds every dated meetup from the templates in data.ts, plus small helpers.
// Dates are relative to "today", so this runs in the browser (never at build time).
import { CONFIG } from "./config";
import { CATEGORIES, HOSTS, PALETTES, TEMPLATES } from "./data";

export type MeetEvent = {
  id: string; key: string; city: string; date: Date; day: number; title: string;
  cat: string; time: string; end: string; area: string; hosts: string[];
  price: number; priceType: "free" | "reservation" | "per person" | "estimate";
  seats: number; left: number; emoji: string; pal: number; pattern: string;
  blurb: string; steps: string[]; tags: string[]; image: string | null;
};

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
export const mins = (t: string) => { const m = /(\d+)(?::(\d+))?\s*(am|pm)/i.exec(t || ""); if (!m) return 0; let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12; return h * 60 + (+m[2] || 0); };
export const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return Math.abs(h); };

const PAST_DAYS = 35, AHEAD_DAYS = 28;

export function buildEvents(today: Date) {
  const diff = (d: Date) => Math.round((d.getTime() - today.getTime()) / 864e5);
  const all: MeetEvent[] = [];
  Object.entries(CONFIG.cities).filter(([, c]) => c.live).forEach(([city]) => {
    TEMPLATES.forEach((t: any) => {
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
          hosts: ov.hosts || ["team"], price: ov.price ?? t.price, priceType: t.priceType,
          seats, left: Math.max(0, seats - taken), emoji: ov.emoji || t.emoji,
          pal: ov.pal ?? t.pal, pattern: t.pattern, blurb: ov.blurb || t.blurb,
          steps: t.steps, tags: t.tags || [], image: ov.image || t.image || null,
        });
      });
    });
  });
  all.sort((a, b) => a.date.getTime() - b.date.getTime() || mins(a.time) - mins(b.time));
  return { all, upcoming: all.filter((e) => e.day >= 0), past: all.filter((e) => e.day < 0).reverse() };
}

/* ---------- formatting ---------- */
export const fmtDay = (d: Date) => `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
export const relDay = (d: Date, today: Date) => {
  const n = Math.round((d.getTime() - today.getTime()) / 864e5);
  return n === 0 ? "Today" : n === 1 ? "Tomorrow" : n === -1 ? "Yesterday" : fmtDay(d);
};
export const hostNames = (e: MeetEvent) => e.hosts.map((h) => HOSTS[h]?.name || h).join(" & ");
export const priceShort = (e: MeetEvent) =>
  e.priceType === "free" ? "Free" : e.priceType === "estimate" ? `~₹${e.price.toLocaleString("en-IN")}` : `₹${e.price.toLocaleString("en-IN")}`;
export const priceLabel = (e: MeetEvent) =>
  ({ free: "no charge", reservation: "seat reservation", "per person": "per person", estimate: "estimated total" })[e.priceType];
export const catOf = (id: string) => CATEGORIES.find((c: any) => c.id === id) || CATEGORIES[0];
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
