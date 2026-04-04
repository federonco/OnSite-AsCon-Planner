import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { SiteFooter } from "./SiteFooter";

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
        "dashboard-theme flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-row items-stretch overflow-hidden bg-dashboard-bg font-sans text-dashboard-text-primary antialiased",
        className
      )}
    >
      {sidebar}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {header}
        <main className="min-h-0 flex-1 overflow-auto p-dashboard-xl">{children}</main>
        <SiteFooter variant="dashboard" />
      </div>
    </div>
  );
}
