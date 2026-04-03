import type { XerTreeNodeJson } from "./types";

/** All task ids in a subtree rooted at `node` (including tasks under child WBS). */
export function collectTaskIdsInSubtree(node: XerTreeNodeJson): Set<number> {
  const ids = new Set<number>();
  const walk = (n: XerTreeNodeJson) => {
    if (n.kind === "task") ids.add(n.nativeId);
    for (const c of n.children) walk(c);
  };
  walk(node);
  return ids;
}

export function findNodeById(roots: XerTreeNodeJson[], id: string): XerTreeNodeJson | null {
  for (const r of roots) {
    const f = findNodeInTree(r, id);
    if (f) return f;
  }
  return null;
}

function findNodeInTree(n: XerTreeNodeJson, id: string): XerTreeNodeJson | null {
  if (n.id === id) return n;
  for (const c of n.children) {
    const x = findNodeInTree(c, id);
    if (x) return x;
  }
  return null;
}

/**
 * Given selected node ids (wbs:* and task:*), return Primavera task ids to import.
 */
export function taskIdsFromNodeSelection(roots: XerTreeNodeJson[], selectedIds: Set<string>): number[] {
  const out = new Set<number>();
  for (const sid of Array.from(selectedIds)) {
    const node = findNodeById(roots, sid);
    if (!node) continue;
    if (node.kind === "task") {
      out.add(node.nativeId);
    } else {
      for (const tid of Array.from(collectTaskIdsInSubtree(node))) out.add(tid);
    }
  }
  return Array.from(out);
}
