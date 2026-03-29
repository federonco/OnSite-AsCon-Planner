"use client";

import { useState } from "react";
import { ParsedProjectTask } from "@/lib/planner-types";

interface Crew {
  id: string;
  name: string;
}

interface ProjectImporterProps {
  crews: Crew[];
  onImported: () => void;
  onClose: () => void;
}

export default function ProjectImporter({ crews, onImported, onClose }: ProjectImporterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [crewId, setCrewId] = useState(crews[0]?.id || "");
  const [mode, setMode] = useState<"editable" | "baseline">("editable");
  const [previewTasks, setPreviewTasks] = useState<ParsedProjectTask[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; dependencies_imported: number } | null>(null);

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("preview", "true");

      const res = await fetch("/api/planner/import", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Preview failed");
        return;
      }

      setPreviewTasks(data.tasks);
    } catch {
      setError("Failed to preview file");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !crewId) return;
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("crew_id", crewId);
      formData.append("mode", mode);

      const res = await fetch("/api/planner/import", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Import failed");
        return;
      }

      setResult(data);
      onImported();
    } catch {
      setError("Failed to import file");
    } finally {
      setLoading(false);
    }
  };

  const fieldClass =
    "w-full rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm text-dashboard-text-primary focus:outline-none focus:ring-2 focus:ring-[#5B5FEF]/25 focus:border-dashboard-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1D2E]/40 backdrop-blur-[2px]">
      <div className="mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface shadow-dashboard-hover">
        <div className="flex items-center justify-between border-b border-dashboard-border px-6 py-4">
          <h2 className="text-dashboard-lg font-semibold text-dashboard-text-primary">Import MS Project XML</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xl text-dashboard-text-muted transition-colors hover:text-dashboard-text-primary"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {result ? (
            <div className="space-y-3 text-center">
              <div className="text-dashboard-lg font-medium text-dashboard-status-success">Import Successful</div>
              <p className="text-dashboard-sm text-dashboard-text-secondary">
                {result.imported} activities imported, {result.dependencies_imported} dependencies created.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="rounded-dashboard-md bg-gradient-to-r from-[#5B5FEF] to-[#6D72F6] px-6 py-2.5 text-dashboard-sm font-medium text-white shadow-dashboard-card"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              {/* File upload */}
              <div>
                <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">Project XML File *</label>
                <input
                  type="file"
                  accept=".xml"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] || null);
                    setPreviewTasks(null);
                    setError(null);
                  }}
                  className={`${fieldClass} file:mr-4 file:cursor-pointer file:rounded-dashboard-sm file:border-0 file:bg-gradient-to-r file:from-[#5B5FEF] file:to-[#6D72F6] file:px-3 file:py-1.5 file:text-dashboard-sm file:font-medium file:text-white`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">Assign to Crew *</label>
                  <select value={crewId} onChange={(e) => setCrewId(e.target.value)} className={fieldClass}>
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

              {error && (
                <div className="rounded-dashboard-md border border-dashboard-status-danger/30 bg-dashboard-status-danger/10 px-4 py-2 text-dashboard-sm text-dashboard-status-danger">
                  {error}
                </div>
              )}

              {/* Preview table */}
              {previewTasks && (
                <div>
                  <div className="mb-2 text-dashboard-sm text-dashboard-text-muted">
                    {previewTasks.length} tasks found ({previewTasks.filter((t) => t.is_summary).length} summary,{" "}
                    {previewTasks.filter((t) => !t.is_summary).length} leaf)
                  </div>
                  <div className="max-h-60 overflow-y-auto rounded-dashboard-md border border-dashboard-border">
                    <table className="w-full text-dashboard-sm">
                      <thead className="sticky top-0 bg-dashboard-bg">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-dashboard-text-muted">WBS</th>
                          <th className="px-3 py-2 text-left font-medium text-dashboard-text-muted">Name</th>
                          <th className="px-3 py-2 text-left font-medium text-dashboard-text-muted">Start</th>
                          <th className="px-3 py-2 text-left font-medium text-dashboard-text-muted">End</th>
                          <th className="px-3 py-2 text-left font-medium text-dashboard-text-muted">Days</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewTasks.map((task) => (
                          <tr
                            key={task.uid}
                            className={`border-t border-dashboard-border ${
                              task.is_summary
                                ? "font-medium text-dashboard-text-primary"
                                : "text-dashboard-text-secondary"
                            }`}
                          >
                            <td className="px-3 py-1.5">{task.wbs_code}</td>
                            <td className="px-3 py-1.5" style={{ paddingLeft: `${task.outline_level * 16 + 12}px` }}>
                              {task.name}
                            </td>
                            <td className="px-3 py-1.5">{task.start_date}</td>
                            <td className="px-3 py-1.5">{task.end_date}</td>
                            <td className="px-3 py-1.5">{task.duration_days}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                {!previewTasks ? (
                  <button
                    type="button"
                    onClick={handlePreview}
                    disabled={!file || loading}
                    className="flex-1 rounded-dashboard-md bg-gradient-to-r from-[#5B5FEF] to-[#6D72F6] py-2.5 text-dashboard-sm font-medium text-white shadow-dashboard-card transition-[filter,opacity] hover:brightness-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? "Parsing..." : "Preview"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={!crewId || loading}
                    className="flex-1 rounded-dashboard-md bg-dashboard-status-success py-2.5 text-dashboard-sm font-medium text-white shadow-dashboard-card transition-[filter,opacity] hover:brightness-[1.05] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? "Importing..." : `Import ${previewTasks.length} Tasks`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-dashboard-md bg-dashboard-bg px-4 py-2.5 text-dashboard-sm font-medium text-dashboard-text-secondary transition-colors hover:bg-dashboard-border/50 hover:text-dashboard-text-primary"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
