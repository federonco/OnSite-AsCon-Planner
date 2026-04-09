import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeCostLineAmount } from "@/lib/planner-cost-utils";
import type { CostCategory } from "@/lib/planner-types";

export type CostReportLine = {
  activity_id: string;
  activity_name: string;
  crew_id: string | null;
  crew_name: string | null;
  section_id: string | null;
  section_name: string | null;
  start_date: string;
  end_date: string;
  duration_days: number;
  budget_amount: number | null;
  cost_date: string;
  category: CostCategory;
  item_name: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  cost_code: string | null;
  resource_crew: string | null;
  catalogue_item_id: string | null;
};

function parseDateOnly(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function daysInclusive(start: string, end: string): number {
  const s = new Date(`${start}T12:00:00Z`).getTime();
  const e = new Date(`${end}T12:00:00Z`).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 0;
  return Math.floor((e - s) / 86_400_000) + 1;
}

function overlapDaysInclusive(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  if (end < start) return 0;
  return daysInclusive(start, end);
}

function asCategory(v: unknown): CostCategory {
  const s = String(v ?? "").toLowerCase();
  if (s === "machinery" || s === "labour" || s === "materials") return s;
  return "materials";
}

export async function fetchCostReportLines(params: {
  crewId?: string | null;
  sectionId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  costCode?: string | null;
}): Promise<CostReportLine[]> {
  const supabase = getSupabaseAdmin();
  const { crewId, sectionId, fromDate, toDate, costCode } = params;

  let q = supabase
    .from("planner_activities")
    .select("id,name,crew_id,drainer_section_id,start_date,end_date,duration_days,budget_amount,cost_entries");
  if (crewId) q = q.eq("crew_id", crewId);
  if (sectionId) q = q.eq("drainer_section_id", sectionId);
  const { data: activities, error: actErr } = await q;
  if (actErr) throw new Error(actErr.message);

  const { data: crews } = await supabase.from("crews").select("id,name");
  const crewMap = new Map<string, string>((crews ?? []).map((r) => [String(r.id), String(r.name ?? "")]));

  const sectionIds = Array.from(
    new Set((activities ?? []).map((a) => String(a.drainer_section_id ?? "")).filter(Boolean))
  );
  const sectionMap = new Map<string, string>();
  if (sectionIds.length > 0) {
    const { data: sections } = await supabase
      .from("drainer_sections")
      .select("id,name")
      .in("id", sectionIds);
    for (const s of sections ?? []) sectionMap.set(String(s.id), String(s.name ?? ""));
  }

  const catalogueIds = new Set<string>();
  for (const a of activities ?? []) {
    const entries = Array.isArray(a.cost_entries) ? a.cost_entries : [];
    for (const e of entries) {
      if (!e || typeof e !== "object") continue;
      const id = String((e as Record<string, unknown>).catalogue_item_id ?? "").trim();
      if (id) catalogueIds.add(id);
    }
  }

  const catMap = new Map<string, { cost_code: string | null; company: string | null }>();
  if (catalogueIds.size > 0) {
    const { data: cats } = await supabase
      .from("planner_cost_catalogue")
      .select("id,cost_code,company")
      .in("id", Array.from(catalogueIds));
    for (const c of cats ?? []) {
      catMap.set(String(c.id), {
        cost_code: c.cost_code != null && String(c.cost_code).trim() ? String(c.cost_code).trim() : null,
        company: c.company != null && String(c.company).trim() ? String(c.company).trim() : null,
      });
    }
  }

  const out: CostReportLine[] = [];
  for (const a of activities ?? []) {
    const activityId = String(a.id ?? "");
    const activityName = String(a.name ?? "");
    const start = parseDateOnly(a.start_date) ?? "";
    const end = parseDateOnly(a.end_date) ?? start;
    const duration = Number.isFinite(Number(a.duration_days)) ? Math.max(1, Number(a.duration_days)) : Math.max(1, daysInclusive(start, end));
    const budgetAmount = Number.isFinite(Number(a.budget_amount)) ? Number(a.budget_amount) : null;
    const crew_id = a.crew_id != null ? String(a.crew_id) : null;
    const section_id = a.drainer_section_id != null ? String(a.drainer_section_id) : null;
    const crew_name = crew_id ? crewMap.get(crew_id) ?? null : null;
    const section_name = section_id ? sectionMap.get(section_id) ?? null : null;
    const entries = Array.isArray(a.cost_entries) ? a.cost_entries : [];

    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const cost_date = parseDateOnly(e.cost_date) ?? start;
      if (fromDate && cost_date < fromDate) continue;
      if (toDate && cost_date > toDate) continue;

      const quantity = Number(e.quantity);
      const unit_rate = Number(e.unit_rate);
      const override = e.override_unit_rate != null && Number.isFinite(Number(e.override_unit_rate))
        ? Number(e.override_unit_rate)
        : null;
      if (!Number.isFinite(quantity) || !Number.isFinite(unit_rate)) continue;
      const rate = override ?? unit_rate;
      const amount = computeCostLineAmount(quantity, unit_rate, override);

      const catalogue_item_id = e.catalogue_item_id != null && String(e.catalogue_item_id).trim()
        ? String(e.catalogue_item_id).trim()
        : null;
      const catItem = catalogue_item_id ? catMap.get(catalogue_item_id) : null;
      const codeFromCat = catItem?.cost_code ?? null;
      const lineCostCode = codeFromCat;
      if (costCode && (lineCostCode ?? "") !== costCode) continue;

      out.push({
        activity_id: activityId,
        activity_name: activityName,
        crew_id,
        crew_name,
        section_id,
        section_name,
        start_date: start,
        end_date: end,
        duration_days: duration,
        budget_amount: budgetAmount,
        cost_date,
        category: asCategory(e.category),
        item_name: String(e.name ?? "").trim() || "Item",
        quantity,
        unit: String(e.unit ?? "").trim() || "unit",
        rate,
        amount,
        cost_code: lineCostCode,
        resource_crew: catItem?.company ?? null,
        catalogue_item_id,
      });
    }
  }

  return out;
}

export function makeCategoryTotals(lines: Array<{ category: CostCategory; amount: number }>) {
  const by: Record<CostCategory, number> = { labour: 0, machinery: 0, materials: 0 };
  for (const l of lines) by[l.category] += Number(l.amount) || 0;
  return by;
}

export function makeCostCodeTotals(lines: Array<{ cost_code: string | null; amount: number }>) {
  const map = new Map<string, number>();
  for (const l of lines) {
    const key = l.cost_code ?? "Uncoded";
    map.set(key, (map.get(key) ?? 0) + (Number(l.amount) || 0));
  }
  return Array.from(map.entries())
    .map(([cost_code, amount]) => ({ cost_code, amount }))
    .sort((a, b) => b.amount - a.amount || a.cost_code.localeCompare(b.cost_code));
}

export { daysInclusive, overlapDaysInclusive };

