import { cn } from "@/lib/cn";

export interface AvatarProps {
  initials: string;
  className?: string;
  size?: "sm" | "md";
}

const sizeMap = {
  sm: "h-7 w-7 text-dashboard-xs",
  md: "h-8 w-8 text-dashboard-sm",
};

export function Avatar({ initials, className, size = "md" }: AvatarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-dashboard-border/80 font-medium text-dashboard-text-secondary",
        sizeMap[size],
        className
      )}
      aria-hidden
    >
      {initials.slice(0, 2).toUpperCase()}
    </div>
  );
}
