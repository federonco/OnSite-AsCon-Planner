"use client";

import { useRef, useEffect } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import SegmentLayer from "./SegmentLayer";
import CheckpointLayer from "./CheckpointLayer";
import type { SegmentWithStatus, AlignmentCheckpoint } from "@/lib/types";

// Fix Leaflet default icon paths in Next.js
import "leaflet/dist/leaflet.css";

interface PipelineMapProps {
  segments: SegmentWithStatus[];
  checkpoints: AlignmentCheckpoint[];
  onSegmentClick?: (segment: SegmentWithStatus) => void;
  onCheckpointClick?: (checkpoint: AlignmentCheckpoint) => void;
  onMapReady?: (map: L.Map) => void;
}

// Perth, WA default center
const DEFAULT_CENTER: [number, number] = [-31.95, 115.86];
const DEFAULT_ZOOM = 13;

const ESRI_SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION =
  "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community";

export default function PipelineMap({
  segments,
  checkpoints,
  onSegmentClick,
  onCheckpointClick,
  onMapReady,
}: PipelineMapProps) {
  const mapRef = useRef<L.Map | null>(null);

  // Notify parent when map is ready
  useEffect(() => {
    if (mapRef.current && onMapReady) {
      onMapReady(mapRef.current);
    }
  }, [onMapReady]);

  // Fit map to segments when they load
  useEffect(() => {
    if (mapRef.current && segments.length > 0) {
      const bounds = L.latLngBounds(
        segments.flatMap((s) => [
          [s.lat_start, s.lng_start] as [number, number],
          [s.lat_end, s.lng_end] as [number, number],
        ])
      );
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [segments]);

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      className="h-full w-full rounded-lg"
      ref={mapRef}
    >
      <TileLayer url={ESRI_SATELLITE_URL} attribution={ESRI_ATTRIBUTION} maxZoom={19} />
      <SegmentLayer segments={segments} onSegmentClick={onSegmentClick} />
      <CheckpointLayer checkpoints={checkpoints} onCheckpointClick={onCheckpointClick} />
    </MapContainer>
  );
}

/**
 * Fly the map to the laying front (last installed segment).
 */
export function goToLayingFront(map: L.Map | null, segments: SegmentWithStatus[]) {
  if (!map) return;
  const installed = segments
    .filter((s) => s.status === "installed")
    .sort((a, b) => b.chainage_end - a.chainage_end);
  if (installed.length > 0) {
    const front = installed[0];
    map.flyTo([front.lat_end, front.lng_end], 17, { duration: 1.5 });
  }
}

/**
 * Fit the map to show all segments.
 */
export function fitAllSegments(map: L.Map | null, segments: SegmentWithStatus[]) {
  if (!map || segments.length === 0) return;
  const bounds = L.latLngBounds(
    segments.flatMap((s) => [
      [s.lat_start, s.lng_start] as [number, number],
      [s.lat_end, s.lng_end] as [number, number],
    ])
  );
  map.fitBounds(bounds, { padding: [50, 50] });
}
