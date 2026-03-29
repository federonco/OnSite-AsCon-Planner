import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

/** Decode `role` from Supabase JWT (Node route handlers only). */
function jwtRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length < 2) return null;
  let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

/**
 * RLS errors on inserts while using this helper almost always mean the env var is not the service_role secret
 * (e.g. anon key pasted into SUPABASE_SERVICE_ROLE_KEY).
 */
function assertServiceRoleKey(key: string): void {
  const role = jwtRole(key);
  if (role !== "service_role") {
    const hint =
      role === "anon"
        ? " You set the anon key in SUPABASE_SERVICE_ROLE_KEY; use Project Settings → API → service_role secret."
        : role
          ? ` JWT role is "${role}", expected "service_role".`
          : " Key is not a valid Supabase JWT.";
    throw new Error(`SUPABASE_SERVICE_ROLE_KEY must be the service_role secret.${hint}`);
  }
}

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
    assertServiceRoleKey(key);
    _admin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _admin;
}
