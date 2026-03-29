import { cn } from "@/lib/cn";

export type SiteFooterVariant = "dashboard" | "dark" | "light";

const variantClass: Record<SiteFooterVariant, string> = {
  dashboard:
    "border-t border-dashboard-border bg-dashboard-bg text-dashboard-text-muted",
  dark: "border-t border-gray-800 bg-gray-950 text-gray-500",
  light: "border-t border-neutral-200 bg-white text-neutral-500 dark:border-neutral-800 dark:bg-gray-950 dark:text-neutral-400",
};

/**
 * Footer aligned with OnSite-D: project line, readX credit, rights.
 */
export function SiteFooter({
  variant = "light",
  className,
}: {
  variant?: SiteFooterVariant;
  className?: string;
}) {
  return (
    <footer
      className={cn(
        "shrink-0 px-6 pb-6 pt-3 text-center text-dashboard-xs",
        variantClass[variant],
        className
      )}
    >
      <div className="space-y-1">
        <div>OnSite-AsCon-Planner</div>
        <div>
          Created by{" "}
          <a
            href="https://www.readx.com.au"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 align-middle -translate-y-[2px] underline-offset-2 hover:underline"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- small raster wordmark */}
            <img src="/readx-logo.png" alt="readX" className="h-[10px] w-auto" />
          </a>
        </div>
        <div>All Rights Reserved.</div>
      </div>
    </footer>
  );
}
