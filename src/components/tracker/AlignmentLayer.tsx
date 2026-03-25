"use client";

import { GeoJSON } from "react-leaflet";
import type { PathOptions } from "leaflet";

interface AlignmentLayerProps {
  geojson: GeoJSON.FeatureCollection | null;
}

const DESIGN_STYLE: PathOptions = {
  color: "#ffffff",
  weight: 2,
  opacity: 0.5,
  dashArray: "8, 6",
};

export default function AlignmentLayer({ geojson }: AlignmentLayerProps) {
  if (!geojson) return null;

  return (
    <GeoJSON
      key={JSON.stringify(geojson).slice(0, 100)}
      data={geojson}
      style={() => DESIGN_STYLE}
    />
  );
}
