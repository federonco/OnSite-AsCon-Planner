"use client";

import { HORIZON_OPTIONS, HorizonWeeks } from "@/lib/planner-types";
import { cn } from "@/lib/cn";

interface HorizonSelectorProps {
  value: HorizonWeeks;
  onChange: (weeks: HorizonWeeks) => void;
  /**
   * Four equal columns (2W–8W same footprint). Use in calendar toolbar so the control width
   * does not shift when changing selection.
   */
  equalWidth?: boolean;
}

export default function HorizonSelector({ value, onChange, equalWidth }: HorizonSelectorProps) {
  return (
    <div
      className={cn(
        "gap-1",
        equalWidth ? "grid w-full grid-cols-4" : "flex flex-wrap"
      )}
      role="group"
      aria-label="Planning horizon"
    >
      {HORIZON_OPTIONS.map((weeks) => (
        <button
          key={weeks}
          type="button"
          onClick={() => onChange(weeks)}
          className={cn(
            "rounded-dashboard-sm py-1.5 text-dashboard-sm font-medium transition-[background-color,color,box-shadow] duration-dashboard-fast ease-dashboard",
            equalWidth ? "min-w-0 w-full justify-center px-1.5" : "px-3",
            value === weeks
              ? "bg-gradient-to-r from-[#5B5FEF] to-[#6D72F6] text-white shadow-dashboard-card"
              : "bg-dashboard-bg text-dashboard-text-secondary hover:bg-white hover:text-dashboard-text-primary hover:shadow-dashboard-card"
          )}
        >
          {weeks}W
        </button>
      ))}
    </div>
  );
}
