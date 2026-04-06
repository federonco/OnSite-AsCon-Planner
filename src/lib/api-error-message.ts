/**
 * Short, safe strings for UI alerts. Supabase misconfiguration often returns full HTML pages
 * in error bodies — never render that raw (layout collapse + XSS-ish noise).
 */
export function sanitizeApiErrorMessage(raw: string | null | undefined): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (s.length === 0) return "";

  if (/<!DOCTYPE\b|<\s*html[\s>]/i.test(s)) {
    return (
      "Invalid Supabase URL or response was HTML (not JSON). Use Project URL from Supabase " +
      "Settings → API: https://YOUR_PROJECT_REF.supabase.co — not the dashboard link (app.supabase.com/…). " +
      "Put vars in .env.local (Next.js does not load .env.local.json)."
    );
  }

  const max = 320;
  if (s.length > max) return `${s.slice(0, max)}…`;
  return s;
}
