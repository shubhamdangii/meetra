"use client";
// Real numbers and people for public pages (hosts, reviews), cached per page load.
import { useEffect, useState } from "react";
import { getSupabase } from "./supabase";
import type { MeetEvent } from "./events";

/** "30+" until the real number reaches the floor, then the real number. */
export const atLeast = (n: number, floor: number) => (n >= floor ? String(n) : `${floor}+`);

/** Real events only (made in the admin desk), not the sample templates. */
export const isReal = (e: MeetEvent) => e.key.startsWith("x");

export type PublicHost = { id: number; name: string; city_slug: string; bio: string; photo_url: string | null; gallery: string[]; avg_rating: number | null; reviews: number; events: number; upcoming: number };
export type FeaturedReview = { rating: number; comment: string; first_name: string; plan_ref: string; event_title: string | null; created_at: string; this_week: boolean };

const cache = new Map<string, Promise<unknown>>();
function cached<T>(key: string, load: () => PromiseLike<T>): Promise<T> {
  if (!cache.has(key)) cache.set(key, Promise.resolve(load()).catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key) as Promise<T>;
}
const cityArg = (city: string) => (city === "all" ? null : city);

function useCached<T>(key: string, load: () => PromiseLike<T>, fallback: T): { data: T; loaded: boolean } {
  const [state, setState] = useState<{ key: string; data: T } | null>(null);
  useEffect(() => {
    let alive = true;
    cached(key, load).then((d) => { if (alive) setState({ key, data: d }); }, () => { if (alive) setState({ key, data: fallback }); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state?.key === key ? { data: state.data, loaded: true } : { data: fallback, loaded: false };
}

/** Top hosts of a city (best rated first). */
export function usePublicHosts(city: string, limit = 10) {
  return useCached<PublicHost[]>(`hosts:${city}:${limit}`, async () => {
    const sb = getSupabase(); if (!sb) return [];
    const { data, error } = await sb.rpc("public_hosts", { p_city: cityArg(city), p_limit: limit });
    if (error) throw error;
    return (data as PublicHost[]) ?? [];
  }, []);
}

/** Number of active hosts in a city. */
export function useHostCount(city: string) {
  return useCached<number>(`hostcount:${city}`, async () => {
    const sb = getSupabase(); if (!sb) return 0;
    const { data, error } = await sb.rpc("public_host_count", { p_city: cityArg(city) });
    if (error) throw error;
    return Number(data) || 0;
  }, 0);
}

/** This week's best reviews (filled from recent weeks when the week is quiet). */
export function useFeaturedReviews(city: string) {
  return useCached<FeaturedReview[]>(`reviews:${city}`, async () => {
    const sb = getSupabase(); if (!sb) return [];
    const { data, error } = await sb.rpc("featured_reviews", { p_city: cityArg(city), p_limit: 8 });
    if (error) throw error;
    return (data as FeaturedReview[]) ?? [];
  }, []);
}
