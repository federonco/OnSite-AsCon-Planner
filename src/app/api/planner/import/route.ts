import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { parseProjectXml } from "@/lib/project-xml-parser";
import { parseMsProjectXmlDocument } from "@/lib/import/xml/parse-ms-project-xml";
import { buildTaskTree, compareWbs } from "@/lib/import/xml/build-wbs-tree";
import { isImportLeaf } from "@/lib/import/xml/tree-helpers";
import type { ImportedTaskNode, MsProjectFlatTask } from "@/lib/import/xml/types";
import { runXerPreviewHandler, runXerImportHandler } from "./xer-handlers";

export const dynamic = "force-dynamic";

function appendXmlImportMetaToNotes(
  existingNotes: string | null | undefined,
  meta: { source: string; source_uid: number; source_wbs: string; source_file_name: string }
): string {
  const trimmed = existingNotes != null ? String(existingNotes).trim() : "";
  const block = `\n\n[xml_import_meta]${JSON.stringify(meta)}`;
  return trimmed === "" ? block.trimStart() : `${trimmed}${block}`;
}

async function runTreeV2Import(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  formData: FormData,
  xmlContent: string,
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

  const leafUidsRaw = formData.get("selected_leaf_uids");
  let leafUids: number[] = [];
  if (leafUidsRaw != null && String(leafUidsRaw).trim() !== "") {
    try {
      const arr = JSON.parse(String(leafUidsRaw)) as unknown;
      if (!Array.isArray(arr)) {
        return NextResponse.json({ error: "selected_leaf_uids must be a JSON array of numbers" }, { status: 400 });
      }
      leafUids = arr.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    } catch {
      return NextResponse.json({ error: "Invalid selected_leaf_uids JSON" }, { status: 400 });
    }
  }

  const { flat, warnings: parseWarnings } = parseMsProjectXmlDocument(xmlContent);
  const treeWarnings = [...parseWarnings];
  const { byId } = buildTaskTree(flat, treeWarnings);

  const flatByUid = new Map<number, MsProjectFlatTask>();
  for (const t of flat) {
    flatByUid.set(t.uid, t);
  }

  const selectedSet = new Set(selectedIds);
  const dedupeSeen = new Set<string>();
  const toInsert: ImportedTaskNode[] = [];
  let skippedDup = 0;

  const pushLeafNode = (n: ImportedTaskNode | undefined) => {
    if (!n || !isImportLeaf(n) || n.uid == null) return;
    const key = `${n.uid}|${n.wbs}|${fileName}`;
    if (dedupeSeen.has(key)) {
      skippedDup++;
      return;
    }
    dedupeSeen.add(key);
    toInsert.push(n);
  };

  if (leafUids.length > 0) {
    for (const uid of leafUids) {
      pushLeafNode(byId.get(`real:${uid}`));
    }
  } else {
    for (const id of Array.from(selectedSet)) {
      pushLeafNode(byId.get(id));
    }
  }

  toInsert.sort((a, b) => compareWbs(a.wbs, b.wbs));

  if (toInsert.length === 0) {
    return NextResponse.json(
      { error: "No leaf tasks in selection — select rows that include at least one non-summary task." },
      { status: 400 }
    );
  }

  const uidToDbId = new Map<number, string>();
  const BATCH_SIZE = 100;
  let insertedCount = 0;
  let usedImportMetaFallback = false;
  const resultWarnings: string[] = [...treeWarnings.map((w) => w.message)];
  if (skippedDup > 0) {
    resultWarnings.push(`Skipped ${skippedDup} duplicate row(s) (same UID+WBS+file in this batch).`);
  }

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const rows = batch.map((n, idx) => {
      const src = flatByUid.get(n.uid!);
      const start = n.start ?? "";
      const finish = n.finish ?? start;
      return {
        crew_id: crewId,
        drainer_section_id: drainerSectionId,
        name: n.name,
        start_date: start,
        end_date: finish,
        status: "planned",
        wbs_code: n.wbs === "__unstructured__" ? null : n.wbs,
        is_baseline: isBaseline,
        sort_order: i + idx,
        progress_percent: src?.percentComplete ?? 0,
        notes: null,
        import_meta: {
          source: "xml_import",
          source_uid: n.uid,
          source_wbs: n.wbs,
          source_file_name: fileName,
        },
      };
    });

    const firstInsert = await supabase.from("planner_activities").insert(rows).select("id");
    let data = firstInsert.data;

    if (firstInsert.error) {
      const err = firstInsert.error;
      const msg = String(err.message).toLowerCase();
      const maybeMissingImportMeta =
        msg.includes("import_meta") || msg.includes("could not find") || err.code === "PGRST204";
      if (maybeMissingImportMeta) {
        usedImportMetaFallback = true;
        const stripped = rows.map((r) => {
          const { import_meta, notes, ...rest } = r;
          const meta = import_meta as {
            source: string;
            source_uid: number;
            source_wbs: string;
            source_file_name: string;
          };
          return {
            ...rest,
            notes: appendXmlImportMetaToNotes(notes, meta),
          };
        });
        const second = await supabase.from("planner_activities").insert(stripped).select("id");
        if (second.error) {
          return NextResponse.json({ error: `Batch insert failed: ${second.error.message}` }, { status: 500 });
        }
        data = second.data;
      } else {
        return NextResponse.json({ error: `Batch insert failed: ${err.message}` }, { status: 500 });
      }
    }

    for (let j = 0; j < batch.length; j++) {
      if (data && data[j]) {
        uidToDbId.set(batch[j].uid!, data[j].id as string);
      }
    }
    insertedCount += data?.length || 0;
  }

  let depsInserted = 0;
  const depRows: { predecessor_id: string; successor_id: string; type: string; lag_days: number }[] = [];

  for (const n of toInsert) {
    const successorId = uidToDbId.get(n.uid!);
    if (!successorId) continue;
    const src = flatByUid.get(n.uid!);
    if (!src) continue;
    for (const pred of src.predecessors) {
      const predecessorId = uidToDbId.get(pred.predecessor_uid);
      if (!predecessorId) continue;
      depRows.push({
        predecessor_id: predecessorId,
        successor_id: successorId,
        type: pred.type,
        lag_days: pred.lag_days,
      });
    }
  }

  if (depRows.length > 0) {
    for (let i = 0; i < depRows.length; i += BATCH_SIZE) {
      const batch = depRows.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase.from("planner_dependencies").insert(batch).select("id");

      if (error) {
        return NextResponse.json(
          {
            success: false,
            error: `Dependency insert failed: ${error.message}`,
            imported: insertedCount,
            dependencies_imported: depsInserted,
            skipped: skippedDup,
            warnings: resultWarnings,
          },
          { status: 500 }
        );
      }
      depsInserted += data?.length || 0;
    }
  }

  const payload: Record<string, unknown> = {
    success: true,
    imported: insertedCount,
    skipped: skippedDup,
    dependencies_imported: depsInserted,
    warnings: resultWarnings,
  };
  if (usedImportMetaFallback) {
    payload.import_meta_fallback = {
      code: "IMPORT_META_FALLBACK_TO_NOTES",
      message:
        "The database has no import_meta column; XML source metadata was appended to each activity's notes. Apply planner-import-meta-migration.sql when possible.",
      importedCount: insertedCount,
    };
  }
  return NextResponse.json(payload);
}

