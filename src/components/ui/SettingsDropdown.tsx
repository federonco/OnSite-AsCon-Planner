"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "./IconButton";

const kebabIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
    <circle cx="12" cy="6" r="1.75" />
    <circle cx="12" cy="12" r="1.75" />
    <circle cx="12" cy="18" r="1.75" />
  </svg>
);

export interface SettingsDropdownProps {
  className?: string;
}

export function SettingsDropdown({ className }: SettingsDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={cn("relative", className)} ref={ref}>
      <IconButton label="Menu" onClick={() => setOpen((o) => !o)}>
        {kebabIcon}
      </IconButton>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 min-w-[200px] rounded-dashboard-md border border-dashboard-border bg-dashboard-surface p-3 shadow-dashboard-card"
          role="menu"
        >
          <p className="px-1 pb-2 text-dashboard-xs font-medium uppercase tracking-wide text-dashboard-text-muted">
            Workspace
          </p>
          <button
            type="button"
            role="menuitem"
            className="w-full rounded-dashboard-sm px-2 py-2 text-left text-dashboard-sm text-dashboard-text-primary transition-colors hover:bg-dashboard-bg"
            onClick={() => setOpen(false)}
          >
            Notification preferences
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full rounded-dashboard-sm px-2 py-2 text-left text-dashboard-sm text-dashboard-text-primary transition-colors hover:bg-dashboard-bg"
            onClick={() => setOpen(false)}
          >
            Team access
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full rounded-dashboard-sm px-2 py-2 text-left text-dashboard-sm text-dashboard-text-primary transition-colors hover:bg-dashboard-bg"
            onClick={() => setOpen(false)}
          >
            Export calendar
          </button>
        </div>
      )}
    </div>
  );
}
