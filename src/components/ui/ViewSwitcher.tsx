"use client";

import { cn } from "@/lib/cn";

export interface ViewSwitcherOption {
  id: string;
  label: string;
}

export interface ViewSwitcherProps {
  options: ViewSwitcherOption[];
  value: string;
  onChange: (id: string) => void;
}

export function ViewSwitcher({ options, value, onChange }: ViewSwitcherProps) {
  return (
    <div
      className="inline-flex rounded-dashboard-md bg-dashboard-bg p-1"
      role="tablist"
      aria-label="View mode"
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            "rounded-dashboard-sm px-4 py-2 text-dashboard-sm font-medium transition-[background-color,color,box-shadow] duration-dashboard-fast ease-dashboard",
            value === opt.id
              ? "bg-dashboard-surface text-dashboard-text-primary shadow-dashboard-card"
              : "text-dashboard-text-secondary hover:text-dashboard-text-primary"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
