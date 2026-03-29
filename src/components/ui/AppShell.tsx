import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface AppShellProps {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AppShell({ sidebar, header, children, className }: AppShellProps) {
  return (
    <div
      className={cn(
        "flex h-screen min-h-0 w-full bg-dashboard-bg font-sans text-dashboard-text-primary antialiased",
        className
      )}
    >
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <main className="min-h-0 flex-1 overflow-auto p-dashboard-xl">{children}</main>
      </div>
    </div>
  );
}
