import type { DependencyType } from "@/lib/planner-types";

export type ParseWarningCode =
  | "missing_wbs"
  | "missing_parent"
  | "invalid_date"
  | "duplicate_wbs"
  | "malformed_xml"
  | "skipped_root"
  | "xer_note";

export interface ParseWarning {
  code: ParseWarningCode;
  message: string;
  uid?: number;
  wbs?: string;
}

/** Normalized row from MS Project XML before hierarchy. */
export interface MsProjectFlatTask {
  uid: number;
  id?: string;
  name: string;
  wbs: string;
  outlineNumber?: string;
  outlineLevel: number;
  start: string | null;
  finish: string | null;
  summary: boolean;
  milestone: boolean;
  active: boolean;
  percentComplete: number;
  durationDays: number;
  predecessors: Array<{
    predecessor_uid: number;
    type: DependencyType;
    lag_days: number;
  }>;
}

export interface ImportedTaskNode {
  id: string;
  uid?: number;
  wbs: string;
  name: string;
  start: string | null;
  finish: string | null;
  summary: boolean;
  milestone: boolean;
  active: boolean;
  synthetic?: boolean;
  /** True when this node groups multiple real tasks sharing the same WBS. */
  duplicateGroup?: boolean;
  children: ImportedTaskNode[];
  parentWbs: string | null;
  /** Stable parent link for breadcrumbs and hierarchy (not WBS-only). */
  parentId: string | null;
  depth: number;
  percentComplete?: number;
}

export interface ImportMetaPayload {
  source: "xml_import";
  source_uid: number;
  source_wbs: string;
  source_file_name: string;
}
