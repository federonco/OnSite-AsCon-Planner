import type { ImportedTaskNode, MsProjectFlatTask, ParseWarning } from "./types";

/** Natural sort for dotted WBS (1.2.10 after 1.2.9). */
export function compareWbs(a: string, b: string): number {
  const pa = a.split(".").filter(Boolean);
  const pb = b.split(".").filter(Boolean);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = parseInt(pa[i] ?? "0", 10);
    const nb = parseInt(pb[i] ?? "0", 10);
    const da = Number.isFinite(na) ? na : 0;
    const db = Number.isFinite(nb) ? nb : 0;
    if (da !== db) return da - db;
    const sa = pa[i] ?? "";
    const sb = pb[i] ?? "";
    if (sa !== sb) return sa.localeCompare(sb);
  }
  return 0;
}

export function parentWbsFromWbs(wbs: string): string | null {
  const parts = wbs.split(".").filter((p) => p.length > 0);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(".");
}

function wbsDepth(wbs: string): number {
  return wbs.split(".").filter(Boolean).length;
}

function syntheticName(wbs: string): string {
  if (wbs === "__unstructured__") return "Unstructured tasks";
  return `WBS ${wbs}`;
}

export function syntheticId(wbs: string): string {
  return `syn:${wbs}`;
}

export function synDupId(wbs: string): string {
  return `syn:dup:${wbs}`;
}

function realId(uid: number): string {
  return `real:${uid}`;
}

function groupByWbs(flat: MsProjectFlatTask[]): Map<string, MsProjectFlatTask[]> {
  const m = new Map<string, MsProjectFlatTask[]>();
  for (const t of flat) {
    const arr = m.get(t.wbs) ?? [];
    arr.push(t);
    m.set(t.wbs, arr);
  }
  return m;
}

function compareNodes(a: ImportedTaskNode, b: ImportedTaskNode): number {
  const w = compareWbs(a.wbs, b.wbs);
  if (w !== 0) return w;
  const ua = a.uid ?? -1;
  const ub = b.uid ?? -1;
  if (ua !== ub) return ua - ub;
  return a.id.localeCompare(b.id);
}

/**
 * Parent node id for a child whose own WBS is `wbs` (not the parent's WBS string).
 * Uses WBS segments for display hierarchy; real nodes are keyed by UID (`real:<uid>`).
 */
function resolveParentNodeId(wbs: string, group: Map<string, MsProjectFlatTask[]>): string | null {
  const pw = parentWbsFromWbs(wbs);
  if (pw == null) return null;
  const g = group.get(pw) ?? [];
  if (g.length === 0) {
    return syntheticId(pw);
  }
  if (g.length === 1) {
    return realId(g[0].uid);
  }
  return synDupId(pw);
}

/**
 * Build hierarchical tree from flat tasks. Real tasks are keyed by UID.
 * Duplicate WBS codes become siblings under a synthetic duplicate-group node.
 */
