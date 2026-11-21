// Browser-only Supabase client. Uses ONLY the public anon key; every rule that
// protects member data lives in the database (row level security).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CONFIG } from "./config";

export const loginEnabled = !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);

let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  if (!loginEnabled || typeof window === "undefined") return null;
  if (!client) {
    client = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    });
  }
  return client;
}
