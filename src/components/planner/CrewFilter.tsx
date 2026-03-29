"use client";

import { getCrewColor } from "@/lib/planner-constants";
import { cn } from "@/lib/cn";

interface Crew {
  id: string;
  name: string;
}

interface CrewFilterProps {
  crews: Crew[];
  value: string | null;
  onChange: (crewId: string | null) => void;
  onlyEnabledCrewId?: false | string | null;
}

export default function CrewFilter({
  crews,
  value,
  onChange,
  onlyEnabledCrewId = false,
}: CrewFilterProps) {
  /** Lock only when a specific crew id is forced (not `null` = rollout name set but unresolved crew). */
  const locked = typeof onlyEnabledCrewId === "string";
  const enabledId = locked ? onlyEnabledCrewId : null;
  const allActive = !locked && value === null;

  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Crew filter">
      <button
        type="button"
        disabled={locked}
        onClick={() => onChange(null)}
        className={cn(
          "rounded-dashboard-sm px-3 py-1.5 text-dashboard-sm font-medium transition-[background-color,color] duration-dashboard-fast ease-dashboard",
          allActive
            ? "bg-gradient-to-r from-[#5B5FEF] to-[#6D72F6] text-white shadow-dashboard-card"
            : locked
              ? "cursor-not-allowed bg-dashboard-border/40 text-dashboard-text-muted"
              : "bg-dashboard-bg text-dashboard-text-secondary hover:bg-white hover:text-dashboard-text-primary"
        )}
      >
        All
      </button>
      {crews.map((crew, idx) => {
        const disabled = locked && crew.id !== enabledId;
        return (
          <button
            type="button"
            key={crew.id}
            disabled={disabled}
            onClick={() => onChange(crew.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-dashboard-sm px-3 py-1.5 text-dashboard-sm font-medium transition-[background-color,color] duration-dashboard-fast ease-dashboard",
              value === crew.id
                ? "bg-gradient-to-r from-[#5B5FEF] to-[#6D72F6] text-white shadow-dashboard-card"
                : disabled
                  ? "cursor-not-allowed bg-dashboard-border/40 text-dashboard-text-muted"
                  : "bg-dashboard-bg text-dashboard-text-secondary hover:bg-white hover:text-dashboard-text-primary"
            )}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: getCrewColor(idx) }}
            />
            {crew.name}
          </button>
        );
      })}
    </div>
  );
}
