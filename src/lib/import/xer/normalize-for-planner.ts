import type {
  MappedTask,
  MappedTaskPred,
  NormalizedPlannerActivityRow,
  PredForInsert,
  XerNormalizeWarning,
} from "./types";
import { pickTaskDates } from "./p6-date";
import { lagHoursToDays, predTypeToDependency } from "./map-taskpred";
import type { DependencyType } from "@/lib/planner-types";

const FALLBACK = new Date().toISOString().slice(0, 10);

export function normalizeTaskForPlanner(
  t: MappedTask,
  wbsPath: string,
  fileName: string
): { row: NormalizedPlannerActivityRow; warnings: XerNormalizeWarning[] } {
  const warnings: XerNormalizeWarning[] = [];
  const { start, end } = pickTaskDates(t, FALLBACK);
  let start_date = start;
  let end_date = end;
  if (!start_date || !end_date) {
    warnings.push({
      code: "missing_dates",
      message: `Task ${t.task_id}: missing dates — using ${FALLBACK}`,
      task_id: t.task_id,
    });
    start_date = FALLBACK;
    end_date = FALLBACK;
  }

  const import_meta: Record<string, unknown> = {
    source: "xer_import",
    source_project_id: t.proj_id,
    source_task_id: t.task_id,
    source_wbs_id: t.wbs_id,
    source_wbs_path: wbsPath,
    source_file_name: fileName,
    source_task_type: t.task_type,
    source_calendar_id: t.calendar_id,
  };

  const pct =
    t.phys_complete_pct != null && Number.isFinite(t.phys_complete_pct)
      ? Math.min(100, Math.max(0, Math.round(t.phys_complete_pct)))
      : 0;

  return {
    row: {
      task_id: t.task_id,
      proj_id: t.proj_id,
      name: t.task_name,
      start_date,
      end_date,
      wbs_id: t.wbs_id,
      wbs_path: wbsPath,
      calendar_id: t.calendar_id,
      progress_percent: pct,
      import_meta,
    },
    warnings,
  };
}

export function buildPredicatesForImport(
  preds: MappedTaskPred[],
  importedTaskIds: Set<number>
): { preds: PredForInsert[]; skipped: number } {
  const out: PredForInsert[] = [];
  let skipped = 0;
  for (const p of preds) {
    if (!importedTaskIds.has(p.task_id) || !importedTaskIds.has(p.pred_task_id)) {
      skipped += 1;
      continue;
    }
    const type: DependencyType = predTypeToDependency(p.pred_type);
    const lag_days = lagHoursToDays(p.lag_hr_cnt);
    out.push({
      predecessor_task_id: p.pred_task_id,
      successor_task_id: p.task_id,
      type,
      lag_days,
    });
  }
  return { preds: out, skipped };
}
