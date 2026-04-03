import type { XerRawDocument, XerRawTable } from "./types";

/**
 * Primavera P6 XER is line-oriented: %T (table), %F (fields), %R (records), %E (end).
 * Fields and values are tab-separated.
 */
export function parseXerRaw(text: string): XerRawDocument {
  const warnings: string[] = [];
  const tables = new Map<string, XerRawTable>();

  const lines = text.split(/\r?\n/);
  let currentTableName: string | null = null;

  const ensureTable = (name: string): XerRawTable => {
    let t = tables.get(name);
    if (!t) {
      t = { name, fields: [], rows: [] };
      tables.set(name, t);
    }
    return t;
  };

  for (const line of lines) {
    if (line.length === 0) continue;
    const tag = line.slice(0, 2);

    if (tag === "%T") {
      currentTableName = line.slice(2).trim();
      if (currentTableName) ensureTable(currentTableName);
      continue;
    }
    if (tag === "%F") {
      if (!currentTableName) {
        warnings.push("Ignored %F: no prior %T");
        continue;
      }
      const t = ensureTable(currentTableName);
      t.fields = splitXerRecord(line.slice(2));
      continue;
    }
    if (tag === "%R") {
      if (!currentTableName) {
        warnings.push("Ignored %R: no prior %T");
        continue;
      }
      const t = ensureTable(currentTableName);
      if (t.fields.length === 0) {
        warnings.push(`Ignored %R in ${currentTableName}: no %F yet`);
        continue;
      }
      const values = splitXerRecord(line.slice(2));
      t.rows.push(padRowToFields(values, t.fields.length));
      continue;
    }
    if (tag === "%E") {
      currentTableName = null;
      continue;
    }
  }

  return { tables, warnings };
}

function splitXerRecord(line: string): string[] {
  if (line.length === 0) return [];
  return line.split("\t");
}

function padRowToFields(values: string[], len: number): string[] {
  if (values.length >= len) return values.slice(0, len);
  const out = values.slice();
  while (out.length < len) out.push("");
  return out;
}

export function findTable(doc: XerRawDocument, ...names: string[]): XerRawTable | undefined {
  const keys = new Map<string, string>();
  for (const k of Array.from(doc.tables.keys())) {
    keys.set(k.toUpperCase(), k);
  }
  for (const n of names) {
    const real = keys.get(n.toUpperCase());
    if (real) return doc.tables.get(real);
  }
  return undefined;
}
