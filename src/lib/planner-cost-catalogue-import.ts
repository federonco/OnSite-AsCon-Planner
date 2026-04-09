import * as XLSX from "xlsx";
import type { CostCategory } from "@/lib/planner-types";

export interface ImportedCatalogueItem {
  category: CostCategory;
  name: string;
  description: string | null;
  unit: string;
  unit_rate: number;
  cost_code: string | null;
  source_group: string | null;
  source_meta: Record<string, unknown>;
}

function cleanString(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function parseMoney(v: unknown): number | null {
  const s = cleanString(v);
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizeUnit(v: unknown): string {
  const s = cleanString(v).toLowerCase();
  if (!s) return "";
  if (s === "hour" || s === "hr" || s === "hrs") return "hr";
  if (s === "day" || s === "days") return "day";
  if (s === "m3" || s === "m^3" || s === "m³") return "m3";
  return s;
}

function mapWorkbookGroupToCategory(group: string): CostCategory | null {
  const g = group.trim().toLowerCase();
  if (g === "labour" || g === "labor") return "labour";
  if (g === "plant & equipment" || g === "plant and equipment" || g === "plant") return "machinery";
  if (g === "materials" || g === "material") return "materials";
  return null;
}

function normalizeKeyPart(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[()]/g, "")
    .trim();
}

export function buildCatalogueMatchKey(input: {
  category: CostCategory;
  name: string;
  unit: string;
  cost_code: string | null;
}): string {
  const cost = cleanString(input.cost_code);
  return [
    input.category,
    normalizeKeyPart(cleanString(input.name)),
    normalizeKeyPart(normalizeUnit(input.unit)),
    cost ? normalizeKeyPart(cost) : "",
  ].join("|");
}

export function parseCostosCurrentWorkbook(buffer: ArrayBuffer): {
  items: ImportedCatalogueItem[];
  audit: {
    sheetName: string;
    header: string[];
    groups: Array<{ label: string; mappedCategory: CostCategory | null; rowIndex1: number }>;
    ignoredRows: number;
  };
} {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0] ?? "Sheet1";
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null }) as unknown[][];

  const auditGroups: Array<{ label: string; mappedCategory: CostCategory | null; rowIndex1: number }> = [];
  let header: string[] = [];
  let currentGroup: string | null = null;
  let ignoredRows = 0;

  const out: ImportedCatalogueItem[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = (rows[i] ?? []) as unknown[];
    const nonEmpty = r.some((c) => cleanString(c) !== "");
    if (!nonEmpty) continue;

    const c0 = cleanString(r[0]);
    const c1 = cleanString(r[1]);
    const c2 = cleanString(r[2]);
    const c3 = cleanString(r[3]);
    const c4 = cleanString(r[4]);
    const c5 = cleanString(r[5]);

    // Header row
    if (c0 === "#" && cleanString(r[1]).toLowerCase() === "name") {
      header = r.map((v) => cleanString(v));
      continue;
    }

    // Group marker row (single label like "Labour" / "Plant & Equipment")
    const maybeGroupCategory = mapWorkbookGroupToCategory(c0);
    const isGroupRow = c0 && !c1 && !c2 && !c3 && !c4 && !c5;
    if (isGroupRow) {
      currentGroup = c0;
      auditGroups.push({ label: currentGroup, mappedCategory: maybeGroupCategory, rowIndex1: i + 1 });
      continue;
    }

    const category = currentGroup ? mapWorkbookGroupToCategory(currentGroup) : null;
    if (!category) {
      ignoredRows++;
      continue;
    }

    // Ignore the inline "Cost Codes / Ref" note row used as side header
    if (category === "labour" && c0.toLowerCase() === "operator" && c4 && c5 && c4.includes("$") && c5) {
      // Still a valid row (Harry Parsons). Keep; just don't treat later columns as schema.
    }

    const nameRaw = c0;
    const unit = normalizeUnit(c3);
    const rate = parseMoney(c4);
    const costCode = c5 ? cleanString(c5) : null;

    if (!nameRaw || !unit || rate == null) {
      ignoredRows++;
      continue;
    }

    // Preserve construction-style structure without importing people names:
    // - Labour: keep role, optionally disambiguate by company when present.
    // - Plant: keep equipment name; keep asset ref in description/meta.
    let name = nameRaw;
    let description: string | null = null;

    const personName = c1 || null;
    const company = c2 || null;

    if (category === "labour") {
      // Convert person-specific rows to a generic resource; disambiguate by company where provided.
      if (company) name = `${nameRaw} (${company})`;
      description = company ? `Company: ${company}` : null;
    } else if (category === "machinery") {
      // Second column is usually an internal asset ref; keep it out of the resource name.
      const ref = c1 || null;
      if (ref) description = `Ref: ${ref}`;
    }

    out.push({
      category,
      name: cleanString(name),
      description: description ? cleanString(description) : null,
      unit,
      unit_rate: rate,
      cost_code: costCode ? cleanString(costCode) : null,
      source_group: currentGroup ? cleanString(currentGroup) : null,
      source_meta: {
        source: "Costos Current.xlsx",
        sheet: sheetName,
        row_index_1: i + 1,
        original: {
          name: nameRaw || null,
          person_name: personName,
          company: company,
          unit: c3 || null,
          cost: c4 || null,
          cost_code: costCode,
        },
      },
    });
  }

  // Deduplicate within import payload deterministically by match key (keep last seen = workbook bottom wins).
  const byKey = new Map<string, ImportedCatalogueItem>();
  for (const it of out) byKey.set(buildCatalogueMatchKey(it), it);

  return {
    items: Array.from(byKey.values()),
    audit: { sheetName, header, groups: auditGroups, ignoredRows },
  };
}

