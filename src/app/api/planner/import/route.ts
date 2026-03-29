import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { parseProjectXml } from "@/lib/project-xml-parser";

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const crewId = formData.get("crew_id") as string | null;
  const mode = formData.get("mode") as string | null; // "baseline" | "editable"
  const preview = formData.get("preview") as string | null;

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  // Read XML content
  const xmlContent = await file.text();
  const tasks = parseProjectXml(xmlContent);

  if (tasks.length === 0) {
    return NextResponse.json(
      { error: "No tasks found in the XML file" },
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

  // Import mode: requires crew_id
  if (!crewId) {
    return NextResponse.json(
      { error: "crew_id is required for import" },
      { status: 400 }
    );
  }

  const isBaseline = mode === "baseline";

  // Build UID → DB id mapping for dependencies
  const uidToDbId = new Map<number, string>();

  // Insert activities in batches of 100
  const BATCH_SIZE = 100;
  let insertedCount = 0;

  // Build parent mapping: find parent UID for each task based on outline level
  const parentUidMap = new Map<number, number | null>();
  const outlineStack: { uid: number; level: number }[] = [];

  for (const task of tasks) {
    while (
      outlineStack.length > 0 &&
      outlineStack[outlineStack.length - 1].level >= task.outline_level
    ) {
      outlineStack.pop();
    }
    parentUidMap.set(
      task.uid,
      outlineStack.length > 0
        ? outlineStack[outlineStack.length - 1].uid
        : null
    );
    outlineStack.push({ uid: task.uid, level: task.outline_level });
  }

  // First pass: insert all activities (without parent_activity_id)
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);
    const rows = batch.map((task, idx) => ({
      crew_id: crewId,
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

    // Map UIDs to DB IDs
    for (let j = 0; j < batch.length; j++) {
      if (data && data[j]) {
        uidToDbId.set(batch[j].uid, data[j].id);
      }
    }
    insertedCount += data?.length || 0;
  }

  // Second pass: update parent_activity_id references
  for (const task of tasks) {
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

  for (const task of tasks) {
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
        console.error("Dependency insert error:", error.message);
      } else {
        depsInserted += data?.length || 0;
      }
    }
  }

  return NextResponse.json({
    success: true,
    imported: insertedCount,
    dependencies_imported: depsInserted,
  });
}
