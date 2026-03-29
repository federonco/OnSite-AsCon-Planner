import { Avatar } from "./Avatar";
import { cn } from "@/lib/cn";

export interface EventRowProps {
  title: string;
  subtitle?: string;
  assigneeInitials?: string;
  className?: string;
}

export function EventRow({ title, subtitle, assigneeInitials, className }: EventRowProps) {
  return (
    <div
      className={cn(
        "flex h-event-row items-center gap-3 border border-dashboard-border bg-dashboard-surface px-4 transition-colors duration-dashboard-fast hover:bg-[#F9FAFB]",
        "rounded-dashboard-md shadow-[0_1px_0_rgba(0,0,0,0.03)]",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-dashboard-sm font-medium text-dashboard-text-primary">{title}</p>
        {subtitle && (
          <p className="truncate text-dashboard-xs font-normal text-dashboard-text-secondary">{subtitle}</p>
        )}
      </div>
      {assigneeInitials && <Avatar initials={assigneeInitials} size="sm" />}
    </div>
  );
}
