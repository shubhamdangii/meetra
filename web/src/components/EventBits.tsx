"use client";
// Small shared event pieces: who's coming (photos only), the exact location for confirmed guests,
// and the event type + photo picker (with upload) used by the host and admin event forms.
import { useRef, useState } from "react";
import { useApp } from "./AppProvider";
import { useAuth } from "./AuthProvider";
import { EVENT_TYPES, imgSrc, typeImagePath, typeImages } from "@/lib/events";
import manifest from "@/lib/image-manifest.json";
import { MAX_PHOTO_MB, mapsEmbed, uploadEventImage, useAttendees, useEventLocation, useTypeUploads, type Attendees } from "@/lib/eventMedia";

/* ---------- who's coming ---------- */
export function Faces({ a, max = 8, size = 34 }: { a: Attendees; max?: number; size?: number }) {
  const shown = a.photos.slice(0, max);
  const more = Math.max(0, a.count - shown.length);
  return (
    <div className="faces-row" style={{ ["--fs" as string]: `${size}px` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {shown.map((p, i) => <img key={p + i} src={p} alt="" loading="lazy" referrerPolicy="no-referrer" />)}
      {more > 0 && <span className="more">+{more}</span>}
    </div>
  );
}

/** "12 going" + their profile photos. No names, no other details. */
export function WhoComing({ planRef, seats, compact = false }: { planRef: string; seats?: number; compact?: boolean }) {
  const { attendees } = useAttendees(planRef);
  if (!attendees) return compact ? null : <div className="skeleton" style={{ minHeight: 44 }} />;
  if (compact) return attendees.count > 0 ? <div className="who-compact"><Faces a={attendees} max={5} size={26} /><small><b>{attendees.count}</b> going</small></div> : null;
  return (
    <div className="who-coming">
      {attendees.count > 0 ? <>
        <Faces a={attendees} max={10} />
        <p><b>{attendees.count} {attendees.count === 1 ? "person is" : "people are"} going</b>{seats ? <small> · {Math.max(0, seats - attendees.count)} seats left</small> : null}</p>
      </> : <p className="muted">Nobody confirmed yet. Be one of the first!</p>}
      <small className="muted">Only profile photos are shown, never names.</small>
    </div>
  );
}

/* ---------- exact location (server decides who sees it) ---------- */
export function ExactLocation({ planRef, compact = false }: { planRef: string; compact?: boolean }) {
  const auth = useAuth();
  const loc = useEventLocation(auth.client, planRef, !!auth.session);
  if (!loc || !loc.allowed || !loc.maps_url) return null;
  const embed = mapsEmbed(loc.maps_url);
  return (
    <div className="exact-loc">
      <b>📍 Exact location</b>
      {embed && !compact && <iframe title="Exact location map" src={embed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />}
      <a className="btn btn-ink btn-sm btn-block" href={loc.maps_url} target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>
    </div>
  );
}

/* ---------- event type + photo picker ---------- */
const FOLDERS = (manifest as unknown as { events: Record<string, string[]> }).events;

export function EventTypePicker({ type, image, onChange }: { type: string; image: string; onChange: (v: { event_type: string; image_url: string }) => void }) {
  const auth = useAuth(); const { toast } = useApp();
  const uploads = useTypeUploads();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folder = type && FOLDERS[type] ? FOLDERS[type].map((f) => typeImagePath(type, f)) : [];
  const options = [...(uploads[type] ?? []), ...folder];
  const known = !type || EVENT_TYPES.includes(type);
  // "Other": the admin/host writes their own event type (photos uploaded for it are saved under that name)
  const [otherOpen, setOtherOpen] = useState(false);
  const other = otherOpen || !known;

  async function add(files: FileList | null) {
    if (!files?.length || !auth.client || !type) return;
    setBusy(true);
    let last = "", added = 0;
    for (const f of Array.from(files).slice(0, 6)) {
      try { last = await uploadEventImage(auth.client, type, f); added++; } catch (e) { toast("⚠️ " + (e as Error).message); }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (added) { onChange({ event_type: type, image_url: last }); toast(`${added} photo${added > 1 ? "s" : ""} added to ${type} ✓`); }
  }

  return (
    <div className="field span2 type-pick">
      <label htmlFor="ev-type">Event type</label>
      <select id="ev-type" value={other ? "__other" : type || "__none"} onChange={(e) => {
        if (e.target.value === "__other") { setOtherOpen(true); onChange({ event_type: "", image_url: "" }); return; }
        setOtherOpen(false);
        const t = e.target.value === "__none" ? "" : e.target.value;
        onChange({ event_type: t, image_url: typeImages(t)[0] ? typeImagePath(t, FOLDERS[t][0]) : "" });
      }}>
        <option value="__none">Choose an event type…</option>
        {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}{FOLDERS[t]?.length ? ` (${FOLDERS[t].length} photo${FOLDERS[t].length > 1 ? "s" : ""})` : ""}</option>)}
        <option value="__other">✦ Other (write your own)</option>
      </select>
      {other && <input aria-label="Your event type" value={type} maxLength={60} placeholder="e.g. Chess Café, Poetry Picnic" autoFocus={otherOpen && !type}
        onChange={(e) => onChange({ event_type: e.target.value, image_url: image && !image.startsWith("/images/") ? image : "" })} />}
      {type && <>
        <small className="muted">Tap a photo to use it on the event card. {options.length ? "" : "No photos for this type yet, add one below."}</small>
        {options.length > 0 && (
          <div className="img-grid" role="radiogroup" aria-label="Event photo">
            {options.map((src) => (
              <button key={src} type="button" role="radio" aria-checked={image === src} className={image === src ? "on" : ""} onClick={() => onChange({ event_type: type, image_url: src })}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgSrc(src)!} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
        <div className="img-add">
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
          <button type="button" className="btn btn-white btn-sm" disabled={busy || !auth.client} onClick={() => fileRef.current?.click()}>{busy ? "Uploading…" : "＋ Upload photos"}</button>
          <small className="muted">JPG, PNG or WebP (up to {MAX_PHOTO_MB} MB). Resized automatically to a light, sharp photo. Saved to “{type}” for everyone.</small>
        </div>
      </>}
    </div>
  );
}
