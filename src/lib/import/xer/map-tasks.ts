import type { XerRawDocument } from "./types";
import { findTable } from "./parse-xer-raw";
import type { MappedTask } from "./types";
import { fieldIndex, parseFloatSafe, parseIntSafe, rowGet } from "./xer-table-utils";
import { parseP6DateToIso } from "./p6-date";

const IMPORTABLE_TYPES = new Set(["TT_Task", "TT_LOE", "TT_Mile"]);

export function mapTasks(doc: XerRawDocument, projId: number | null, warnings: string[]): MappedTask[] {
  const t = findTable(doc, "TASK");
  if (!t || t.fields.length === 0) {
    warnings.push("TASK table missing or empty");
    return [];
  }

  const iTask = fieldIndex(t, "task_id", "TASK_ID");
  const iProj = fieldIndex(t, "proj_id", "PROJ_ID");
  const iWbs = fieldIndex(t, "wbs_id", "WBS_ID");
  const iName = fieldIndex(t, "task_name", "TASK_NAME");
  const iType = fieldIndex(t, "task_type", "TASK_TYPE");
  const iTs = fieldIndex(t, "target_start_date", "TARGET_START_DATE");
  const iTe = fieldIndex(t, "target_end_date", "TARGET_END_DATE");
  const iAs = fieldIndex(t, "act_start_date", "ACT_START_DATE");
  const iAe = fieldIndex(t, "act_end_date", "ACT_END_DATE");
  const iEs = fieldIndex(t, "early_start_date", "EARLY_START_DATE");
  const iEe = fieldIndex(t, "early_end_date", "EARLY_END_DATE");
  const iLs = fieldIndex(t, "late_start_date", "LATE_START_DATE");
  const iLe = fieldIndex(t, "late_end_date", "LATE_END_DATE");
  const iStat = fieldIndex(t, "status_code", "STATUS_CODE");
  const iCal = fieldIndex(t, "clndr_id", "CLNDR_ID");
  const iPct = fieldIndex(t, "phys_complete_pct", "PHYS_COMPLETE_PCT");

  if (iTask < 0 || iProj < 0 || iWbs < 0) {
    warnings.push("TASK: required columns missing (task_id, proj_id, wbs_id)");
    return [];
  }

  const out: MappedTask[] = [];
  for (const row of t.rows) {
    const p = parseIntSafe(rowGet(row, iProj));
    if (p == null) continue;
    if (projId != null && p !== projId) continue;

    const taskType = iType >= 0 ? rowGet(row, iType).trim() : "TT_Task";
    if (!IMPORTABLE_TYPES.has(taskType)) continue;

    const tid = parseIntSafe(rowGet(row, iTask));
    const wid = parseIntSafe(rowGet(row, iWbs));
    if (tid == null || wid == null) continue;

    const target_start = iTs >= 0 ? parseP6DateToIso(rowGet(row, iTs), warnings, tid) : null;
    const target_end = iTe >= 0 ? parseP6DateToIso(rowGet(row, iTe), warnings, tid) : null;
    const act_start = iAs >= 0 ? parseP6DateToIso(rowGet(row, iAs), warnings, tid) : null;
    const act_end = iAe >= 0 ? parseP6DateToIso(rowGet(row, iAe), warnings, tid) : null;
    const early_start = iEs >= 0 ? parseP6DateToIso(rowGet(row, iEs), warnings, tid) : null;
    const early_end = iEe >= 0 ? parseP6DateToIso(rowGet(row, iEe), warnings, tid) : null;
    const late_start = iLs >= 0 ? parseP6DateToIso(rowGet(row, iLs), warnings, tid) : null;
    const late_end = iLe >= 0 ? parseP6DateToIso(rowGet(row, iLe), warnings, tid) : null;

    const cal = iCal >= 0 ? parseIntSafe(rowGet(row, iCal)) : null;
    const pct = iPct >= 0 ? parseFloatSafe(rowGet(row, iPct)) : null;

    out.push({
      task_id: tid,
      proj_id: p,
      wbs_id: wid,
      task_name: iName >= 0 ? rowGet(row, iName) || `Task ${tid}` : `Task ${tid}`,
      task_type: taskType,
      target_start,
      target_end,
      act_start,
      act_end,
      early_start,
      early_end,
      late_start,
      late_end,
      status_code: iStat >= 0 ? rowGet(row, iStat) || null : null,
      calendar_id: cal,
      phys_complete_pct: pct,
    });
  }
  return out;
}
