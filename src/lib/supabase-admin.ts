import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

/**
 * Server-only Supabase client with the service role key (bypasses RLS).
 * Use only in Route Handlers / Server Actions for trusted backend operations.
 * Requires SUPABASE_SERVICE_ROLE_KEY in the environment.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Planner API needs SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) for inserts/updates under RLS."
      );
    }
    _admin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _admin;
}
