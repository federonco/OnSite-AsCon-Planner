import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EventGroupSectionProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function EventGroupSection({ title, children, className }: EventGroupSectionProps) {
  return (
    <section className={cn("space-y-3", className)}>
      <h3 className="px-1 text-dashboard-xs font-semibold uppercase tracking-wider text-dashboard-text-muted">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
