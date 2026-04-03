import type { MappedTask, MappedWbs } from "./types";
import type { XerTreeNodeJson } from "./types";

export function wbsPathNames(wbsId: number, byWbs: Map<number, MappedWbs>): string {
  const names: string[] = [];
  let cur: number | null = wbsId;
  for (let g = 0; g < 500 && cur != null; g++) {
    const w = byWbs.get(cur);
    if (!w) break;
    names.unshift(w.wbs_name);
    cur = w.parent_wbs_id;
  }
  return names.join(" / ");
}

/**
 * Native hierarchy: PROJWBS parent/child, TASK.wbs_id attaches activities under a WBS node.
 * Parent-first: roots are WBS with no parent; collapsed UX is client-side (default collapsed).
 */
export function buildProjectTree(wbsList: MappedWbs[], tasks: MappedTask[], projId: number): XerTreeNodeJson[] {
  const byWbs = new Map<number, MappedWbs>();
  for (const w of wbsList) {
    if (w.proj_id === projId) byWbs.set(w.wbs_id, w);
  }

  const childrenWbs = new Map<number | null, MappedWbs[]>();
  for (const w of wbsList) {
    if (w.proj_id !== projId) continue;
    const p = w.parent_wbs_id;
    const arr = childrenWbs.get(p) ?? [];
    arr.push(w);
    childrenWbs.set(p, arr);
  }
  for (const arr of Array.from(childrenWbs.values())) {
    arr.sort((a: MappedWbs, b: MappedWbs) => {
      const sa = a.seq_num ?? a.wbs_id;
      const sb = b.seq_num ?? b.wbs_id;
      if (sa !== sb) return sa - sb;
      return a.wbs_id - b.wbs_id;
    });
  }

  const tasksByWbs = new Map<number, MappedTask[]>();
  for (const t of tasks) {
    if (t.proj_id !== projId) continue;
    const arr = tasksByWbs.get(t.wbs_id) ?? [];
    arr.push(t);
    tasksByWbs.set(t.wbs_id, arr);
  }
  for (const arr of Array.from(tasksByWbs.values())) {
    arr.sort((a: MappedTask, b: MappedTask) => a.task_id - b.task_id);
  }

  const buildWbsNode = (w: MappedWbs): XerTreeNodeJson => {
    const path = wbsPathNames(w.wbs_id, byWbs);
    const childWbs = childrenWbs.get(w.wbs_id) ?? [];
    const childTasks = tasksByWbs.get(w.wbs_id) ?? [];

    const children: XerTreeNodeJson[] = [];
    for (const cw of childWbs) {
      children.push(buildWbsNode(cw));
    }
    for (const tk of childTasks) {
      children.push({
        id: `task:${tk.task_id}`,
        kind: "task",
        name: tk.task_name,
        wbsPath: path,
        nativeId: tk.task_id,
        projId: tk.proj_id,
        children: [],
        taskType: tk.task_type,
        startDate: tk.act_start || tk.target_start || tk.early_start,
        endDate: tk.act_end || tk.target_end || tk.early_end,
        calendarId: tk.calendar_id,
      });
    }

    return {
      id: `wbs:${w.wbs_id}`,
      kind: "wbs",
      name: w.wbs_name,
      wbsPath: path,
      nativeId: w.wbs_id,
      projId: w.proj_id,
      children,
    };
  };

  const a = childrenWbs.get(null) ?? [];
  const b = childrenWbs.get(0) ?? [];
  const seen = new Set(a.map((x) => x.wbs_id));
  const rootList = [...a, ...b.filter((x) => !seen.has(x.wbs_id))];

  return rootList.map(buildWbsNode);
}

/** Flatten tree for diagnostics / counts */
export function countTreeNodes(roots: XerTreeNodeJson[]): {
  wbs: number;
  tasks: number;
} {
  let wbs = 0;
  let task = 0;
  const walk = (n: XerTreeNodeJson) => {
    if (n.kind === "wbs") wbs += 1;
    else task += 1;
    for (const c of n.children) walk(c);
  };
  for (const r of roots) walk(r);
  return { wbs, tasks: task };
}
