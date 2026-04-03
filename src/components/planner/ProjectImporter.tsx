"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compareWbs } from "@/lib/import/xml/build-wbs-tree";
import {
  breadcrumbForNode,
  filterTreeBySearch,
  flattenTree,
  getLeafNodes,
  isImportLeaf,
} from "@/lib/import/xml/tree-helpers";
import type { ImportedTaskNode, MsProjectFlatTask, ParseWarning } from "@/lib/import/xml/types";
import TaskTreeSelector from "@/components/planner/import/TaskTreeSelector";
import ImportReview from "@/components/planner/import/ImportReview";
import type { DrainerSectionListItem } from "@/lib/planner-types";
import { xerTreeToImportedRoots, indexImportedById } from "@/lib/import/xer/xer-to-imported-node";
import { xerTasksToFlatTasks } from "@/lib/import/xer/xer-msproject-adapter";
import type { MappedTaskWithPath } from "@/lib/import/xer/xer-msproject-adapter";

interface Crew {
  id: string;
  name: string;
}

interface ProjectImporterProps {
  crews: Crew[];
  onImported: () => void;
  onClose: () => void;
}

const PANEL_MIN_W = 360;
const PANEL_MIN_H = 280;

function clampPanelSize(width: number, height: number) {
  if (typeof window === "undefined") {
    return { width: Math.max(PANEL_MIN_W, width), height: Math.max(PANEL_MIN_H, height) };
  }
  const maxW = window.innerWidth - 32;
  const maxH = window.innerHeight - 32;
  return {
    width: Math.min(Math.max(width, PANEL_MIN_W), maxW),
    height: Math.min(Math.max(height, PANEL_MIN_H), maxH),
  };
}

