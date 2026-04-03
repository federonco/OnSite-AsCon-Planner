import type { MsProjectFlatTask } from "@/lib/import/xml/types";
import type { MappedTask, MappedTaskPred } from "./types";
import { predTypeToDependency, lagHoursToDays } from "./map-taskpred";

export type MappedTaskWithPath = MappedTask & { wbs_path: string };

export function xerTasksToFlatTasks(tasks: MappedTaskWithPath[], preds: MappedTaskPred[]): MsProjectFlatTask[] {
  const bySucc = new Map<number, MappedTaskPred[]>();
  for (const p of preds) {
    const arr = bySucc.get(p.task_id) ?? [];
    arr.push(p);
    bySucc.set(p.task_id, arr);
  }

  return tasks.map((t) => {
    const pl = bySucc.get(t.task_id) ?? [];
    return {
      uid: t.task_id,
      name: t.task_name,
      wbs: t.wbs_path || "—",
      outlineLevel: 1,
      start: t.act_start || t.target_start || t.early_start,
      finish: t.act_end || t.target_end || t.early_end,
      summary: false,
      milestone: t.task_type === "TT_Mile",
      active: true,
      percentComplete: t.phys_complete_pct ?? 0,
      durationDays: 1,
      predecessors: pl.map((p) => ({
        predecessor_uid: p.pred_task_id,
        type: predTypeToDependency(p.pred_type),
        lag_days: lagHoursToDays(p.lag_hr_cnt),
      })),
    };
  });
}
