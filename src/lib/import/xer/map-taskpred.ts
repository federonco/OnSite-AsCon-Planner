import type { DependencyType } from "@/lib/planner-types";
import type { XerRawDocument } from "./types";
import { findTable } from "./parse-xer-raw";
import type { MappedTaskPred } from "./types";
import { fieldIndex, parseIntSafe, parseFloatSafe, rowGet } from "./xer-table-utils";

export function mapTaskPreds(doc: XerRawDocument, projId: number | null, warnings: string[]): MappedTaskPred[] {
  const t = findTable(doc, "TASKPRED");
  if (!t || t.fields.length === 0) {
    warnings.push("TASKPRED table missing — no dependencies imported");
    return [];
  }

  const iPred = fieldIndex(t, "task_pred_id", "TASK_PRED_ID");
  const iProj = fieldIndex(t, "proj_id", "PROJ_ID");
  const iTask = fieldIndex(t, "task_id", "TASK_ID");
  const iPredTask = fieldIndex(t, "pred_task_id", "PRED_TASK_ID");
  const iType = fieldIndex(t, "pred_type", "PRED_TYPE");
  const iLag = fieldIndex(t, "lag_hr_cnt", "LAG_HR_CNT");

  if (iTask < 0 || iPredTask < 0) {
    warnings.push("TASKPRED: task_id / pred_task_id missing");
    return [];
  }

  const out: MappedTaskPred[] = [];
  for (const row of t.rows) {
    if (iProj >= 0) {
      const p = parseIntSafe(rowGet(row, iProj));
      if (p != null && projId != null && p !== projId) continue;
    }
    const taskId = parseIntSafe(rowGet(row, iTask));
    const predTaskId = parseIntSafe(rowGet(row, iPredTask));
    if (taskId == null || predTaskId == null) continue;

    const predId = iPred >= 0 ? parseIntSafe(rowGet(row, iPred)) ?? out.length : out.length;
    const predType = iType >= 0 ? rowGet(row, iType).trim() : "PR_FS";
    const lagHr = iLag >= 0 ? parseFloatSafe(rowGet(row, iLag)) : null;
    const rowProj = iProj >= 0 ? parseIntSafe(rowGet(row, iProj)) : null;

    out.push({
      task_pred_id: predId,
      proj_id: rowProj ?? projId ?? 0,
      task_id: taskId,
      pred_task_id: predTaskId,
      pred_type: predType,
      lag_hr_cnt: lagHr,
    });
  }
  return out;
}

export function predTypeToDependency(pred: string): DependencyType {
  const u = pred.toUpperCase();
  if (u.includes("SS")) return "SS";
  if (u.includes("FF")) return "FF";
  if (u.includes("SF")) return "SF";
  return "FS";
}

/** Convert lag hours to whole days (8h/day). */
export function lagHoursToDays(lagHr: number | null): number {
  if (lagHr == null || !Number.isFinite(lagHr)) return 0;
  return Math.round(lagHr / 8);
}
