"use client";

import type { Dispatch, SetStateAction } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ImportedTaskNode } from "@/lib/import/xml/types";
import {
  buildSubtreeIdsMap,
  flattenTree,
  subtreeSelectionStateFromSubtreeIds,
} from "@/lib/import/xml/tree-helpers";
import type { SelectionTriState } from "@/lib/import/xml/tree-helpers";
import { cn } from "@/lib/cn";

/** Virtualize when visible row count exceeds this. */
export const TREE_VIRTUALIZE_ROW_THRESHOLD = 400;
const ROW_HEIGHT = 34;

function visibleRows(
  nodes: ImportedTaskNode[],
  expanded: Set<string>,
  depth: number
): Array<{ node: ImportedTaskNode; depth: number }> {
  const out: Array<{ node: ImportedTaskNode; depth: number }> = [];
  for (const n of nodes) {
    out.push({ node: n, depth });
    if (expanded.has(n.id) && n.children.length > 0) {
      out.push(...visibleRows(n.children, expanded, depth + 1));
    }
  }
  return out;
}

const TreeRow = memo(function TreeRow({
  node,
  depth,
  expanded,
  onToggleExpand,
  onToggleSelect,
  tri,
}: {
  node: ImportedTaskNode;
  depth: number;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (node: ImportedTaskNode) => void;
  tri: SelectionTriState;
}) {
  const hasChildren = node.children.length > 0;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (el) el.indeterminate = tri === "indeterminate";
  }, [tri]);

  return (
    <div
      className={cn(
        "flex min-h-[32px] items-center gap-1 border-b border-dashboard-border/60 text-dashboard-sm",
        node.synthetic && "text-dashboard-text-muted italic"
      )}
      style={{ paddingLeft: depth * 14, minHeight: ROW_HEIGHT }}
    >
      <div className="flex w-6 shrink-0 justify-center">
        {hasChildren ? (
          <button
            type="button"
            className="rounded-dashboard-sm px-0.5 text-dashboard-text-muted hover:bg-dashboard-bg hover:text-dashboard-text-primary"
            onClick={() => onToggleExpand(node.id)}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="inline-block w-4" aria-hidden />
        )}
      </div>
      <input
        ref={inputRef}
        type="checkbox"
        className="h-4 w-4 shrink-0 rounded border-dashboard-border"
        checked={tri === "checked"}
        onChange={() => onToggleSelect(node)}
        aria-label={`Select ${node.name}`}
      />
      <span className="w-[7rem] shrink-0 font-mono text-[11px] text-dashboard-text-muted tabular-nums">
        {node.wbs === "__unstructured__" ? "—" : node.wbs}
      </span>
      <span className="min-w-0 flex-1 truncate text-dashboard-text-primary" title={node.name}>
        {node.name}
      </span>
      {node.summary && !node.synthetic && node.children.length > 0 && (
        <span className="shrink-0 rounded-dashboard-sm bg-dashboard-bg px-1.5 py-0.5 text-[10px] font-medium uppercase text-dashboard-text-muted">
          Sum
        </span>
      )}
      {node.duplicateGroup && (
        <span className="shrink-0 rounded-dashboard-sm bg-dashboard-bg px-1.5 py-0.5 text-[10px] font-medium uppercase text-dashboard-text-muted">
          Dup
        </span>
      )}
    </div>
  );
});

