import type { XerRawDocument } from "./types";
import { findTable } from "./parse-xer-raw";
import type { MappedProject } from "./types";
import { fieldIndex, parseIntSafe, rowGet } from "./xer-table-utils";

export function mapProjects(doc: XerRawDocument, warnings: string[]): MappedProject[] {
  const t = findTable(doc, "PROJECT");
  if (!t || t.fields.length === 0) {
    warnings.push("PROJECT table missing or empty");
    return [];
  }
  const iProj = fieldIndex(t, "proj_id", "PROJ_ID");
  const iShort = fieldIndex(t, "proj_short_name", "PROJ_SHORT_NAME");
  const iName = fieldIndex(t, "proj_name", "PROJ_NAME");
  if (iProj < 0) {
    warnings.push("PROJECT: proj_id column not found");
    return [];
  }

  const out: MappedProject[] = [];
  for (const row of t.rows) {
    const pid = parseIntSafe(rowGet(row, iProj));
    if (pid == null) continue;
    out.push({
      proj_id: pid,
      proj_short_name: iShort >= 0 ? rowGet(row, iShort) || null : null,
      proj_name: iName >= 0 ? rowGet(row, iName) || null : null,
    });
  }
  return out;
}
