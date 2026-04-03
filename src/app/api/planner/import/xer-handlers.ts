import { NextResponse } from "next/server";
import type { getSupabaseAdmin } from "@/lib/supabase-admin";
import { runXerPipeline, taskIdsFromNodeSelection } from "@/lib/import/xer";
import { normalizeTaskForPlanner, buildPredicatesForImport } from "@/lib/import/xer/normalize-for-planner";
import { wbsPathNames } from "@/lib/import/xer/build-project-tree";
import { insertPlannerRowsWithImportMeta } from "@/lib/import/xer/execute-xer-import";
import type { MappedTask } from "@/lib/import/xer/types";

export async function runXerPreviewHandler(xerText: string) {
  const p = runXerPipeline(xerText);
  const byWbs = new Map(p.wbsList.map((w) => [w.wbs_id, w]));
  const tasksWithPath = p.tasks.map((t) => ({
    ...t,
    wbs_path: wbsPathNames(t.wbs_id, byWbs),
  }));
  return NextResponse.json({
    success: true,
    tree: p.tree,
    warnings: p.warnings,
    diagnostics: {
      ...p.diagnostics,
      projects: p.projects.length,
      wbsNodes: p.wbsList.length,
      tasks: p.tasks.length,
      preds: p.preds.length,
      calendars: p.calendars.length,
    },
    preds: p.preds,
    tasks: tasksWithPath,
    calendars: p.calendars,
    projId: p.projId,
  });
}

