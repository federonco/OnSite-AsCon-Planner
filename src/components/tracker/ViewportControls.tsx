"use client";

import { STATUS_COLORS } from "@/lib/constants";
import type { SegmentWithStatus } from "@/lib/types";

interface ViewportControlsProps {
  segments: SegmentWithStatus[];
  onGoToFront: () => void;
  onFitAll: () => void;
}

export default function ViewportControls({ segments, onGoToFront, onFitAll }: ViewportControlsProps) {
  const installed = segments.filter((s) => s.status === "installed").length;
  const backfilled = segments.filter((s) => s.status === "backfilled").length;
  const pending = segments.filter((s) => s.status === "pending").length;
  const total = segments.length;

  const progressPct = total > 0 ? (((installed + backfilled) / total) * 100).toFixed(1) : "0";

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-full">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
        Pipeline Status
      </h3>

      {/* Progress bar */}
      <div className="w-full bg-gray-700 rounded-full h-2.5 mb-3">
        <div className="flex h-full rounded-full overflow-hidden">
          <div
            className="h-full"
            style={{
              width: `${total > 0 ? (backfilled / total) * 100 : 0}%`,
              backgroundColor: STATUS_COLORS.backfilled,
            }}
          />
          <div
            className="h-full"
            style={{
              width: `${total > 0 ? (installed / total) * 100 : 0}%`,
              backgroundColor: STATUS_COLORS.installed,
            }}
          />
        </div>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div>
          <div className="text-lg font-bold" style={{ color: STATUS_COLORS.pending }}>{pending}</div>
          <div className="text-xs text-gray-500">Pending</div>
        </div>
        <div>
          <div className="text-lg font-bold" style={{ color: STATUS_COLORS.installed }}>{installed}</div>
          <div className="text-xs text-gray-500">Installed</div>
        </div>
        <div>
          <div className="text-lg font-bold" style={{ color: STATUS_COLORS.backfilled }}>{backfilled}</div>
          <div className="text-xs text-gray-500">Backfilled</div>
        </div>
      </div>

      <div className="text-sm text-gray-400 mb-4 text-center">
        {progressPct}% complete · {total} total segments
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={onGoToFront}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-3 rounded transition-colors"
        >
          Go to Front
        </button>
        <button
          onClick={onFitAll}
          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium py-2 px-3 rounded transition-colors"
        >
          Fit All
        </button>
      </div>
    </div>
  );
}
