"use client";

import { useState, useRef } from "react";

interface ShapefileLoaderProps {
  onLoaded: (geojson: GeoJSON.FeatureCollection) => void;
}

export default function ShapefileLoader({ onLoaded }: ShapefileLoaderProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      // Find .shp and .dbf files
      let shpFile: File | null = null;
      let dbfFile: File | null = null;

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const ext = f.name.split(".").pop()?.toLowerCase();
        if (ext === "shp") shpFile = f;
        if (ext === "dbf") dbfFile = f;
      }

      if (!shpFile) {
        setError("No .shp file found. Please select a .shp file.");
        setLoading(false);
        return;
      }

      setFileName(shpFile.name);

      // Read files as ArrayBuffers
      const shpBuffer = await shpFile.arrayBuffer();
      const dbfBuffer = dbfFile ? await dbfFile.arrayBuffer() : undefined;

      // Dynamic import shapefile library
      const shapefile = await import("shapefile");

      // Parse shapefile to GeoJSON
      const source = await shapefile.open(shpBuffer, dbfBuffer);
      const features: GeoJSON.Feature[] = [];

      let result = await source.read();
      while (!result.done) {
        features.push(result.value);
        result = await source.read();
      }

      if (features.length === 0) {
        setError("Shapefile is empty — no features found.");
        setLoading(false);
        return;
      }

      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features,
      };

      onLoaded(geojson);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to parse shapefile");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFileName(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-full">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
        Design Alignment
      </h3>

      {fileName ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-green-400 text-sm">✓</span>
            <span className="text-sm text-gray-300 truncate">{fileName}</span>
          </div>
          <button
            onClick={handleClear}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Clear & reload
          </button>
        </div>
      ) : (
        <>
          <label className="block cursor-pointer">
            <div className="border-2 border-dashed border-gray-600 rounded-lg p-4 text-center hover:border-blue-500 transition-colors">
              <div className="text-2xl mb-1">📂</div>
              <p className="text-sm text-gray-400">
                {loading ? "Parsing..." : "Drop .shp + .dbf or click to browse"}
              </p>
              <p className="text-xs text-gray-600 mt-1">Shapefile format</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".shp,.dbf,.prj,.shx"
              multiple
              onChange={handleFiles}
              className="hidden"
              disabled={loading}
            />
          </label>
        </>
      )}

      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </div>
  );
}
