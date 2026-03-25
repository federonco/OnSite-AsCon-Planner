"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import ViewportControls from "@/components/tracker/ViewportControls";
import LookaheadPanel from "@/components/tracker/LookaheadPanel";
import StatusUpdater from "@/components/tracker/StatusUpdater";
import type { SegmentWithStatus, AlignmentCheckpoint } from "@/lib/types";
import type { SegmentStatus } from "@/lib/constants";
import AddressSearch from "@/components/tracker/AddressSearch";
import ShapefileLoader from "@/components/tracker/ShapefileLoader";
import CheckpointCreator from "@/components/tracker/CheckpointCreator";
import Link from "next/link";

// Hardcoded section ID for McLennan Dr - Sec 3
const SECTION_ID = "95ed700f-e11c-45f8-8ada-d4b947d2d96e";

// Dynamic import for Leaflet (SSR incompatible)
const PipelineMap = dynamic(() => import("@/components/tracker/PipelineMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-800 rounded-lg">
      <p className="text-gray-400">Loading map...</p>
    </div>
  ),
});

export default function TrackerPage() {
  const [segments, setSegments] = useState<SegmentWithStatus[]>([]);
  const [checkpoints, setCheckpoints] = useState<AlignmentCheckpoint[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<SegmentWithStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [alignmentGeojson, setAlignmentGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Calculate laying front chainage
  const layingFrontChainage = segments
    .filter((s) => s.status === "installed" || s.status === "backfilled")
    .reduce((max, s) => Math.max(max, s.chainage_end), 0);

  const fetchData = useCallback(async (sectionId: string) => {
    setLoading(true);
    try {
      const [segRes, cpRes] = await Promise.all([
        fetch(`/api/segments?section_id=${sectionId}`),
        fetch(`/api/checkpoints?section_id=${sectionId}`),
      ]);
      if (segRes.ok) setSegments(await segRes.json());
      if (cpRes.ok) setCheckpoints(await cpRes.json());
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data on mount
  useEffect(() => {
    fetchData(SECTION_ID);
  }, [fetchData]);

  const handleUpdateStatus = useCallback(
    async (segmentId: string, status: SegmentStatus) => {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment_id: segmentId, status }),
      });
      if (res.ok) {
        // Refresh segments
        setSegments((prev) =>
          prev.map((s) =>
            s.id === segmentId
              ? { ...s, status, status_date: new Date().toISOString().split("T")[0] }
              : s
          )
        );
        setSelectedSegment(null);
      }
    },
    []
  );

  const handleGoToFront = useCallback(() => {
    if (!mapRef.current) return;
    const installed = segments
      .filter((s) => s.status === "installed")
      .sort((a, b) => b.chainage_end - a.chainage_end);
    if (installed.length > 0) {
      const front = installed[0];
      mapRef.current.flyTo([front.lat_end, front.lng_end], 17, { duration: 1.5 });
    }
  }, [segments]);

  const handleFitAll = useCallback(async () => {
    if (!mapRef.current || segments.length === 0) return;
    const leaflet = await import("leaflet");
    const bounds = leaflet.latLngBounds(
      segments.flatMap((s) => [
        [s.lat_start, s.lng_start],
        [s.lat_end, s.lng_end],
      ])
    );
    mapRef.current.fitBounds(bounds, { padding: [50, 50] });
  }, [segments]);

  const handleCheckpointSelect = useCallback((cp: AlignmentCheckpoint) => {
    if (mapRef.current) {
      mapRef.current.flyTo([cp.lat, cp.lng], 17, { duration: 1.5 });
    }
  }, []);

  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
  }, []);

  const handleAddressSelect = useCallback((lat: number, lng: number) => {
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lng], 16, { duration: 1.5 });
    }
  }, []);

  const refreshCheckpoints = useCallback(async () => {
    try {
      const res = await fetch(`/api/checkpoints?section_id=${SECTION_ID}`);
      if (res.ok) setCheckpoints(await res.json());
    } catch (err) {
      console.error("Failed to refresh checkpoints:", err);
    }
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-white transition-colors">
            ← Home
          </Link>
          <h1 className="text-lg font-bold">Pipeline Tracker</h1>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
            DN1600 MSCL
          </span>
        </div>
        <div className="flex items-center gap-3">
          <AddressSearch onSelect={handleAddressSelect} />
          {loading && <span className="text-xs text-blue-400 animate-pulse">Loading...</span>}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map area */}
        <div className="flex-1 relative">
          <PipelineMap
            segments={segments}
            checkpoints={checkpoints}
            onSegmentClick={setSelectedSegment}
            onCheckpointClick={handleCheckpointSelect}
            onMapReady={handleMapReady}
            alignmentGeojson={alignmentGeojson}
          />

          {/* Empty state overlay */}
          {!loading && segments.length === 0 && !alignmentGeojson && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg pointer-events-none">
              <div className="text-center pointer-events-auto">
                <p className="text-gray-300 text-lg mb-2">No alignment data loaded</p>
                <p className="text-gray-500 text-sm">
                  Import an Excel file or connect a section to get started
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Side panel */}
        <aside className="w-80 bg-gray-950 border-l border-gray-800 p-4 space-y-4 overflow-y-auto">
          <ShapefileLoader onLoaded={setAlignmentGeojson} />

          <ViewportControls
            segments={segments}
            onGoToFront={handleGoToFront}
            onFitAll={handleFitAll}
          />

          {selectedSegment && (
            <StatusUpdater
              segment={selectedSegment}
              onUpdateStatus={handleUpdateStatus}
              onClose={() => setSelectedSegment(null)}
            />
          )}

          <CheckpointCreator
            sectionId={SECTION_ID}
            onCreated={refreshCheckpoints}
          />

          <LookaheadPanel
            checkpoints={checkpoints}
            layingFrontChainage={layingFrontChainage}
            onCheckpointSelect={handleCheckpointSelect}
          />
        </aside>
      </div>
    </div>
  );
}
