"use client";

import { useState, useRef } from "react";
import type { GeneratedSegment } from "@/lib/geo-utils";

interface ExcelImporterProps {
  sectionId: string;
  onImportComplete: () => void;
}

interface PreviewData {
  totalSegments: number;
  chainageRange: string;
  segments: GeneratedSegment[];
}

export default function ExcelImporter({ sectionId, onImportComplete }: ExcelImporterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setError(null);
    setPreview(null);

    // Preview: parse on client to show stats before confirming
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", selected);
      formData.append("section_id", sectionId);
      formData.append("preview", "true");

      const res = await fetch("/api/import", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to parse Excel");

      setPreview(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to parse");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("section_id", sectionId);
      formData.append("preview", "false");

      const res = await fetch("/api/import", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Import failed");

      setFile(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      onImportComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-full">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
        Import Alignment
      </h3>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileSelect}
        className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer"
      />

      {loading && <p className="text-sm text-blue-400 mt-2">Processing...</p>}
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}

      {preview && (
        <div className="mt-3 space-y-2">
          <div className="text-sm text-gray-300">
            <strong>{preview.totalSegments}</strong> segments generated
          </div>
          <div className="text-xs text-gray-500">{preview.chainageRange}</div>

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleConfirmImport}
              disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-3 rounded transition-colors disabled:opacity-50"
            >
              Confirm Import
            </button>
            <button
              onClick={handleCancel}
              disabled={loading}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium py-2 px-3 rounded transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