function VirtualTreeRows({
  rows,
  rowTriStates,
  effectiveExpanded,
  toggleExpand,
  onToggleSelect,
}: {
  rows: Array<{ node: ImportedTaskNode; depth: number }>;
  rowTriStates: Map<string, SelectionTriState>;
  effectiveExpanded: Set<string>;
  toggleExpand: (id: string) => void;
  onToggleSelect: (node: ImportedTaskNode) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div ref={parentRef} className="relative min-h-0 flex-1 overflow-auto">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const row = rows[vi.index];
          if (!row) return null;
          const { node, depth } = row;
          return (
            <div
              key={node.id}
              className="absolute left-0 top-0 w-full"
              style={{
                height: vi.size,
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <TreeRow
                node={node}
                depth={depth}
                expanded={effectiveExpanded.has(node.id)}
                onToggleExpand={toggleExpand}
                onToggleSelect={onToggleSelect}
                tri={rowTriStates.get(node.id) ?? "unchecked"}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TaskTreeSelector({
  roots,
  selectedIds,
  setSelectedIds,
  searchQuery,
  onSearchChange,
  totalParsed,
  leafSelectedCount,
}: {
  roots: ImportedTaskNode[];
  selectedIds: Set<string>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  totalParsed: number;
  leafSelectedCount: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const searchActive = searchQuery.trim().length > 0;

  const displayRoots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return roots;
    const filterNode = (n: ImportedTaskNode): ImportedTaskNode | null => {
      const selfMatch =
        n.wbs.toLowerCase().includes(q) || n.name.toLowerCase().includes(q);
      const childFiltered = n.children
        .map(filterNode)
        .filter((x): x is ImportedTaskNode => x != null);
      if (selfMatch || childFiltered.length > 0) {
        return { ...n, children: childFiltered };
      }
      return null;
    };
    return roots.map(filterNode).filter((x): x is ImportedTaskNode => x != null);
  }, [roots, searchQuery]);

  const effectiveExpanded = useMemo(() => {
    if (!searchActive) return expanded;
    return new Set(flattenTree(displayRoots).map((n) => n.id));
  }, [searchActive, expanded, displayRoots]);

  const rows = useMemo(
    () => visibleRows(displayRoots, effectiveExpanded, 0),
    [displayRoots, effectiveExpanded]
  );

  const subtreeIdsByNodeId = useMemo(() => buildSubtreeIdsMap(roots), [roots]);

  const rowTriStates = useMemo(() => {
    const m = new Map<string, SelectionTriState>();
    for (const { node } of rows) {
      const ids = subtreeIdsByNodeId.get(node.id);
      if (ids) {
        m.set(node.id, subtreeSelectionStateFromSubtreeIds(ids, selectedIds));
      }
    }
    return m;
  }, [rows, subtreeIdsByNodeId, selectedIds]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpanded(new Set(flattenTree(roots).map((n) => n.id)));
  }, [roots]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(flattenTree(roots).map((n) => n.id)));
  }, [roots, setSelectedIds]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, [setSelectedIds]);

  const onToggleSelect = useCallback(
    (node: ImportedTaskNode) => {
      const subtree = subtreeIdsByNodeId.get(node.id);
      if (!subtree) return;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const allOn = subtree.every((id) => next.has(id));
        if (allOn) subtree.forEach((id) => next.delete(id));
        else subtree.forEach((id) => next.add(id));
        return next;
      });
    },
    [setSelectedIds, subtreeIdsByNodeId]
  );

  const selectedCount = selectedIds.size;
  const visibleRowCount = rows.length;
  const useVirtual = visibleRowCount >= TREE_VIRTUALIZE_ROW_THRESHOLD;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search WBS or name…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="min-w-[12rem] flex-1 rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm text-dashboard-text-primary placeholder:text-dashboard-text-muted focus:outline-none focus:ring-2 focus:ring-[#5B5FEF]/25"
        />
        <button
          type="button"
          onClick={expandAll}
          className="rounded-dashboard-sm border border-dashboard-border bg-dashboard-bg px-2 py-1 text-dashboard-xs font-medium text-dashboard-text-secondary hover:bg-dashboard-border/40"
        >
          Expand all
        </button>
        <button
          type="button"
          onClick={collapseAll}
          className="rounded-dashboard-sm border border-dashboard-border bg-dashboard-bg px-2 py-1 text-dashboard-xs font-medium text-dashboard-text-secondary hover:bg-dashboard-border/40"
        >
          Collapse all
        </button>
        <button
          type="button"
          onClick={selectAll}
          className="rounded-dashboard-sm border border-dashboard-border bg-dashboard-bg px-2 py-1 text-dashboard-xs font-medium text-dashboard-text-secondary hover:bg-dashboard-border/40"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={deselectAll}
          className="rounded-dashboard-sm border border-dashboard-border bg-dashboard-bg px-2 py-1 text-dashboard-xs font-medium text-dashboard-text-secondary hover:bg-dashboard-border/40"
        >
          Deselect all
        </button>
      </div>
      <div className="text-dashboard-xs text-dashboard-text-muted">
        {totalParsed} parsed · {selectedCount} nodes selected · {leafSelectedCount} leaf tasks to import
        {searchActive ? ` · ${visibleRowCount} visible rows` : ""}
        {useVirtual ? ` · virtualized` : ""}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-dashboard-md border border-dashboard-border bg-dashboard-bg/30">
        {rows.length === 0 ? (
          <div className="p-6 text-center text-dashboard-sm text-dashboard-text-muted">No tasks match.</div>
        ) : useVirtual ? (
          <VirtualTreeRows
            rows={rows}
            rowTriStates={rowTriStates}
            effectiveExpanded={effectiveExpanded}
            toggleExpand={toggleExpand}
            onToggleSelect={onToggleSelect}
          />
        ) : (
          <div className="max-h-full overflow-auto">
            {rows.map(({ node, depth }) => (
              <TreeRow
                key={node.id}
                node={node}
                depth={depth}
                expanded={effectiveExpanded.has(node.id)}
                onToggleExpand={toggleExpand}
                onToggleSelect={onToggleSelect}
                tri={rowTriStates.get(node.id) ?? "unchecked"}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