export function buildTaskTree(
  flat: MsProjectFlatTask[],
  warnings: ParseWarning[]
): {
  roots: ImportedTaskNode[];
  byId: Map<string, ImportedTaskNode>;
  byWbs: Map<string, ImportedTaskNode>;
} {
  const byId = new Map<string, ImportedTaskNode>();
  const group = groupByWbs(flat);

  const allWbsKeys = new Set<string>();
  for (const t of flat) {
    allWbsKeys.add(t.wbs);
    let p: string | null = parentWbsFromWbs(t.wbs);
    while (p) {
      allWbsKeys.add(p);
      p = parentWbsFromWbs(p);
    }
  }

  const sortedWbsKeys = Array.from(allWbsKeys).sort(compareWbs);

  for (const t of flat) {
    const node: ImportedTaskNode = {
      id: realId(t.uid),
      uid: t.uid,
      wbs: t.wbs,
      name: t.name,
      start: t.start,
      finish: t.finish,
      summary: t.summary,
      milestone: t.milestone,
      active: t.active,
      synthetic: false,
      duplicateGroup: false,
      children: [],
      parentWbs: parentWbsFromWbs(t.wbs),
      parentId: null,
      depth: 0,
      percentComplete: t.percentComplete,
    };
    byId.set(node.id, node);
  }

  for (const wbs of sortedWbsKeys) {
    const g = group.get(wbs) ?? [];
    if (g.length > 0) continue;

    const id = syntheticId(wbs);
    if (byId.has(id)) continue;
    const node: ImportedTaskNode = {
      id,
      wbs,
      name: syntheticName(wbs),
      start: null,
      finish: null,
      summary: true,
      milestone: false,
      active: true,
      synthetic: true,
      duplicateGroup: false,
      children: [],
      parentWbs: parentWbsFromWbs(wbs),
      parentId: null,
      depth: 0,
    };
    byId.set(id, node);
    warnings.push({
      code: "missing_parent",
      message: `Synthetic node created for missing WBS "${wbs}"`,
      wbs,
    });
  }

  for (const wbs of sortedWbsKeys) {
    const g = group.get(wbs) ?? [];
    if (g.length <= 1) continue;

    const dupId = synDupId(wbs);
    if (byId.has(dupId)) continue;

    const exampleNames = Array.from(
      new Set(
        g
          .map((t) => t.name.trim())
          .filter((n) => n.length > 0)
      )
    ).slice(0, 2);
    const exampleLabel =
      exampleNames.length === 0
        ? ""
        : ` – ${exampleNames.join(", ")}${g.length > exampleNames.length ? " …" : ""}`;

    const node: ImportedTaskNode = {
      id: dupId,
      wbs,
      name: `WBS ${wbs} (${g.length} tasks)${exampleLabel}`,
      start: null,
      finish: null,
      summary: true,
      milestone: false,
      active: true,
      synthetic: true,
      duplicateGroup: true,
      children: [],
      parentWbs: parentWbsFromWbs(wbs),
      parentId: null,
      depth: 0,
    };
    byId.set(dupId, node);
  }

  const roots: ImportedTaskNode[] = [];

  function clearLinks() {
    roots.length = 0;
    Array.from(byId.values()).forEach((n) => {
      n.children = [];
      n.parentId = null;
    });
  }

  function linkChild(parentId: string | null, child: ImportedTaskNode) {
    child.parentId = parentId;
    if (parentId) {
      const p = byId.get(parentId);
      if (p) p.children.push(child);
      else roots.push(child);
    } else {
      roots.push(child);
    }
  }

  clearLinks();

  const attachOrder = Array.from(byId.keys()).sort((a, b) => {
    const na = byId.get(a)!;
    const nb = byId.get(b)!;
    const da = wbsDepth(na.wbs);
    const db = wbsDepth(nb.wbs);
    if (da !== db) return da - db;
    const prio = (n: ImportedTaskNode) => (n.duplicateGroup ? 0 : n.synthetic && !n.duplicateGroup ? 1 : 2);
    return prio(na) - prio(nb) || compareNodes(na, nb);
  });

  for (const id of attachOrder) {
    const node = byId.get(id)!;
    let parentId: string | null;

    if (node.duplicateGroup || (node.synthetic && !node.duplicateGroup)) {
      parentId = resolveParentNodeId(node.wbs, group);
    } else {
      const g = group.get(node.wbs) ?? [];
      parentId = g.length > 1 ? synDupId(node.wbs) : resolveParentNodeId(node.wbs, group);
    }

    linkChild(parentId, node);
  }

  function sortChildren(n: ImportedTaskNode) {
    n.children.sort(compareNodes);
    n.children.forEach(sortChildren);
  }
  roots.sort(compareNodes);
  roots.forEach(sortChildren);

  function setDepth(n: ImportedTaskNode, d: number) {
    n.depth = d;
    n.children.forEach((c) => setDepth(c, d + 1));
  }
  roots.forEach((r) => setDepth(r, 0));

  const byWbs = new Map<string, ImportedTaskNode>();
  for (const wbs of sortedWbsKeys) {
    const g = group.get(wbs) ?? [];
    if (g.length > 1) {
      const d = byId.get(synDupId(wbs));
      if (d) byWbs.set(wbs, d);
    } else if (g.length === 1) {
      const r = byId.get(realId(g[0].uid));
      if (r) byWbs.set(wbs, r);
    } else {
      const s = byId.get(syntheticId(wbs));
      if (s) byWbs.set(wbs, s);
    }
  }

  return { roots, byId, byWbs };
}
