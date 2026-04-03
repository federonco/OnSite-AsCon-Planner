import type { ImportedTaskNode } from "@/lib/import/xml/types";
import type { XerTreeNodeJson } from "./types";

function mapOne(n: XerTreeNodeJson, depth: number, parentId: string | null): ImportedTaskNode {
  if (n.kind === "task") {
    return {
      id: n.id,
      uid: n.nativeId,
      wbs: n.wbsPath || "—",
      name: n.name,
      start: n.startDate ?? null,
      finish: n.endDate ?? null,
      summary: false,
      milestone: n.taskType === "TT_Mile",
      active: true,
      synthetic: false,
      children: [],
      parentWbs: null,
      parentId,
      depth,
      percentComplete: 0,
    };
  }
  const children = n.children.map((c) => mapOne(c, depth + 1, n.id));
  return {
    id: n.id,
    wbs: n.wbsPath || "—",
    name: n.name,
    start: null,
    finish: null,
    summary: true,
    milestone: false,
    active: true,
    synthetic: false,
    children,
    parentWbs: null,
    parentId,
    depth,
  };
}

/** Bridge XER tree to existing TaskTreeSelector / ImportReview (XML-shaped nodes). */
export function xerTreeToImportedRoots(roots: XerTreeNodeJson[]): ImportedTaskNode[] {
  return roots.map((r) => mapOne(r, 0, null));
}

export function indexImportedById(roots: ImportedTaskNode[]): Map<string, ImportedTaskNode> {
  const m = new Map<string, ImportedTaskNode>();
  const walk = (n: ImportedTaskNode) => {
    m.set(n.id, n);
    for (const c of n.children) walk(c);
  };
  roots.forEach(walk);
  return m;
}
