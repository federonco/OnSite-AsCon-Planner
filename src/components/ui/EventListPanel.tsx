import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EventListPanelProps {
  children: ReactNode;
  className?: string;
}

export function EventListPanel({ children, className }: EventListPanelProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full max-w-event-panel flex-col border-r border-dashboard-border bg-dashboard-surface",
        className
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-dashboard-lg">{children}</div>
    </div>
  );
}
