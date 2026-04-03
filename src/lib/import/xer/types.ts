import type { DependencyType } from "@/lib/planner-types";

/** Raw table from an XER file (%T / %F / %R). */
export interface XerRawTable {
  name: string;
  fields: string[];
  rows: string[][];
}

export interface XerRawDocument {
  tables: Map<string, XerRawTable>;
  warnings: string[];
}

export interface MappedProject {
  proj_id: number;
  proj_short_name: string | null;
  proj_name: string | null;
}

export interface MappedWbs {
  wbs_id: number;
  proj_id: number;
  parent_wbs_id: number | null;
  wbs_name: string;
  seq_num: number | null;
}

export interface MappedTask {
  task_id: number;
  proj_id: number;
  wbs_id: number;
  task_name: string;
  task_type: string;
  /** Target / early dates — normalized YYYY-MM-DD when parseable */
  target_start: string | null;
  target_end: string | null;
  act_start: string | null;
  act_end: string | null;
  early_start: string | null;
  early_end: string | null;
  late_start: string | null;
  late_end: string | null;
  status_code: string | null;
  calendar_id: number | null;
  phys_complete_pct: number | null;
}

export interface MappedTaskPred {
  task_pred_id: number;
  proj_id: number;
  task_id: number;
  pred_task_id: number;
  pred_type: string;
  lag_hr_cnt: number | null;
}

export interface MappedCalendar {
  clndr_id: number;
  clndr_name: string | null;
  day_hr_cnt: number | null;
  week_hr_cnt: number | null;
  /** V1: raw month hr cnt string if present */
  month_hr_cnt: string | null;
}

export interface XerPipelineDiagnostics {
  projectCount: number;
  wbsCount: number;
  taskCount: number;
  predCount: number;
  calendarCount: number;
  selectedActivityCount?: number;
}

/** Serializable tree for API → client (WBS parents, activities as leaves). */
export interface XerTreeNodeJson {
  id: string;
  kind: "wbs" | "task";
  name: string;
  wbsPath: string;
  /** WBS or task id from Primavera */
  nativeId: number;
  projId: number;
  children: XerTreeNodeJson[];
  /** task-only */
  taskType?: string;
  startDate?: string | null;
  endDate?: string | null;
  calendarId?: number | null;
}

export interface NormalizedPlannerActivityRow {
  task_id: number;
  proj_id: number;
  name: string;
  start_date: string;
  end_date: string;
  wbs_id: number;
  wbs_path: string;
  calendar_id: number | null;
  progress_percent: number;
  import_meta: Record<string, unknown>;
}

export interface XerNormalizeWarning {
  code: string;
  message: string;
  task_id?: number;
}

export interface PredForInsert {
  predecessor_task_id: number;
  successor_task_id: number;
  type: DependencyType;
  lag_days: number;
}
