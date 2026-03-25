"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import SegmentLayer from "./SegmentLayer";
import CheckpointLayer from "./CheckpointLayer";
import AlignmentLayer from "./AlignmentLayer";
import type { SegmentWithStatus, AlignmentCheckpoint } from "@/lib/types";

import "leaflet/dist/leaflet.css";

interface PipelineMapProps {
  segments: SegmentWithStatus[];
  checkpoints: AlignmentCheckpoint[];
  onSegmentClick?: (segment: SegmentWithStatus) => void;
  onCheckpointClick?: (checkpoint: AlignmentCheckpoint) => void;
  onMapReady?: (map: L.Map) => void;
  alignmentGeojson?: GeoJSON.FeatureCollection | null;
}

const DEFAULT_CENTER: [number, number] = [-31.95, 115.86];
const DEFAULT_ZOOM = 13;

const ESRI_SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION =
  "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community";

/** Inner component that has access to the map instance via useMap() */
function MapController({
  segments,
  alignmentGeojson,
  onMapReady,
}: {
  segments: SegmentWithStatus[];
  alignmentGeojson?: GeoJSON.FeatureCollection | null;
  onMapReady?: (map: L.Map) => void;
}) {
  const map = useMap();

  // Notify parent with the map instance
  useEffect(() => {
    if (onMapReady) {
      onMapReady(map);
    }
  }, [map, onMapReady]);

  // Fit to segments
  useEffect(() => {
    if (segments.length > 0) {
      const bounds = L.latLngBounds(
        segments.flatMap((s) => [
          [s.lat_start, s.lng_start] as [number, number],
          [s.lat_end, s.lng_end] as [number, number],
        ])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, segments]);

  // Fit to alignment geojson when no segments
  useEffect(() => {
    if (alignmentGeojson && segments.length === 0) {
      const geoLayer = L.geoJSON(alignmentGeojson);
      const bounds = geoLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [map, alignmentGeojson, segments]);

  return null;
}

export default function PipelineMap({
  segments,
  checkpoints,
  onSegmentClick,
  onCheckpointClick,
  onMapReady,
  alignmentGeojson,
}: PipelineMapProps) {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      className="h-full w-full rounded-lg"
    >
      <MapController
        segments={segments}
        alignmentGeojson={alignmentGeojson}
        onMapReady={onMapReady}
      />
      <TileLayer url={ESRI_SATELLITE_URL} attribution={ESRI_ATTRIBUTION} maxZoom={19} />
      <AlignmentLayer geojson={alignmentGeojson || null} />
      <SegmentLayer segments={segments} onSegmentClick={onSegmentClick} />
      <CheckpointLayer checkpoints={checkpoints} onCheckpointClick={onCheckpointClick} />
    </MapContainer>
  );
}
