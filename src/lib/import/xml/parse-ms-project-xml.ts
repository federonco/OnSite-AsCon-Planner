import { XMLParser } from "fast-xml-parser";
import type { DependencyType } from "@/lib/planner-types";
import { toDateOnly } from "@/lib/planner-date";
import type { MsProjectFlatTask, ParseWarning } from "./types";

const PREDECESSOR_TYPE_MAP: Record<number, DependencyType> = {
  0: "FF",
  1: "FS",
  2: "SF",
  3: "SS",
};

function parseDurationToDays(duration: string): number {
  if (!duration) return 1;
  const match = duration.match(/PT(\d+)H(\d+)M(\d+)S/);
  if (!match) return 1;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return Math.max(1, Math.round((hours + minutes / 60) / 8));
}

function extractDate(datetime: unknown): string | null {
  if (datetime == null) return null;
  const s = String(datetime).trim();
  if (!s) return null;
  return toDateOnly(s).slice(0, 10);
}

function asBool(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Parse MS Project XML into a flat task list + warnings.
 * Ignores empty-name rows and UID 0 (project root) unless it has a useful name (usually skipped).
 */
export function parseMsProjectXmlDocument(xmlContent: string): {
  flat: MsProjectFlatTask[];
  warnings: ParseWarning[];
} {
  const warnings: ParseWarning[] = [];
  const flat: MsProjectFlatTask[] = [];

  let parsed: unknown;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      isArray: (tagName) => tagName === "Task" || tagName === "PredecessorLink",
    });
    parsed = parser.parse(xmlContent);
  } catch (e) {
    warnings.push({
      code: "malformed_xml",
      message: e instanceof Error ? e.message : "Invalid XML",
    });
    return { flat, warnings };
  }

  const project = (parsed as Record<string, unknown>).Project ?? (parsed as Record<string, unknown>).project ?? parsed;
  const tasksContainer = (project as Record<string, unknown>).Tasks ?? (project as Record<string, unknown>).tasks ?? {};
  const taskField = (tasksContainer as Record<string, unknown>).Task ?? (tasksContainer as Record<string, unknown>).task;
  const rawTasks: Record<string, unknown>[] = Array.isArray(taskField)
    ? (taskField as Record<string, unknown>[])
    : taskField && typeof taskField === "object"
      ? [taskField as Record<string, unknown>]
      : [];

  if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
    return { flat, warnings };
  }

  const seenWbs = new Map<string, number>();

  for (const task of rawTasks) {
    const uid = asNumber(task.UID ?? task.uid, 0);
    const name = String(task.Name ?? task.name ?? "").trim();
    let wbs = String(task.WBS ?? task.wbs ?? "").trim();

    if (uid === 0) {
      warnings.push({ code: "skipped_root", message: "Skipped UID 0 (project summary)", uid: 0 });
      continue;
    }
    if (!name) continue;

    if (!wbs) {
      warnings.push({ code: "missing_wbs", message: `Task ${uid} has no WBS — grouped as unstructured`, uid });
      wbs = "__unstructured__";
    }

    const dup = seenWbs.get(wbs);
    if (dup != null && dup !== uid) {
      warnings.push({
        code: "duplicate_wbs",
        message: `Duplicate WBS "${wbs}" (UID ${dup} and ${uid}) — separate rows preserved (UID-keyed)`,
        uid,
        wbs,
      });
    }
    if (dup == null) {
      seenWbs.set(wbs, uid);
    }

    const outlineLevel = asNumber(task.OutlineLevel ?? task.outlineLevel, 0);
    const outlineNumber =
      task.OutlineNumber != null || task.outlineNumber != null
        ? String(task.OutlineNumber ?? task.outlineNumber)
        : undefined;

    let start = extractDate(task.Start ?? task.start);
    let finish = extractDate(task.Finish ?? task.finish);
    if (!start && !finish) {
      warnings.push({ code: "invalid_date", message: `UID ${uid}: missing Start/Finish — using placeholders`, uid, wbs });
      const today = new Date().toISOString().slice(0, 10);
      start = today;
      finish = today;
    } else if (!start) {
      start = finish;
    } else if (!finish) {
      finish = start;
    }
    if (start && finish && start > finish) {
      warnings.push({ code: "invalid_date", message: `UID ${uid}: start after finish — swapped`, uid, wbs });
      const t = start;
      start = finish;
      finish = t;
    }

    const duration = String(task.Duration ?? task.duration ?? "PT8H0M0S");
    const predLinks: Record<string, unknown>[] = (() => {
      const pl = task.PredecessorLink ?? task.predecessorLink;
      if (!pl) return [];
      return Array.isArray(pl) ? pl : [pl];
    })();

    const predecessors = predLinks.map((link) => ({
      predecessor_uid: asNumber(link.PredecessorUID ?? link.predecessorUID, 0),
      type: PREDECESSOR_TYPE_MAP[asNumber(link.Type ?? link.type, 1)] || "FS",
      lag_days: Math.round(parseDurationToDays(String(link.LinkLag ?? link.linkLag ?? "PT0H0M0S"))),
    }));

    flat.push({
      uid,
      id: task.ID != null || task.id != null ? String(task.ID ?? task.id) : undefined,
      name,
      wbs,
      outlineNumber,
      outlineLevel,
      start,
      finish,
      summary: asBool(task.Summary ?? task.summary),
      milestone: asBool(task.Milestone ?? task.milestone),
      active: task.Active != null || task.active != null ? asBool(task.Active ?? task.active) : true,
      percentComplete: Math.min(100, Math.max(0, Math.round(asNumber(task.PercentComplete ?? task.percentComplete, 0)))),
      durationDays: parseDurationToDays(duration),
      predecessors,
    });
  }

  return { flat, warnings };
}
