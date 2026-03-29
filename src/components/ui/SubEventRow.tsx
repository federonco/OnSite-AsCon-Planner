import { Avatar } from "./Avatar";
import { cn } from "@/lib/cn";

export interface SubEventRowProps {
  title: string;
  assigneeInitials?: string;
  className?: string;
}

export function SubEventRow({ title, assigneeInitials, className }: SubEventRowProps) {
  return (
    <div
      className={cn(
        "flex h-event-row items-center gap-3 border border-dashboard-border border-l-2 border-l-dashboard-timeline-lightPurple/50 bg-dashboard-surface/90 pl-6 pr-4 transition-colors duration-dashboard-fast hover:bg-[#F9FAFB]",
        "rounded-dashboard-md",
        className
      )}
    >
      <span className="text-dashboard-xs text-dashboard-text-muted">↳</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-dashboard-sm font-normal text-dashboard-text-primary">{title}</p>
      </div>
      {assigneeInitials && <Avatar initials={assigneeInitials} size="sm" />}
    </div>
  );
}
