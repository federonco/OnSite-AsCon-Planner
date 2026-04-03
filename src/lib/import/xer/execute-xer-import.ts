import type { getSupabaseAdmin } from "@/lib/supabase-admin";
import { appendImportMetaToNotes } from "./xer-meta-fallback";

/** Same fallback pattern as XML import: notes block if import_meta column missing. */
export async function insertPlannerRowsWithImportMeta(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  rows: Array<Record<string, unknown>>
): Promise<{ data: { id: string }[] | null; error: { message: string; code?: string } | null; usedNotesFallback: boolean }> {
  const first = await supabase.from("planner_activities").insert(rows).select("id");
  if (!first.error) {
    return { data: first.data as { id: string }[], error: null, usedNotesFallback: false };
  }
  const err = first.error;
  const msg = String(err.message).toLowerCase();
  const maybeMissing =
    msg.includes("import_meta") || msg.includes("could not find") || err.code === "PGRST204";
  if (!maybeMissing) {
    return { data: null, error: err, usedNotesFallback: false };
  }
  const stripped = rows.map((r) => {
    const { import_meta, notes, ...rest } = r as {
      import_meta?: unknown;
      notes?: unknown;
      [k: string]: unknown;
    };
    const meta = import_meta as Record<string, unknown>;
    return {
      ...rest,
      notes: appendImportMetaToNotes(notes != null ? String(notes) : null, meta as Record<string, unknown>),
    };
  });
  const second = await supabase.from("planner_activities").insert(stripped).select("id");
  if (second.error) {
    return { data: null, error: second.error, usedNotesFallback: true };
  }
  return { data: second.data as { id: string }[], error: null, usedNotesFallback: true };
}
