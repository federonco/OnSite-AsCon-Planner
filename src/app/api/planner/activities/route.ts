import { NextRequest, NextResponse } from "next/server";
import { mapRowToPlannerActivity } from "@/lib/planner-activity-mapper";
import { computeCostLineAmount } from "@/lib/planner-cost-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type DepType = "FS" | "SS";

type CostEntryInput = {
  id: string;
  catalogue_item_id: string | null;
  category: string;
  name: string;
  unit: string;
  unit_rate: number;
  override_unit_rate: number | null;
  quantity: number;
  amount: number;
  cost_date: string;
  description: string | null;
  created_at: string;
};

function sanitizeCostEntries(raw: unknown): CostEntryInput[] {
  if (!Array.isArray(raw)) return [];
  const validCategories = new Set(["machinery", "labour", "materials"]);
  const out: CostEntryInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = String(r.id ?? "").trim();
    const name = String(r.name ?? "").trim();
    const unit = String(r.unit ?? "").trim();
    const costDate = String(r.cost_date ?? "").trim();
    const unitRate = Number(r.unit_rate);
    const quantity = Number(r.quantity);
    const overrideRaw = r.override_unit_rate;
    const override =
      overrideRaw != null && String(overrideRaw).trim() !== "" && Number.isFinite(Number(overrideRaw))
        ? Number(overrideRaw)
        : null;
    if (!id || !name || !unit || !/^\d{4}-\d{2}-\d{2}$/.test(costDate)) continue;
    if (!Number.isFinite(unitRate) || !Number.isFinite(quantity)) continue;
    const categoryRaw = String(r.category ?? "materials").toLowerCase();
    const category = validCategories.has(categoryRaw) ? categoryRaw : "materials";
    out.push({
      id,
      catalogue_item_id:
        r.catalogue_item_id != null && String(r.catalogue_item_id).trim() !== ""
          ? String(r.catalogue_item_id)
          : null,
      category,
      name,
      unit,
      unit_rate: unitRate,
      override_unit_rate: override,
      quantity,
      amount: computeCostLineAmount(quantity, unitRate, override),
      cost_date: costDate,
      description:
        r.description != null && String(r.description).trim() !== "" ? String(r.description) : null,
      created_at: String(r.created_at ?? new Date().toISOString()),
    });
  }
  return out;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