/** Inserts use the service role client (see getSupabaseAdmin); RLS errors mean the server env key is wrong. */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const crewId = formData.get("crew_id") as string | null;
  const drainerSectionRaw = formData.get("drainer_section_id") as string | null;
  const drainerSectionId =
    drainerSectionRaw != null && String(drainerSectionRaw).trim() !== ""
      ? String(drainerSectionRaw).trim()
      : null;
  const mode = formData.get("mode") as string | null; // "baseline" | "editable"
  const preview = formData.get("preview") as string | null;
  const importFlow = String(formData.get("import_flow") ?? "");

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const fileName = String(file.name ?? "");
  const fileText = await file.text();

  if (importFlow === "xer_preview") {
    return runXerPreviewHandler(fileText);
  }
  if (importFlow === "xer_import") {
    if (!crewId) {
      return NextResponse.json({ error: "crew_id is required for import" }, { status: 400 });
    }
    return runXerImportHandler(supabase, formData, fileText, fileName, crewId);
  }

  const xmlContent = fileText;

  if (importFlow === "tree_v2") {
    if (!crewId) {
      return NextResponse.json({ error: "crew_id is required for import" }, { status: 400 });
    }
    return runTreeV2Import(supabase, formData, xmlContent, fileName, crewId);
  }

  const tasks = parseProjectXml(xmlContent);

  if (tasks.length === 0) {
    const xerHint = fileName.toLowerCase().endsWith(".xer")
      ? " Primavera .xer is a different format than MS Project XML — export or save as MS Project XML (.xml) and import that file."
      : "";
    return NextResponse.json(
      { error: `No tasks found.${xerHint}` },
      { status: 400 }
    );
  }

  // Preview mode: return parsed tasks without saving
  if (preview === "true") {
    return NextResponse.json({
      tasks,
      totalTasks: tasks.length,
      summaryTasks: tasks.filter((t) => t.is_summary).length,
      leafTasks: tasks.filter((t) => !t.is_summary).length,
    });
  }

  // Import mode: requires crew_id; drainer_section_id is optional (nullable in DB)
  if (!crewId) {
    return NextResponse.json(
      { error: "crew_id is required for import" },
      { status: 400 }
    );
  }

  /** Optional JSON array of task UIDs to import (subset). Omitted = import all. */
  let selectedUidSet: Set<number> | null = null;
  const selectedRaw = formData.get("selected_uids");
  if (selectedRaw != null && String(selectedRaw).trim() !== "") {
    try {
      const arr = JSON.parse(String(selectedRaw)) as unknown;
      if (!Array.isArray(arr)) {
        return NextResponse.json({ error: "selected_uids must be a JSON array of numbers" }, { status: 400 });
      }
      const nums = arr.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
      if (nums.length === 0) {
        return NextResponse.json({ error: "Select at least one task to import" }, { status: 400 });
      }
      selectedUidSet = new Set(nums);
    } catch {
      return NextResponse.json({ error: "Invalid selected_uids JSON" }, { status: 400 });
    }
  }

  const tasksToImport = selectedUidSet
    ? tasks.filter((t) => selectedUidSet!.has(t.uid))
    : tasks;

  if (tasksToImport.length === 0) {
    return NextResponse.json(
      { error: "No tasks match the selection" },
      { status: 400 }
    );
  }

  const isBaseline = mode === "baseline";

  // Build UID → DB id mapping for dependencies
  const uidToDbId = new Map<number, string>();

  // Insert activities in batches of 100
  const BATCH_SIZE = 100;
  let insertedCount = 0;

  // Parent mapping: only among selected tasks, preserving file order
  const parentUidMap = new Map<number, number | null>();
  const outlineStack: { uid: number; level: number }[] = [];
  for (const task of tasks) {
    if (selectedUidSet && !selectedUidSet.has(task.uid)) continue;
    while (
      outlineStack.length > 0 &&
      outlineStack[outlineStack.length - 1].level >= task.outline_level
    ) {
      outlineStack.pop();
    }
    parentUidMap.set(
      task.uid,
      outlineStack.length > 0 ? outlineStack[outlineStack.length - 1].uid : null
    );
    outlineStack.push({ uid: task.uid, level: task.outline_level });
  }

  // First pass: insert all activities (without parent_activity_id)
  for (let i = 0; i < tasksToImport.length; i += BATCH_SIZE) {
    const batch = tasksToImport.slice(i, i + BATCH_SIZE);
    const rows = batch.map((task, idx) => ({
      crew_id: crewId,
      drainer_section_id: drainerSectionId,
      name: task.name,
      start_date: task.start_date,
      end_date: task.end_date,
      status: "planned",
      wbs_code: task.wbs_code || null,
      is_baseline: isBaseline,
      sort_order: i + idx,
      notes: task.is_summary ? "Summary task" : null,
    }));

    const { data, error } = await supabase
      .from("planner_activities")
      .insert(rows)
      .select("id");

    if (error) {
      return NextResponse.json(
        { error: `Batch insert failed: ${error.message}` },
        { status: 500 }
      );
    }

    // Map UIDs to DB IDs (batch[j].uid from parser row)
    for (let j = 0; j < batch.length; j++) {
      if (data && data[j]) {
        uidToDbId.set(batch[j].uid, data[j].id as string);
      }
    }
    insertedCount += data?.length || 0;
  }

  // Second pass: update parent_activity_id references
  for (const task of tasksToImport) {
    const parentUid = parentUidMap.get(task.uid);
    if (parentUid != null) {
      const dbId = uidToDbId.get(task.uid);
      const parentDbId = uidToDbId.get(parentUid);
      if (dbId && parentDbId) {
        await supabase
          .from("planner_activities")
          .update({ parent_activity_id: parentDbId })
          .eq("id", dbId);
      }
    }
  }

  // Third pass: insert dependencies
  let depsInserted = 0;
  const depRows: { predecessor_id: string; successor_id: string; type: string; lag_days: number }[] = [];

  for (const task of tasksToImport) {
    const successorId = uidToDbId.get(task.uid);
    if (!successorId) continue;

    for (const pred of task.predecessors) {
      const predecessorId = uidToDbId.get(pred.predecessor_uid);
      if (!predecessorId) continue;
      depRows.push({
        predecessor_id: predecessorId,
        successor_id: successorId,
        type: pred.type,
        lag_days: pred.lag_days,
      });
    }
  }

  if (depRows.length > 0) {
    for (let i = 0; i < depRows.length; i += BATCH_SIZE) {
      const batch = depRows.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase
        .from("planner_dependencies")
        .insert(batch)
        .select("id");

      if (error) {
        return NextResponse.json(
          {
            success: false,
            error: `Dependency insert failed: ${error.message}`,
            imported: insertedCount,
            dependencies_imported: depsInserted,
          },
          { status: 500 }
        );
      }
      depsInserted += data?.length || 0;
    }
  }

  return NextResponse.json({
    success: true,
    imported: insertedCount,
    dependencies_imported: depsInserted,
  });
}
