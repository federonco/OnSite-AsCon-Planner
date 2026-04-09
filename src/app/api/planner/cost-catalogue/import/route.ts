import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  buildCatalogueMatchKey,
  parseCostosCurrentWorkbook,
} from "@/lib/planner-cost-catalogue-import";
import type { CostCategory } from "@/lib/planner-types";

export const dynamic = "force-dynamic";

function asStringOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function getString(obj: unknown, key: string): string {
  if (!obj || typeof obj !== "object") return "";
  const v = (obj as Record<string, unknown>)[key];
  return String(v ?? "").trim();
}

function getCostCategory(obj: unknown, key: string): CostCategory | null {
  const v = getString(obj, key).toLowerCase();
  if (v === "machinery" || v === "labour" || v === "materials") return v;
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const form = await req.formData();
    const file = form.get("file");
    const dryRun = String(form.get("dry_run") ?? "").trim() === "true";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required (multipart form-data)" }, { status: 400 });
    }

    const buf = await file.arrayBuffer();
    const parsed = parseCostosCurrentWorkbook(buf);
    const imported = parsed.items;
    const importBatchId = crypto.randomUUID();

    // Deterministic matching: normalized category + name + unit (ignore cost_code by business rule)
    let hasCompanyColumn = true;
    let existing: unknown[] = [];
    {
      const res = await supabase
        .from("planner_cost_catalogue")
        .select("id, category, name, unit, company");
      if (res.error) {
        if (res.error.message.toLowerCase().includes("company")) {
          hasCompanyColumn = !res.error.message.toLowerCase().includes("company");
          const fallback = await supabase
            .from("planner_cost_catalogue")
            .select("id, category, name, unit");
          if (fallback.error) {
            return NextResponse.json({ error: fallback.error.message }, { status: 500 });
          }
          existing = (fallback.data ?? []) as unknown[];
        } else {
          return NextResponse.json({ error: res.error.message }, { status: 500 });
        }
      } else {
        existing = (res.data ?? []) as unknown[];
      }
    }

    const map = new Map<string, { id: string }>();
    for (const row of existing) {
      const category = getCostCategory(row, "category");
      if (!category) continue;
      const key = buildCatalogueMatchKey({
        category,
        name: getString(row, "name"),
        unit: getString(row, "unit"),
        cost_code: null,
      });
      const id = getString(row, "id");
      if (id) map.set(key, { id });
    }

    type InsertRow = {
      category: CostCategory;
      name: string;
      company: string | null;
      description: string | null;
      unit: string;
      unit_rate: number;
      cost_code: string | null;
      source_group: string | null;
      source_meta: Record<string, unknown>;
      is_active: boolean;
    };
    type UpdateRow = InsertRow & { id: string };

    const toInsert: InsertRow[] = [];
    const toUpsertById: UpdateRow[] = [];
    for (const it of imported) {
      const key = buildCatalogueMatchKey(it);
      const hit = map.get(key);
      const sourceMeta = {
        ...it.source_meta,
        import_batch_id: importBatchId,
        import_action: hit ? "update" : "insert",
      };
      const payload: InsertRow = {
        category: it.category,
        name: it.name,
        company: hasCompanyColumn ? it.company : null,
        description: it.description,
        unit: it.unit,
        unit_rate: it.unit_rate,
        cost_code: null,
        source_group: it.source_group,
        source_meta: sourceMeta,
        is_active: true,
      };
      if (hit) toUpsertById.push({ id: hit.id, ...payload });
      else toInsert.push(payload);
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        audit: parsed.audit,
        imported_count: imported.length,
        would_insert: toInsert.length,
        would_update: toUpsertById.length,
      });
    }

    let inserted = 0;
    let updated = 0;

    if (toInsert.length) {
      const insertedRes = await supabase.from("planner_cost_catalogue").insert(toInsert);
      if (insertedRes.error && insertedRes.error.message.toLowerCase().includes("company")) {
        hasCompanyColumn = false;
        const fallbackRows = toInsert.map(({ company, ...r }) => {
          void company;
          return r;
        });
        const fallbackInsert = await supabase.from("planner_cost_catalogue").insert(fallbackRows);
        if (fallbackInsert.error) return NextResponse.json({ error: fallbackInsert.error.message }, { status: 500 });
        inserted = fallbackRows.length;
      } else if (insertedRes.error) {
        return NextResponse.json({ error: insertedRes.error.message }, { status: 500 });
      } else {
        inserted = toInsert.length;
      }
    }

    if (toUpsertById.length) {
      const upsertRes = await supabase.from("planner_cost_catalogue").upsert(toUpsertById);
      if (upsertRes.error && upsertRes.error.message.toLowerCase().includes("company")) {
        const fallbackRows = toUpsertById.map(({ company, ...r }) => {
          void company;
          return r;
        });
        const fallbackUpsert = await supabase.from("planner_cost_catalogue").upsert(fallbackRows);
        if (fallbackUpsert.error) return NextResponse.json({ error: fallbackUpsert.error.message }, { status: 500 });
        updated = fallbackRows.length;
      } else if (upsertRes.error) {
        return NextResponse.json({ error: upsertRes.error.message }, { status: 500 });
      } else {
        updated = toUpsertById.length;
      }
    }

    return NextResponse.json({
      ok: true,
      audit: parsed.audit,
      import_batch_id: importBatchId,
      imported_count: imported.length,
      inserted,
      updated,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const importBatchId =
      body && typeof body === "object" && "import_batch_id" in body
        ? String((body as Record<string, unknown>).import_batch_id ?? "").trim()
        : "";
    if (!importBatchId) {
      return NextResponse.json({ error: "import_batch_id is required" }, { status: 400 });
    }

    // Revert only rows inserted by this import batch.
    const { data: rows, error: selectErr } = await supabase
      .from("planner_cost_catalogue")
      .select("id")
      .eq("source_meta->>import_batch_id", importBatchId)
      .eq("source_meta->>import_action", "insert");
    if (selectErr) return NextResponse.json({ error: selectErr.message }, { status: 500 });

    const ids = (rows ?? [])
      .map((r) => (r && typeof r === "object" && "id" in r ? String((r as Record<string, unknown>).id ?? "") : ""))
      .filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({ ok: true, reverted: 0 });
    }

    const { error: updateErr } = await supabase
      .from("planner_cost_catalogue")
      .update({ is_active: false })
      .in("id", ids);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, reverted: ids.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

