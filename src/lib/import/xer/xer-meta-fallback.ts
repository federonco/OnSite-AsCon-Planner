/** Append JSON provenance block when import_meta column is unavailable (same pattern as XML). */
export function appendImportMetaToNotes(
  existingNotes: string | null | undefined,
  meta: Record<string, unknown>
): string {
  const trimmed = existingNotes != null ? String(existingNotes).trim() : "";
  const block = `\n\n[xer_import_meta]${JSON.stringify(meta)}`;
  return trimmed === "" ? block.trimStart() : `${trimmed}${block}`;
}
