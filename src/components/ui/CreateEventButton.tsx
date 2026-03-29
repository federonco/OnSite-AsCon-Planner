import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface CreateEventButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
}

export function CreateEventButton({
  children = "Create event",
  className,
  ...rest
}: CreateEventButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-dashboard-md bg-gradient-to-r from-[#5B5FEF] to-[#6D72F6] px-4 py-2.5 text-dashboard-sm font-medium text-white shadow-dashboard-card transition-[box-shadow,filter] duration-dashboard-normal ease-dashboard hover:shadow-dashboard-hover hover:brightness-[1.02] active:brightness-[0.98]",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
