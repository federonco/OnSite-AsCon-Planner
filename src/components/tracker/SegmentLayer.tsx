"use client";

import { Polyline, Tooltip } from "react-leaflet";
import { STATUS_COLORS } from "@/lib/constants";
import type { SegmentWithStatus } from "@/lib/types";

interface SegmentLayerProps {
  segments: SegmentWithStatus[];
  onSegmentClick?: (segment: SegmentWithStatus) => void;
}

export default function SegmentLayer({ segments, onSegmentClick }: SegmentLayerProps) {
  return (
    <>
      {segments.map((seg) => (
        <Polyline
          key={seg.id}
          positions={[
            [seg.lat_start, seg.lng_start],
            [seg.lat_end, seg.lng_end],
          ]}
          pathOptions={{
            color: STATUS_COLORS[seg.status],
            weight: 5,
            opacity: 0.9,
          }}
          eventHandlers={{
            click: () => onSegmentClick?.(seg),
          }}
        >
          <Tooltip>
            <div className="text-xs">
              <strong>Seg #{seg.segment_number}</strong>
              <br />
              Ch {seg.chainage_start.toFixed(1)}–{seg.chainage_end.toFixed(1)}m
              <br />
              Status: {seg.status}
              <br />
              {seg.pipe_type}
            </div>
          </Tooltip>
        </Polyline>
      ))}
    </>
  );
}
