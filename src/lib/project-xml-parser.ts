import { XMLParser } from "fast-xml-parser";
import { DependencyType, ParsedProjectTask } from "./planner-types";

/** Map MS Project predecessor type numbers to our dependency types */
const PREDECESSOR_TYPE_MAP: Record<number, DependencyType> = {
  0: "FF",
  1: "FS",
  2: "SF",
  3: "SS",
};

/** Parse ISO 8601 duration (PT__H__M__S) to days (8h = 1 day) */
function parseDurationToDays(duration: string): number {
  if (!duration) return 1;
  const match = duration.match(/PT(\d+)H(\d+)M(\d+)S/);
  if (!match) return 1;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  // 8 hours = 1 working day
  return Math.max(1, Math.round((hours + minutes / 60) / 8));
}

/** Extract date string (YYYY-MM-DD) from MS Project datetime */
function extractDate(datetime: string): string {
  if (!datetime) return "";
  // MS Project XML uses ISO format: 2026-04-01T08:00:00
  return datetime.substring(0, 10);
}

/** Parse MS Project XML content into structured tasks */
export function parseProjectXml(xmlContent: string): ParsedProjectTask[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (tagName) => tagName === "Task" || tagName === "PredecessorLink",
  });

  const parsed = parser.parse(xmlContent);

  // Navigate to Tasks array (handle different XML structures)
  const project = parsed.Project || parsed.project || parsed;
  const tasksContainer = project.Tasks || project.tasks || {};
  const tasks: Record<string, unknown>[] = tasksContainer.Task || tasksContainer.task || [];

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return [];
  }

  const result: ParsedProjectTask[] = [];

  for (const task of tasks) {
    const uid = Number(task.UID ?? task.uid ?? 0);
    const name = String(task.Name ?? task.name ?? "");
    const wbs = String(task.WBS ?? task.wbs ?? "");
    const outlineLevel = Number(task.OutlineLevel ?? task.outlineLevel ?? 0);
    const start = extractDate(String(task.Start ?? task.start ?? ""));
    const finish = extractDate(String(task.Finish ?? task.finish ?? ""));
    const duration = String(task.Duration ?? task.duration ?? "PT8H0M0S");
    const isSummary = task.Summary === "1" || task.Summary === 1 || task.summary === "1";

    // Skip UID 0 (project summary task)
    if (uid === 0) continue;
    // Skip empty names
    if (!name.trim()) continue;

    // Parse predecessors
    const predLinks: Record<string, unknown>[] = (() => {
      const pl = task.PredecessorLink || task.predecessorLink;
      if (!pl) return [];
      return Array.isArray(pl) ? pl : [pl];
    })();

    const predecessors = predLinks.map((link) => ({
      predecessor_uid: Number(link.PredecessorUID ?? link.predecessorUID ?? 0),
      type: PREDECESSOR_TYPE_MAP[Number(link.Type ?? link.type ?? 1)] || "FS",
      lag_days: Math.round(
        parseDurationToDays(String(link.LinkLag ?? link.linkLag ?? "PT0H0M0S"))
      ),
    }));

    result.push({
      uid,
      wbs_code: wbs,
      name,
      start_date: start,
      end_date: finish,
      duration_days: parseDurationToDays(duration),
      outline_level: outlineLevel,
      is_summary: isSummary,
      predecessors,
    });
  }

  return result;
}
