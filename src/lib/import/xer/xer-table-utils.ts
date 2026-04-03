import type { XerRawTable } from "./types";

export function fieldIndex(table: XerRawTable, ...candidates: string[]): number {
  const upper = table.fields.map((f) => f.trim().toUpperCase());
  for (const c of candidates) {
    const i = upper.indexOf(c.toUpperCase());
    if (i >= 0) return i;
  }
  return -1;
}

export function rowGet(row: string[], idx: number): string {
  if (idx < 0 || idx >= row.length) return "";
  return row[idx] ?? "";
}

export function parseIntSafe(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

export function parseFloatSafe(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}
