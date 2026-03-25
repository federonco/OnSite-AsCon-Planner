"use client";

import { CircleMarker, Tooltip } from "react-leaflet";
import type { AlignmentCheckpoint } from "@/lib/types";
import type { CheckpointType } from "@/lib/constants";

const CHECKPOINT_STYLES: Record<CheckpointType, { color: string; fillColor: string }> = {
  bend: { color: "#c97a1a", fillColor: "#EF9F27" },
  fitting: { color: "#2a6db0", fillColor: "#3B8BD4" },
  crossing: { color: "#c0392b", fillColor: "#e74c3c" },
  valve: { color: "#1a8a5e", fillColor: "#1D9E75" },
  "tie-in": { color: "#7b3fa0", fillColor: "#9b59b6" },
  other: { color: "#7f8c8d", fillColor: "#95a5a6" },
};

interface CheckpointLayerProps {
  checkpoints: AlignmentCheckpoint[];
  onCheckpointClick?: (checkpoint: AlignmentCheckpoint) => void;
}

export default function CheckpointLayer({ checkpoints, onCheckpointClick }: CheckpointLayerProps) {
  return (
    <>
      {checkpoints.map((cp) => {
        const style = CHECKPOINT_STYLES[cp.type] || CHECKPOINT_STYLES.other;
        return (
          <CircleMarker
            key={cp.id}
            center={[cp.lat, cp.lng]}
            radius={8}
            pathOptions={{
              color: style.color,
              fillColor: style.fillColor,
              fillOpacity: 0.9,
              weight: 2,
            }}
            eventHandlers={{
              click: () => onCheckpointClick?.(cp),
            }}
          >
            <Tooltip>
              <div className="text-xs">
                <strong>{cp.label}</strong>
                <br />
                Type: {cp.type}
                <br />
                Ch {cp.chainage.toFixed(1)}m
                {cp.notes && (
                  <>
                    <br />
                    {cp.notes}
                  </>
                )}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}
