"use client";
// Event photos uploaded from the UI, the exact Google Maps location, and "who's coming".
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

/* ---------- uploaded photos per event type ---------- */
type Uploads = Record<string, string[]>;
let uploadsCache: Promise<Uploads> | null = null;
const listeners = new Set<(u: Uploads) => void>();

function loadUploads(force = false): Promise<Uploads> {
  if (!uploadsCache || force) {
    uploadsCache = (async () => {
      const sb = getSupabase(); if (!sb) return {};
      const { data, error } = await sb.from("event_type_images").select("event_type,url").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      const out: Uploads = {};
      for (const r of (data ?? []) as { event_type: string; url: string }[]) (out[r.event_type] ??= []).push(r.url);
      return out;
    })().catch((e) => { uploadsCache = null; throw e; });
  }
  return uploadsCache;
}

/** Photos added from the UI, by event type. Updates everywhere right after a new upload. */
export function useTypeUploads(): Uploads {
  const [u, setU] = useState<Uploads>({});
  useEffect(() => {
    let alive = true;
    loadUploads().then((x) => { if (alive) setU(x); }, () => {});
    const fn = (x: Uploads) => { if (alive) setU(x); };
    listeners.add(fn);
    return () => { alive = false; listeners.delete(fn); };
  }, []);
  return u;
}

export const MAX_PHOTO_MB = 5;
const OK_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Checks, uploads and registers one photo for an event type. Returns its public URL. */
export async function uploadEventImage(client: SupabaseClient, eventType: string, file: File): Promise<string> {
  if (!eventType) throw new Error("Pick the event type first");
  const ext = OK_TYPES[file.type];
  if (!ext) throw new Error(`"${file.name}" isn't a JPG, PNG or WebP photo`);
  if (file.size > MAX_PHOTO_MB * 1024 * 1024) throw new Error(`"${file.name}" is over ${MAX_PHOTO_MB} MB. Use a smaller photo.`);
  const slug = eventType.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";
  const path = `${slug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = await client.storage.from("event-media").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (up.error) throw new Error(up.error.message);
  const url = client.storage.from("event-media").getPublicUrl(path).data.publicUrl;
  const { error } = await client.rpc("add_event_image", { p_type: eventType, p_url: url });
  if (error) throw new Error(error.message);
  const fresh = await loadUploads(true).catch(() => null);
  if (fresh) listeners.forEach((fn) => fn(fresh));
  return url;
}

/* ---------- exact location ---------- */
export const MAPS_HINT = "A Google Maps link: google.com/maps…, maps.app.goo.gl/… or goo.gl/maps/…";
/** Same rule as the database. */
export const isMapsUrl = (u: string) =>
  /^https:\/\/((www\.)?google\.[a-z.]{2,8}\/maps|maps\.google\.[a-z.]{2,8}\/|maps\.app\.goo\.gl\/|goo\.gl\/maps\/)[^\s<>"]*$/i.test(u.trim());

/** An embeddable map for links that carry coordinates or a search (short links can only be opened). */
export function mapsEmbed(u: string): string | null {
  try {
    const url = new URL(u);
    const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url.pathname);
    if (at) return `https://maps.google.com/maps?q=${at[1]},${at[2]}&z=16&output=embed`;
    const q = url.searchParams.get("q") || url.searchParams.get("query");
    if (q) return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed`;
    const place = /\/maps\/place\/([^/]+)/.exec(url.pathname);
    if (place) return `https://maps.google.com/maps?q=${encodeURIComponent(decodeURIComponent(place[1]).replace(/\+/g, " "))}&z=16&output=embed`;
  } catch { /* not a URL */ }
  return null;
}

export type EventLocation = { maps_url: string | null; allowed: boolean } | null;
/** The exact spot, only returned by the server for confirmed (and paid) guests, the host and the team. */
export function useEventLocation(client: SupabaseClient | null | undefined, planRef: string | null, enabled = true) {
  const [loc, setLoc] = useState<EventLocation | undefined>(undefined);
  useEffect(() => {
    if (!client || !planRef || !enabled) { setLoc(null); return; }
    let alive = true;
    client.rpc("my_event_location", { p_plan_ref: planRef }).then(({ data, error }) => { if (alive) setLoc(error ? null : (data as EventLocation)); });
    return () => { alive = false; };
  }, [client, planRef, enabled]);
  return loc;
}

/* ---------- who's coming ---------- */
export type Attendees = { count: number; photos: string[] };
export function useAttendees(planRef: string | null) {
  const [a, setA] = useState<Attendees | null>(null);
  const load = useCallback(() => {
    const sb = getSupabase(); if (!sb || !planRef) { setA(null); return; }
    sb.rpc("plan_attendees", { p_plan_ref: planRef }).then(({ data, error }) => setA(error ? null : (data as Attendees)));
  }, [planRef]);
  useEffect(() => { load(); }, [load]);
  return { attendees: a, reload: load };
}
