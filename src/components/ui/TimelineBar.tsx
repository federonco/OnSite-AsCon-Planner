import type { TimelineAccent } from "@/design-system/tokens";
import { cn } from "@/lib/cn";

const ACCENT: Record<TimelineAccent, string> = {
  blue: "bg-[#2D7FF9]",
  purple: "bg-[#6D5EF6]",
  lightPurple: "bg-[#B8B3F6]",
  teal: "bg-[#14B8A6]",
};

export interface TimelineBarProps {
  accent: TimelineAccent;
  label?: string;
  className?: string;
}

export function TimelineBar({ accent, label, className }: TimelineBarProps) {
  return (
    <div
      className={cn(
        "flex h-timeline-bar max-w-full items-center justify-center rounded-[14px] px-3 text-dashboard-xs font-medium text-white shadow-sm",
        ACCENT[accent],
        accent === "lightPurple" && "text-dashboard-text-primary",
        className
      )}
    >
      {label && <span className="truncate">{label}</span>}
    </div>
  );
}