export default function ProjectImporter({ crews, onImported, onClose }: ProjectImporterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [crewId, setCrewId] = useState(crews[0]?.id || "");
  const [mode, setMode] = useState<"editable" | "baseline">("editable");
  const [drainerSectionId, setDrainerSectionId] = useState<string>("");
  const [sections, setSections] = useState<DrainerSectionListItem[]>([]);

  const [roots, setRoots] = useState<ImportedTaskNode[] | null>(null);
  const [byId, setById] = useState<Map<string, ImportedTaskNode>>(() => new Map());
  const [parseWarnings, setParseWarnings] = useState<ParseWarning[]>([]);
  const [flatTasks, setFlatTasks] = useState<MsProjectFlatTask[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [xerDiag, setXerDiag] = useState<{
    projects: number;
    wbsNodes: number;
    tasks: number;
    preds: number;
    calendars: number;
  } | null>(null);

  const [step, setStep] = useState<"upload" | "tree" | "review">("upload");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [taskSearch, setTaskSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMetaFallback, setImportMetaFallback] = useState<{
    code: string;
    message: string;
    importedCount: number;
  } | null>(null);

  const [panelSize, setPanelSize] = useState({ width: 920, height: 620 });
  const resizeStartRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const fieldClass =
    "w-full rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm text-dashboard-text-primary focus:outline-none focus:ring-2 focus:ring-[#5B5FEF]/25 focus:border-dashboard-primary";

  useEffect(() => {
    const onWinResize = () => {
      setPanelSize((s) => clampPanelSize(s.width, s.height));
    };
    window.addEventListener("resize", onWinResize);
    return () => window.removeEventListener("resize", onWinResize);
  }, []);

  useEffect(() => {
    if (crews.length === 0) return;
    setCrewId((prev) => {
      if (prev && crews.some((c) => c.id === prev)) return prev;
      return crews[0].id;
    });
  }, [crews]);

  useEffect(() => {
    if (!crewId) {
      setSections([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/planner/sections?crew_id=${encodeURIComponent(crewId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setSections(Array.isArray(data.sections) ? data.sections : []);
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [crewId]);

  const parseAndBuild = useCallback(async (f: File) => {
    setParseError(null);
    setError(null);
    setXerDiag(null);
    const formData = new FormData();
    formData.append("file", f);
    formData.append("import_flow", "xer_preview");
    const res = await fetch("/api/planner/import", { method: "POST", body: formData });
    const data = (await res.json()) as {
      error?: string;
      tree?: import("@/lib/import/xer/types").XerTreeNodeJson[];
      tasks?: MappedTaskWithPath[];
      preds?: import("@/lib/import/xer/types").MappedTaskPred[];
      warnings?: string[];
      diagnostics?: {
        projects: number;
        wbsNodes: number;
        tasks: number;
        preds: number;
        calendars: number;
      };
    };
    if (!res.ok) {
      setParseError(data.error || "Could not parse XER file");
      setRoots(null);
      return;
    }
    const treeJson = data.tree ?? [];
    const tasks = data.tasks ?? [];
    const preds = data.preds ?? [];
    if (treeJson.length === 0 && tasks.length === 0) {
      setParseError("No usable tasks found in this XER (check PROJECT / PROJWBS / TASK).");
      setRoots(null);
      return;
    }
    const r = xerTreeToImportedRoots(treeJson);
    setRoots(r);
    setById(indexImportedById(r));
    setFlatTasks(xerTasksToFlatTasks(tasks as MappedTaskWithPath[], preds));
    const w = (data.warnings ?? []).map((msg) => ({
      code: "xer_note" as const,
      message: msg,
    }));
    setParseWarnings(w);
    setXerDiag(data.diagnostics ?? null);
    setSelectedIds(new Set(flattenTree(r).map((n) => n.id)));
    setTaskSearch("");
    setStep("tree");
  }, []);

  const handleFileChange = async (f: File | null) => {
    setFile(f);
    setRoots(null);
    setFlatTasks([]);
    setStep("upload");
    setError(null);
    setImportMetaFallback(null);
    if (!f) return;
    setLoading(true);
    try {
      await parseAndBuild(f);
    } finally {
      setLoading(false);
    }
  };

  const leafNodeSet = useMemo(() => new Set(getLeafNodes(roots ?? []).map((n) => n.id)), [roots]);

  const flatByUid = useMemo(() => {
    const m = new Map<number, MsProjectFlatTask>();
    for (const t of flatTasks) m.set(t.uid, t);
    return m;
  }, [flatTasks]);

  const selectedLeafUidsForReview = useMemo(() => {
    const s = new Set<number>();
    for (const id of Array.from(selectedIds)) {
      const n = byId.get(id);
      if (n && n.uid != null && isImportLeaf(n)) s.add(n.uid);
    }
    return s;
  }, [selectedIds, byId]);

  const displayRootsForDiag = useMemo(
    () => filterTreeBySearch(roots ?? [], taskSearch),
    [roots, taskSearch]
  );
  const visibleTreeCount = useMemo(
    () => flattenTree(displayRootsForDiag).length,
    [displayRootsForDiag]
  );

  const leafSelectedCount = useMemo(
    () => Array.from(selectedIds).filter((id) => leafNodeSet.has(id)).length,
    [selectedIds, leafNodeSet]
  );

  const reviewRows = useMemo(() => {
    if (!roots) return [];
    const out: {
      node: ImportedTaskNode;
      breadcrumb: string;
      predecessorCount: number;
      predecessorsInImportCount: number;
    }[] = [];
    for (const id of Array.from(selectedIds)) {
      if (!leafNodeSet.has(id)) continue;
      const node = byId.get(id);
      if (!node) continue;
      const ft = flatByUid.get(node.uid!);
      const preds = ft?.predecessors ?? [];
      const predecessorsInImportCount = preds.filter((p) =>
        selectedLeafUidsForReview.has(p.predecessor_uid)
      ).length;
      out.push({
        node,
        breadcrumb: breadcrumbForNode(node, byId),
        predecessorCount: preds.length,
        predecessorsInImportCount,
      });
    }
    out.sort((a, b) => compareWbs(a.node.wbs, b.node.wbs));
    return out;
  }, [selectedIds, leafNodeSet, byId, roots, flatByUid, selectedLeafUidsForReview]);

  const closeModal = () => {
    if (importMetaFallback) onImported();
    onClose();
  };

  const handleImport = async () => {
    if (!file) {
      setError("Choose a Primavera .xer file.");
      return;
    }
    if (!crewId) {
      setError("Choose a crew.");
      return;
    }
    if (reviewRows.length === 0) {
      setError("Select at least one non-summary (leaf) task — summaries are not imported.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("crew_id", crewId);
      formData.append("mode", mode);
      formData.append("import_flow", "xer_import");
      formData.append("selected_node_ids", JSON.stringify(Array.from(selectedIds)));
      formData.append(
        "selected_leaf_uids",
        JSON.stringify(reviewRows.map((r) => r.node.uid).filter((u): u is number => u != null))
      );
      if (drainerSectionId) formData.append("drainer_section_id", drainerSectionId);

      const res = await fetch("/api/planner/import", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Import failed");
        return;
      }

      const fb = data.import_meta_fallback;
      if (
        fb &&
        typeof fb === "object" &&
        typeof (fb as { message?: unknown }).message === "string" &&
        typeof (fb as { importedCount?: unknown }).importedCount === "number"
      ) {
        const o = fb as { code?: unknown; message: string; importedCount: number };
        setImportMetaFallback({
          code: typeof o.code === "string" ? o.code : "IMPORT_META_FALLBACK_TO_NOTES",
          message: o.message,
          importedCount: o.importedCount,
        });
        return;
      }

      onImported();
      onClose();
    } catch {
      setError("Failed to import file");
    } finally {
      setLoading(false);
    }
  };

  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      w: panelSize.width,
      h: panelSize.height,
    };
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!resizeStartRef.current || (e.buttons & 1) === 0) return;
    const s = resizeStartRef.current;
    const dw = e.clientX - s.x;
    const dh = e.clientY - s.y;
    setPanelSize(clampPanelSize(s.w + dw, s.h + dh));
  };

  const handleResizePointerUp = (e: React.PointerEvent) => {
    if (resizeStartRef.current) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      resizeStartRef.current = null;
    }
  };

  const totalParsed = flatTasks.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1D2E]/40 backdrop-blur-[2px] p-4">
      <div
        className="relative flex min-h-0 w-full max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface shadow-dashboard-hover"
        style={{ width: panelSize.width, height: panelSize.height }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-dashboard-border px-6 py-4">
          <h2 className="text-dashboard-lg font-semibold text-dashboard-text-primary">Import schedule (Primavera XER)</h2>
          <button
            type="button"
            onClick={closeModal}
            className="text-xl text-dashboard-text-muted transition-colors hover:text-dashboard-text-primary"
          >
            &times;
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            <>
              <div>
                <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">
                  Primavera P6 export (.xer) *
                </label>
                <input
                  type="file"
                  accept=".xer,application/octet-stream"
                  onChange={(e) => {
                    void handleFileChange(e.target.files?.[0] || null);
                  }}
                  className={`${fieldClass} file:mr-4 file:cursor-pointer file:rounded-dashboard-sm file:border-0 file:bg-gradient-to-r file:from-[#5B5FEF] file:to-[#6D72F6] file:px-3 file:py-1.5 file:text-dashboard-sm file:font-medium file:text-white`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">Assign to Crew *</label>
                  <select
                    value={crewId}
                    onChange={(e) => setCrewId(e.target.value)}
                    className={fieldClass}
                  >
                    {crews.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">Import As</label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as "editable" | "baseline")}
                    className={fieldClass}
                  >
                    <option value="editable">Editable Plan</option>
                    <option value="baseline">Baseline (Read-only)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">
                  Section (optional)
                </label>
                <select
                  value={drainerSectionId}
                  onChange={(e) => setDrainerSectionId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">— None —</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {(parseError || error) && (
                <div className="rounded-dashboard-md border border-dashboard-status-danger/30 bg-dashboard-status-danger/10 px-4 py-2 text-dashboard-sm text-dashboard-status-danger">
                  {parseError || error}
                </div>
              )}

              {importMetaFallback && (
                <div
                  role="status"
                  className="rounded-dashboard-md border border-dashboard-status-warning/40 bg-dashboard-status-warning/10 px-4 py-3 text-dashboard-sm text-dashboard-text-primary"
                >
                  <p className="font-semibold text-dashboard-status-warning">Import completed — notice</p>
                  <p className="mt-1 text-dashboard-text-secondary">{importMetaFallback.message}</p>
                  <p className="mt-2 text-dashboard-xs text-dashboard-text-muted">
                    Code: {importMetaFallback.code} · Activities imported: {importMetaFallback.importedCount}
                  </p>
                </div>
              )}

              {step === "tree" && roots && (
                <div className="flex min-h-[320px] flex-col gap-4">
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <TaskTreeSelector
                      roots={roots}
                      selectedIds={selectedIds}
                      setSelectedIds={setSelectedIds}
                      searchQuery={taskSearch}
                      onSearchChange={setTaskSearch}
                      totalParsed={totalParsed}
                      leafSelectedCount={leafSelectedCount}
                    />
                  </div>
                </div>
              )}

              {step === "review" && roots && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-dashboard-md font-semibold text-dashboard-text-primary">Review import</h3>
                    <span className="text-dashboard-xs text-dashboard-text-muted">
                      Only leaf tasks are saved. {reviewRows.length} row(s).
                    </span>
                  </div>
                  <ImportReview
                    rows={reviewRows}
                    parseWarnings={parseWarnings}
                    diagnostics={{
                      parsedCount: flatTasks.length,
                      visibleTreeCount,
                      selectedNodeCount: selectedIds.size,
                      importableLeafCount: reviewRows.length,
                      xer: xerDiag
                        ? {
                            projects: xerDiag.projects,
                            wbsNodes: xerDiag.wbsNodes,
                            tasks: xerDiag.tasks,
                            preds: xerDiag.preds,
                            calendars: xerDiag.calendars,
                          }
                        : undefined,
                    }}
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-2">
                {!roots ? (
                  <button
                    type="button"
                    disabled
                    className="flex-1 rounded-dashboard-md bg-dashboard-bg py-2.5 text-dashboard-sm font-medium text-dashboard-text-muted"
                  >
                    {loading ? "Parsing…" : "Choose a .xer file to continue"}
                  </button>
                ) : step === "tree" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setStep("review")}
                      disabled={leafSelectedCount === 0 || loading}
                      className="flex-1 rounded-dashboard-md bg-gradient-to-r from-[#5B5FEF] to-[#6D72F6] py-2.5 text-dashboard-sm font-medium text-white shadow-dashboard-card disabled:opacity-50"
                    >
                      Review ({leafSelectedCount} leaves)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setRoots(null);
                        setStep("upload");
                        setSelectedIds(new Set());
                      }}
                      className="rounded-dashboard-md bg-dashboard-bg px-4 py-2.5 text-dashboard-sm font-medium text-dashboard-text-secondary transition-colors hover:bg-dashboard-border/50"
                    >
                      Back
                    </button>
                  </>
                ) : importMetaFallback ? (
                  <button
                    type="button"
                    onClick={() => {
                      setImportMetaFallback(null);
                      onImported();
                      onClose();
                    }}
                    className="flex-1 rounded-dashboard-md bg-gradient-to-r from-[#5B5FEF] to-[#6D72F6] py-2.5 text-dashboard-sm font-medium text-white shadow-dashboard-card"
                  >
                    OK — close
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleImport}
                      disabled={!crewId || loading || reviewRows.length === 0}
                      className="flex-1 rounded-dashboard-md bg-dashboard-status-success py-2.5 text-dashboard-sm font-medium text-white shadow-dashboard-card disabled:opacity-50"
                    >
                      {loading ? "Importing…" : `Import ${reviewRows.length} leaf task${reviewRows.length === 1 ? "" : "s"}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep("tree")}
                      className="rounded-dashboard-md bg-dashboard-bg px-4 py-2.5 text-dashboard-sm font-medium text-dashboard-text-secondary transition-colors hover:bg-dashboard-border/50"
                    >
                      Back
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-dashboard-md bg-dashboard-bg px-4 py-2.5 text-dashboard-sm font-medium text-dashboard-text-secondary transition-colors hover:bg-dashboard-border/50 hover:text-dashboard-text-primary"
                >
                  Cancel
                </button>
              </div>
            </>
        </div>

        <div className="pointer-events-none absolute inset-0 z-20 overflow-visible">
          <button
            type="button"
            aria-label="Resize dialog"
            title="Drag to resize"
            className="pointer-events-auto absolute bottom-0 right-0 left-auto top-auto m-0 flex h-6 w-6 cursor-se-resize touch-none items-end justify-end rounded-br-dashboard-lg border border-transparent bg-transparent p-0.5 text-dashboard-text-muted hover:bg-dashboard-bg/80"
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            onPointerCancel={handleResizePointerUp}
          >
            <span className="pointer-events-none flex flex-col items-end gap-[3px]" aria-hidden>
              <span className="block h-px w-3 bg-current opacity-45" />
              <span className="block h-px w-2.5 bg-current opacity-45" />
              <span className="block h-px w-2 bg-current opacity-45" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
