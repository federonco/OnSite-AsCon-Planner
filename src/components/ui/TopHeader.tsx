import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TopHeaderProps {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
}

export function TopHeader({ left, center, right, className }: TopHeaderProps) {
  return (
    <header
      className={cn(
        "relative z-10 flex min-h-[72px] shrink-0 items-center justify-between gap-4 border-b border-dashboard-border bg-dashboard-surface px-dashboard-xl py-3",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">{left}</div>
      {center && <div className="hidden shrink-0 justify-center lg:flex">{center}</div>}
      <div className="flex shrink-0 items-center gap-2">{right}</div>
    </header>
  );
}
