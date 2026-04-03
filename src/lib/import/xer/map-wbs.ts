import type { XerRawDocument } from "./types";
import { findTable } from "./parse-xer-raw";
import type { MappedWbs } from "./types";
import { fieldIndex, parseIntSafe, rowGet } from "./xer-table-utils";

export function mapWbs(doc: XerRawDocument, projId: number | null, warnings: string[]): MappedWbs[] {
  const t = findTable(doc, "PROJWBS");
  if (!t || t.fields.length === 0) {
    warnings.push("PROJWBS table missing or empty");
    return [];
  }
  const iWbs = fieldIndex(t, "wbs_id", "WBS_ID");
  const iProj = fieldIndex(t, "proj_id", "PROJ_ID");
  const iParent = fieldIndex(t, "parent_wbs_id", "PARENT_WBS_ID");
  const iName = fieldIndex(t, "wbs_name", "WBS_NAME");
  const iSeq = fieldIndex(t, "seq_num", "SEQ_NUM");
  if (iWbs < 0 || iProj < 0) {
    warnings.push("PROJWBS: required columns missing");
    return [];
  }

  const out: MappedWbs[] = [];
  for (const row of t.rows) {
    const p = parseIntSafe(rowGet(row, iProj));
    if (p == null) continue;
    if (projId != null && p !== projId) continue;
    const wid = parseIntSafe(rowGet(row, iWbs));
    if (wid == null) continue;
    const parentRaw = iParent >= 0 ? rowGet(row, iParent).trim() : "";
    const parent =
      parentRaw === "" || parentRaw === "0" ? null : parseIntSafe(parentRaw);
    out.push({
      wbs_id: wid,
      proj_id: p,
      parent_wbs_id: parent,
      wbs_name: iName >= 0 ? rowGet(row, iName) || `WBS ${wid}` : `WBS ${wid}`,
      seq_num: iSeq >= 0 ? parseIntSafe(rowGet(row, iSeq)) : null,
    });
  }
  return out;
}