export async function runXerImportHandler(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  formData: FormData,
  xerText: string,
  fileName: string,
  crewId: string
) {
  const drainerSectionRaw = formData.get("drainer_section_id") as string | null;
  const drainerSectionId =
    drainerSectionRaw != null && String(drainerSectionRaw).trim() !== ""
      ? String(drainerSectionRaw).trim()
      : null;
  const mode = formData.get("mode") as string | null;
  const isBaseline = mode === "baseline";

  const selectedRaw = formData.get("selected_node_ids");
  let selectedIds: string[] = [];
  try {
    const arr = JSON.parse(String(selectedRaw ?? "[]")) as unknown;
    if (!Array.isArray(arr)) {
      return NextResponse.json({ error: "selected_node_ids must be a JSON array of strings" }, { status: 400 });
    }
    selectedIds = arr.filter((x): x is string => typeof x === "string");
  } catch {
    return NextResponse.json({ error: "Invalid selected_node_ids JSON" }, { status: 400 });
  }

  const leafRaw = formData.get("selected_leaf_task_ids");
  let leafTaskIds: number[] = [];
  if (leafRaw != null && String(leafRaw).trim() !== "") {
    try {
      const arr = JSON.parse(String(leafRaw)) as unknown;
      if (!Array.isArray(arr)) {
        return NextResponse.json({ error: "selected_leaf_task_ids must be a JSON array of numbers" }, { status: 400 });
      }
      leafTaskIds = arr.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    } catch {
      return NextResponse.json({ error: "Invalid selected_leaf_task_ids JSON" }, { status: 400 });
    }
  }

  const p = runXerPipeline(xerText);
  const resultWarnings = [...p.warnings];

  const byWbs = new Map(p.wbsList.map((w) => [w.wbs_id, w]));
  const calName = new Map(p.calendars.map((c) => [c.clndr_id, c.clndr_name]));

  let taskIds =
    leafTaskIds.length > 0
      ? leafTaskIds
      : taskIdsFromNodeSelection(p.tree, new Set(selectedIds));

  taskIds = Array.from(new Set(taskIds)).filter((id) => p.taskById.has(id));

  if (taskIds.length === 0) {
    return NextResponse.json(
      { error: "No activities selected to import — choose WBS nodes or task rows." },
      { status: 400 }
    );
  }

  const toInsert: MappedTask[] = [];
  const normWarnings: string[] = [];
  for (const tid of taskIds) {
    const t = p.taskById.get(tid);
    if (!t) {
      resultWarnings.push(`Task id ${tid} not in file — skipped`);
      continue;
    }
    toInsert.push(t);
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ error: "No valid tasks to import after filtering" }, { status: 400 });
  }

  const BATCH_SIZE = 100;
  let insertedCount = 0;
  let usedImportMetaFallback = false;
  const taskIdToDb = new Map<number, string>();

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const rows = batch.map((t, idx) => {
      const path = wbsPathNames(t.wbs_id, byWbs);
      const { row, warnings: nw } = normalizeTaskForPlanner(t, path, fileName);
      normWarnings.push(...nw.map((w) => w.message));
      const meta = { ...row.import_meta } as Record<string, unknown>;
      if (t.calendar_id != null) {
        meta.source_calendar_name = calName.get(t.calendar_id) ?? null;
      }
      return {
        crew_id: crewId,
        drainer_section_id: drainerSectionId,
        name: row.name,
        start_date: row.start_date,
        end_date: row.end_date,
        status: "planned",
        wbs_code: path || null,
        is_baseline: isBaseline,
        sort_order: i + idx,
        progress_percent: row.progress_percent,
        notes: null,
        import_meta: meta,
      };
    });

    const ins = await insertPlannerRowsWithImportMeta(supabase, rows);
    if (ins.error) {
      return NextResponse.json({ error: `Batch insert failed: ${ins.error.message}` }, { status: 500 });
    }
    if (ins.usedNotesFallback) usedImportMetaFallback = true;
    const data = ins.data;
    for (let j = 0; j < batch.length; j++) {
      if (data && data[j]) {
        taskIdToDb.set(batch[j].task_id, data[j].id);
      }
    }
    insertedCount += data?.length ?? 0;
  }

  const importedIds = new Set(taskIds);
  const { preds: depRows, skipped: depSkipped } = buildPredicatesForImport(p.preds, importedIds);
  if (depSkipped > 0) {
    resultWarnings.push(`${depSkipped} predecessor link(s) skipped (missing task in import set)`);
  }

  let depsInserted = 0;
  const uniqueDeps = new Map<string, (typeof depRows)[0]>();
  for (const d of depRows) {
    const k = `${d.predecessor_task_id}|${d.successor_task_id}`;
    if (!uniqueDeps.has(k)) uniqueDeps.set(k, d);
  }

  const depList = Array.from(uniqueDeps.values());
  for (let i = 0; i < depList.length; i += BATCH_SIZE) {
    const batch = depList.slice(i, i + BATCH_SIZE).map((d) => {
      const predDb = taskIdToDb.get(d.predecessor_task_id);
      const succDb = taskIdToDb.get(d.successor_task_id);
      if (!predDb || !succDb) return null;
      return {
        predecessor_id: predDb,
        successor_id: succDb,
        type: d.type,
        lag_days: d.lag_days,
      };
    });
    const clean = batch.filter((x): x is NonNullable<typeof x> => x != null);
    if (clean.length === 0) continue;
    const { data, error } = await supabase.from("planner_dependencies").insert(clean).select("id");
    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: `Dependency insert failed: ${error.message}`,
          imported: insertedCount,
          dependencies_imported: depsInserted,
          warnings: [...resultWarnings, ...normWarnings],
        },
        { status: 500 }
      );
    }
    depsInserted += data?.length ?? 0;
  }

  const payload: Record<string, unknown> = {
    success: true,
    imported: insertedCount,
    skipped: 0,
    dependencies_imported: depsInserted,
    warnings: [...resultWarnings, ...normWarnings],
  };
  if (usedImportMetaFallback) {
    payload.import_meta_fallback = {
      code: "IMPORT_META_FALLBACK_TO_NOTES",
      message:
        "The database has no import_meta column; XER metadata was appended to notes. Apply planner-import-meta-migration.sql when possible.",
      importedCount: insertedCount,
    };
  }
  return NextResponse.json(payload);
}
