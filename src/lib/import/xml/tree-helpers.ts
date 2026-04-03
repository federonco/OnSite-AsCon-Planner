import type { ImportedTaskNode, ParseWarning } from "./types";
import { parentWbsFromWbs } from "./build-wbs-tree";

export function flattenTree(nodes: ImportedTaskNode[]): ImportedTaskNode[] {
  const out: ImportedTaskNode[] = [];
  const walk = (n: ImportedTaskNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

/** True if this row should be persisted as a planner activity (importable leaf). */
export function isImportLeaf(node: ImportedTaskNode): boolean {
  if (node.synthetic) return false;
  if (node.duplicateGroup) return false;
  // Structural leaf in the built tree — many MS Project XML exports mark every row Summary=1 incorrectly
  return node.children.length === 0;
}

/** All ids in subtree including `node` (for checkbox selection). */
export function getSubtreeIds(node: ImportedTaskNode): string[] {
  const ids: string[] = [];
  const walk = (n: ImportedTaskNode) => {
    ids.push(n.id);
    n.children.forEach(walk);
  };
  walk(node);
  return ids;
}

/** Precompute full subtree ids per node id from the unfiltered tree (stable across search). */
export function buildSubtreeIdsMap(roots: ImportedTaskNode[]): Map<string, readonly string[]> {
  const m = new Map<string, string[]>();
  const dfs = (n: ImportedTaskNode): string[] => {
    const ids: string[] = [n.id];
    for (const c of n.children) {
      ids.push(...dfs(c));
    }
    m.set(n.id, ids);
    return ids;
  };
  roots.forEach((r) => dfs(r));
  return m;
}

/** Strict descendants only (excludes `node`). */
export function getDescendantIds(node: ImportedTaskNode): string[] {
  const ids: string[] = [];
  const walk = (n: ImportedTaskNode) => {
    n.children.forEach((c) => {
      ids.push(c.id);
      walk(c);
    });
  };
  walk(node);
  return ids;
}

export function getLeafNodesInSubtree(node: ImportedTaskNode): ImportedTaskNode[] {
  const out: ImportedTaskNode[] = [];
  const walk = (n: ImportedTaskNode) => {
    if (isImportLeaf(n)) out.push(n);
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

export function getLeafNodes(roots: ImportedTaskNode[]): ImportedTaskNode[] {
  const out: ImportedTaskNode[] = [];
  roots.forEach((r) => out.push(...getLeafNodesInSubtree(r)));
  return out;
}

export function filterTreeBySearch(roots: ImportedTaskNode[], query: string): ImportedTaskNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return roots;

  const filterNode = (n: ImportedTaskNode): ImportedTaskNode | null => {
    const selfMatch =
      n.wbs.toLowerCase().includes(q) || n.name.toLowerCase().includes(q);
    const childFiltered = n.children.map(filterNode).filter((x): x is ImportedTaskNode => x != null);
    if (selfMatch || childFiltered.length > 0) {
      return { ...n, children: childFiltered };
    }
    return null;
  };

  return roots.map(filterNode).filter((x): x is ImportedTaskNode => x != null);
}

export function buildNodeIndex(roots: ImportedTaskNode[]): Map<string, ImportedTaskNode> {
  const m = new Map<string, ImportedTaskNode>();
  const walk = (n: ImportedTaskNode) => {
    m.set(n.id, n);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return m;
}

/** Breadcrumb using parentId chain (works with duplicate WBS groups). */
export function breadcrumbForNode(node: ImportedTaskNode, byId: Map<string, ImportedTaskNode>): string {
  const parts: string[] = [];
  let cur: ImportedTaskNode | undefined = node;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    parts.unshift(cur.name);
    const pid = cur.parentId;
    if (!pid) break;
    cur = byId.get(pid);
  }
  return parts.join(" / ");
}

/** Legacy WBS-segment breadcrumb when parentId is unavailable. */
export function breadcrumbForNodeByWbsSegments(
  node: ImportedTaskNode,
  byWbs: Map<string, ImportedTaskNode>
): string {
  const parts: string[] = [];
  let w: string | null = node.wbs;
  const guard = new Set<string>();
  while (w && !guard.has(w)) {
    guard.add(w);
    const n = byWbs.get(w);
    if (!n) break;
    parts.unshift(n.name);
    if (w === "__unstructured__") break;
    w = parentWbsFromWbs(w);
  }
  return parts.join(" / ");
}

export type SelectionTriState = "checked" | "unchecked" | "indeterminate";

export function subtreeSelectionState(node: ImportedTaskNode, selectedIds: Set<string>): SelectionTriState {
  const ids = getSubtreeIds(node);
  return subtreeSelectionStateFromSubtreeIds(ids, selectedIds);
}

export function subtreeSelectionStateFromSubtreeIds(
  subtreeIds: readonly string[],
  selectedIds: Set<string>
): SelectionTriState {
  let sel = 0;
  for (let i = 0; i < subtreeIds.length; i++) {
    if (selectedIds.has(subtreeIds[i]!)) sel++;
  }
  if (sel === 0) return "unchecked";
  if (sel === subtreeIds.length) return "checked";
  return "indeterminate";
}

export function countWarningsByCode(warnings: ParseWarning[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const w of warnings) {
    m[w.code] = (m[w.code] ?? 0) + 1;
  }
  return m;
}
