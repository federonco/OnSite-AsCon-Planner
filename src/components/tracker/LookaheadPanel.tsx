"use client";

import type { AlignmentCheckpoint } from "@/lib/types";
import { CHECKPOINT_TYPES } from "@/lib/constants";

const TYPE_ICONS: Record<string, string> = {
  bend: "◆",
  fitting: "●",
  crossing: "▲",
  valve: "■",
  "tie-in": "★",
  other: "○",
};

const TYPE_COLORS: Record<string, string> = {
  bend: "text-orange-400",
  fitting: "text-blue-400",
  crossing: "text-red-400",
  valve: "text-green-400",
  "tie-in": "text-purple-400",
  other: "text-gray-400",
};

interface LookaheadPanelProps {
  checkpoints: AlignmentCheckpoint[];
  layingFrontChainage: number;
  onCheckpointSelect?: (checkpoint: AlignmentCheckpoint) => void;
}

export default function LookaheadPanel({
  checkpoints,
  layingFrontChainage,
  onCheckpointSelect,
}: LookaheadPanelProps) {
  const upcoming = checkpoints
    .filter((cp) => cp.chainage > layingFrontChainage)
    .sort((a, b) => a.chainage - b.chainage);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-full">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
        Upcoming Checkpoints
      </h3>

      {upcoming.length === 0 ? (
        <p className="text-gray-500 text-sm">No checkpoints ahead</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {upcoming.map((cp) => {
            const distAhead = cp.chainage - layingFrontChainage;
            return (
              <button
                key={cp.id}
                onClick={() => onCheckpointSelect?.(cp)}
                className="w-full text-left bg-gray-800 hover:bg-gray-750 rounded px-3 py-2 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-lg ${TYPE_COLORS[cp.type] || TYPE_COLORS.other}`}>
                    {TYPE_ICONS[cp.type] || TYPE_ICONS.other}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{cp.label}</div>
                    <div className="text-xs text-gray-400">
                      {cp.type} · Ch {cp.chainage.toFixed(0)}m · {distAhead.toFixed(0)}m ahead
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-gray-700">
        <div className="grid grid-cols-3 gap-1">
          {CHECKPOINT_TYPES.map((type) => (
            <div key={type} className="flex items-center gap-1 text-xs text-gray-500">
              <span className={TYPE_COLORS[type]}>{TYPE_ICONS[type]}</span>
              <span className="capitalize">{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