function ymdDiffDays(fromYmd: string, toYmd: string): number {
  const from = new Date(`${fromYmd}T00:00:00`);
  const to = new Date(`${toYmd}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

async function upsertSingleDependency(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  successorId: string,
  predecessorId: string | null,
  depType: DepType | null,
  lagDays: number
) {
  await supabase.from("planner_dependencies").delete().eq("successor_id", successorId);
  if (!predecessorId || !depType || predecessorId === successorId) return;
  await supabase.from("planner_dependencies").insert({
    predecessor_id: predecessorId,
    successor_id: successorId,
    type: depType,
    lag_days: lagDays,
  });
}

async function readSingleDependency(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  successorId: string
): Promise<{ predecessor_id: string | null; dependency_type: DepType | null; dependency_lag_days: number | null }> {
  const { data } = await supabase
    .from("planner_dependencies")
    .select("predecessor_id,type,lag_days")
    .eq("successor_id", successorId)
    .limit(1)
    .maybeSingle();
  if (!data) {
    return { predecessor_id: null, dependency_type: null, dependency_lag_days: null };
  }
  const t = String((data as { type?: unknown }).type ?? "").toUpperCase();
  return {
    predecessor_id: String((data as { predecessor_id?: unknown }).predecessor_id ?? ""),
    dependency_type: t === "SS" ? "SS" : t === "FS" ? "FS" : null,
    dependency_lag_days: Number((data as { lag_days?: unknown }).lag_days ?? 0) || 0,
  };
}

async function cascadeFromPredecessor(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  predecessorId: string,
  visited = new Set<string>()
) {
  if (visited.has(predecessorId)) return;
  visited.add(predecessorId);
  const { data: pred } = await supabase
    .from("planner_activities")
    .select("id,start_date,end_date")
    .eq("id", predecessorId)
    .maybeSingle();
  if (!pred) return;

  const { data: deps } = await supabase
    .from("planner_dependencies")
    .select("successor_id,type,lag_days")
    .eq("predecessor_id", predecessorId);
  if (!deps?.length) return;

  for (const dep of deps) {
    const successorId = String(dep.successor_id ?? "");
    if (!successorId) continue;
    const { data: succ } = await supabase
      .from("planner_activities")
      .select("id,start_date,end_date")
      .eq("id", successorId)
      .maybeSingle();
    if (!succ) continue;

    const lag = Number.isFinite(Number(dep.lag_days)) ? Number(dep.lag_days) : 0;
    const depType = String(dep.type ?? "FS").toUpperCase();
    const targetStart =
      depType === "SS" ? addDaysYmd(String(pred.start_date), lag) : addDaysYmd(String(pred.end_date), 1 + lag);

    const currStart = String(succ.start_date);
    if (currStart >= targetStart) continue;

    const delta = ymdDiffDays(currStart, targetStart);
    await supabase
      .from("planner_activities")
      .update({
        start_date: addDaysYmd(String(succ.start_date), delta),
        end_date: addDaysYmd(String(succ.end_date), delta),
      })
      .eq("id", successorId);

    await cascadeFromPredecessor(supabase, successorId, visited);
  }
}

export async function GET(req: NextRequest) {
  try {
  const supabase = getSupabaseAdmin();
  const params = req.nextUrl.searchParams;
  const crewId = params.get("crew_id");
  const startDate = params.get("start_date");
  const endDate = params.get("end_date");
  const statusFilter = params.get("status");

  let query = supabase
    .from("planner_activities")
    .select("*, crews(name)")
    .order("start_date", { ascending: true })
    .order("sort_order", { ascending: true });

  if (crewId) {
    query = query.eq("crew_id", crewId);
  }

  // Overlap filter: activity overlaps [startDate, endDate]
  if (startDate && endDate) {
    query = query.lte("start_date", endDate).gte("end_date", startDate);
  } else if (startDate) {
    query = query.gte("end_date", startDate);
  } else if (endDate) {
    query = query.lte("start_date", endDate);
  }

  if (statusFilter) {
    const statuses = statusFilter.split(",").map((s) => s.trim());
    query = query.in("status", statuses);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten crew name from join; drop rows the mapper rejects (bad dates / ids)
  const rows = (data || []) as Record<string, unknown>[];
  const ids = rows.map((r) => String(r.id ?? "")).filter(Boolean);
  const depBySuccessor = new Map<string, { predecessor_id: string; dependency_type: string; dependency_lag_days: number }>();
  if (ids.length) {
    const { data: deps } = await supabase
      .from("planner_dependencies")
      .select("predecessor_id,successor_id,type,lag_days")
      .in("successor_id", ids);
    for (const d of deps ?? []) {
      const succ = String((d as { successor_id?: unknown }).successor_id ?? "");
      if (!succ || depBySuccessor.has(succ)) continue;
      depBySuccessor.set(succ, {
        predecessor_id: String((d as { predecessor_id?: unknown }).predecessor_id ?? ""),
        dependency_type: String((d as { type?: unknown }).type ?? "FS"),
        dependency_lag_days: Number((d as { lag_days?: unknown }).lag_days ?? 0) || 0,
      });
    }
  }

  const activities = rows
    .map((row) => {
      const { crews, ...rest } = row as Record<string, unknown>;
      const dep = depBySuccessor.get(String(row.id ?? ""));
      return mapRowToPlannerActivity({
        ...rest,
        crew_name: (crews as { name: string } | null)?.name ?? null,
        predecessor_id: dep?.predecessor_id ?? null,
        dependency_type: dep?.dependency_type ?? null,
        dependency_lag_days: dep?.dependency_lag_days ?? null,
      });
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  return NextResponse.json(activities);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { crew_id, name, start_date, end_date } = body;
  const sectionId =
    body.drainer_section_id != null && String(body.drainer_section_id).trim() !== ""
      ? String(body.drainer_section_id).trim()
      : null;
  if (!crew_id || !name || !start_date || !end_date) {
    return NextResponse.json(
      { error: "crew_id, name, start_date, and end_date are required" },
      { status: 400 }
    );
  }

  const rawProgress = Number(body.progress_percent);
  const progress_percent =
    Number.isFinite(rawProgress) ? Math.min(100, Math.max(0, Math.round(rawProgress))) : 0;

  const rawBudget = Number(body.budget_amount);
  const budget_amount = Number.isFinite(rawBudget) ? rawBudget : null;
  const cost_entries = sanitizeCostEntries(body.cost_entries);

  const row = {
    crew_id,
    name,
    start_date,
    end_date,
    status: body.status || "planned",
    drainer_section_id: sectionId,
    drainer_segment_id: body.drainer_segment_id || null,
    notes: body.notes || null,
    wbs_code: body.wbs_code || null,
    is_baseline: body.is_baseline || false,
    parent_activity_id: body.parent_activity_id || null,
    sort_order: body.sort_order ?? 0,
    progress_percent,
    budget_amount,
    cost_entries,
  };

  const { data, error } = await supabase
    .from("planner_activities")
    .insert(row)
    .select("*, crews(name)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { crews, ...rest } = data as Record<string, unknown>;
  const predecessor_id =
    body.predecessor_id != null && String(body.predecessor_id).trim() !== ""
      ? String(body.predecessor_id).trim()
      : null;
  const dependency_type =
    String(body.dependency_type ?? "").toUpperCase() === "SS" ? "SS" : String(body.dependency_type ?? "").toUpperCase() === "FS" ? "FS" : null;
  const dependency_lag_days = Number.isFinite(Number(body.dependency_lag_days))
    ? Math.max(0, Math.round(Number(body.dependency_lag_days)))
    : 0;
  await upsertSingleDependency(
    supabase,
    String(rest.id ?? ""),
    predecessor_id,
    dependency_type as DepType | null,
    dependency_lag_days
  );
  const dep = await readSingleDependency(supabase, String(rest.id ?? ""));
  const mapped = mapRowToPlannerActivity({
    ...rest,
    crew_name: (crews as { name: string } | null)?.name ?? null,
    predecessor_id: dep.predecessor_id,
    dependency_type: dep.dependency_type,
    dependency_lag_days: dep.dependency_lag_days,
  });
  if (!mapped) {
    return NextResponse.json({ error: "Invalid activity payload after save" }, { status: 500 });
  }
  return NextResponse.json(mapped);
}

export async function PUT(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { id, ...updates } = body;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Only allow updating specific fields
  const allowed = [
    "name", "start_date", "end_date", "status", "notes",
    "wbs_code", "sort_order", "progress_percent",
    "drainer_section_id", "drainer_segment_id", "budget_amount", "cost_entries",
  ];
  const filtered: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in updates) {
      if (key === "drainer_section_id") {
        const v = updates.drainer_section_id;
        filtered[key] =
          v == null || (typeof v === "string" && v.trim() === "") ? null : String(v).trim();
      } else if (key === "budget_amount") {
        const v = Number(updates.budget_amount);
        filtered[key] = Number.isFinite(v) ? v : null;
      } else if (key === "cost_entries") {
        filtered[key] = sanitizeCostEntries(updates.cost_entries);
      } else {
        filtered[key] = updates[key];
      }
    }
  }

  if (Object.keys(filtered).length === 0) {
    if (!("predecessor_id" in updates || "dependency_type" in updates || "dependency_lag_days" in updates)) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }
  }

  const { data: before } = await supabase
    .from("planner_activities")
    .select("id,start_date,end_date")
    .eq("id", id)
    .maybeSingle();

  const hasRowUpdates = Object.keys(filtered).length > 0;
  const { data, error } = hasRowUpdates
    ? await supabase
        .from("planner_activities")
        .update(filtered)
        .eq("id", id)
        .select("*, crews(name)")
        .single()
    : await supabase
        .from("planner_activities")
        .select("*, crews(name)")
        .eq("id", id)
        .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { crews, ...rest } = data as Record<string, unknown>;
  const predecessor_id =
    "predecessor_id" in updates
      ? updates.predecessor_id != null && String(updates.predecessor_id).trim() !== ""
        ? String(updates.predecessor_id).trim()
        : null
      : undefined;
  const dependency_type =
    "dependency_type" in updates
      ? String(updates.dependency_type ?? "").toUpperCase() === "SS"
        ? "SS"
        : String(updates.dependency_type ?? "").toUpperCase() === "FS"
          ? "FS"
          : null
      : undefined;
  const dependency_lag_days =
    "dependency_lag_days" in updates
      ? Number.isFinite(Number(updates.dependency_lag_days))
        ? Math.max(0, Math.round(Number(updates.dependency_lag_days)))
        : 0
      : undefined;

  if ("predecessor_id" in updates || "dependency_type" in updates || "dependency_lag_days" in updates) {
    await upsertSingleDependency(
      supabase,
      String(id),
      predecessor_id ?? null,
      (dependency_type ?? "FS") as DepType | null,
      dependency_lag_days ?? 0
    );
  }

  const oldStart = before ? String((before as { start_date?: unknown }).start_date ?? "") : "";
  const oldEnd = before ? String((before as { end_date?: unknown }).end_date ?? "") : "";
  const newStart = String(rest.start_date ?? "");
  const newEnd = String(rest.end_date ?? "");
  if ((oldStart && newStart > oldStart) || (oldEnd && newEnd > oldEnd)) {
    await cascadeFromPredecessor(supabase, String(id));
  }

  const dep = await readSingleDependency(supabase, String(id));
  const mapped = mapRowToPlannerActivity({
    ...rest,
    crew_name: (crews as { name: string } | null)?.name ?? null,
    predecessor_id: dep.predecessor_id,
    dependency_type: dep.dependency_type,
    dependency_lag_days: dep.dependency_lag_days,
  });
  if (!mapped) {
    return NextResponse.json({ error: "Invalid activity payload after update" }, { status: 500 });
  }
  return NextResponse.json(mapped);
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("planner_activities")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
