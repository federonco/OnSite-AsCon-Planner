import { parseXerRaw } from "./parse-xer-raw";
import { mapProjects } from "./map-project";
import { mapWbs } from "./map-wbs";
import { mapTasks } from "./map-tasks";
import { mapTaskPreds } from "./map-taskpred";
import { mapCalendars } from "./map-calendar";
import { buildProjectTree } from "./build-project-tree";
import type { MappedTask, XerPipelineDiagnostics, XerTreeNodeJson } from "./types";
import type { MappedTaskPred } from "./types";
import type { MappedCalendar } from "./types";

export interface XerPipelineResult {
  projId: number | null;
  projects: ReturnType<typeof mapProjects>;
  wbsList: ReturnType<typeof mapWbs>;
  tasks: MappedTask[];
  preds: MappedTaskPred[];
  calendars: MappedCalendar[];
  tree: XerTreeNodeJson[];
  diagnostics: XerPipelineDiagnostics;
  warnings: string[];
  taskById: Map<number, MappedTask>;
}

export function runXerPipeline(text: string): XerPipelineResult {
  const doc = parseXerRaw(text);
  const warnings: string[] = [...doc.warnings];

  const projects = mapProjects(doc, warnings);
  const projId = projects[0]?.proj_id ?? null;
  if (projects.length > 1) {
    warnings.push(`Multiple projects in file (${projects.length}) — using first: ${projId ?? "?"}`);
  }

  const wbsList = mapWbs(doc, projId, warnings);
  const tasks = mapTasks(doc, projId, warnings);
  const preds = mapTaskPreds(doc, projId, warnings);
  const calendars = mapCalendars(doc, warnings);

  const tree = projId != null ? buildProjectTree(wbsList, tasks, projId) : [];

  const taskById = new Map<number, MappedTask>();
  for (const t of tasks) taskById.set(t.task_id, t);

  const diagnostics: XerPipelineDiagnostics = {
    projectCount: projects.length,
    wbsCount: wbsList.length,
    taskCount: tasks.length,
    predCount: preds.length,
    calendarCount: calendars.length,
  };

  if (tree.length === 0 && tasks.length > 0) {
    warnings.push("Could not build WBS tree — check PROJWBS parent links / proj_id");
  }

  return {
    projId,
    projects,
    wbsList,
    tasks,
    preds,
    calendars,
    tree,
    diagnostics: {
      ...diagnostics,
    },
    warnings,
    taskById,
  };
}

export * from "./types";
export { parseXerRaw } from "./parse-xer-raw";
export { taskIdsFromNodeSelection, findNodeById, collectTaskIdsInSubtree } from "./xer-selection";
export { xerTasksToFlatTasks } from "./xer-msproject-adapter";
export { xerTreeToImportedRoots, indexImportedById } from "./xer-to-imported-node";
