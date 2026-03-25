"use client";

import { useState } from "react";
import { SEGMENT_STATUSES, type SegmentStatus, STATUS_COLORS } from "@/lib/constants";
import type { SegmentWithStatus } from "@/lib/types";

interface StatusUpdaterProps {
  segment: SegmentWithStatus | null;
  onUpdateStatus: (segmentId: string, status: SegmentStatus) => Promise<void>;
  onClose: () => void;
}

export default function StatusUpdater({ segment, onUpdateStatus, onClose }: StatusUpdaterProps) {
  const [loading, setLoading] = useState(false);

  if (!segment) return null;

  const handleUpdate = async (status: SegmentStatus) => {
    setLoading(true);
    try {
      await onUpdateStatus(segment.id, status);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          Update Segment
        </h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">
          ✕
        </button>
      </div>

      <div className="text-sm text-gray-400 mb-1">
        <strong className="text-white">Segment #{segment.segment_number}</strong>
      </div>
      <div className="text-xs text-gray-500 mb-1">
        Ch {segment.chainage_start.toFixed(1)} – {segment.chainage_end.toFixed(1)}m
      </div>
      <div className="text-xs text-gray-500 mb-3">{segment.pipe_type}</div>

      <div className="text-xs text-gray-400 mb-2">
        Current:{" "}
        <span className="font-medium" style={{ color: STATUS_COLORS[segment.status] }}>
          {segment.status}
        </span>
      </div>

      <div className="flex gap-2">
        {SEGMENT_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => handleUpdate(status)}
            disabled={loading || segment.status === status}
            className="flex-1 text-xs font-medium py-2 px-2 rounded transition-colors disabled:opacity-40"
            style={{
              backgroundColor: segment.status === status ? STATUS_COLORS[status] : "transparent",
              border: `1px solid ${STATUS_COLORS[status]}`,
              color: segment.status === status ? "#fff" : STATUS_COLORS[status],
            }}
          >
            {loading ? "..." : status}
          </button>
        ))}
      </div>
    </div>
  );
}
