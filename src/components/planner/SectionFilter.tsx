"use client";

import { cn } from "@/lib/cn";

export interface SectionOption {
  id: string;
  name: string;
}

interface SectionFilterProps {
  sections: SectionOption[];
  value: string | null;
  onChange: (sectionId: string | null) => void;
  disabled?: boolean;
  className?: string;
}

export default function SectionFilter({
  sections,
  value,
  onChange,
  disabled,
  className,
}: SectionFilterProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2", className)}>
      <label htmlFor="planner-section-filter" className="shrink-0 text-dashboard-sm text-dashboard-text-secondary">
        Section
      </label>
      <select
        id="planner-section-filter"
        disabled={disabled || sections.length === 0}
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : v);
        }}
        className={cn(
          "min-w-[12rem] max-w-full rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm text-dashboard-text-primary",
          "focus:outline-none focus:ring-2 focus:ring-[#5B5FEF]/25 focus:border-dashboard-primary",
          (disabled || sections.length === 0) && "cursor-not-allowed opacity-60"
        )}
      >
        <option value="">All sections</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
