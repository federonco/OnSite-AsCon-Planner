import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: React.ReactNode;
}

export function IconButton({ label, className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-dashboard-md text-dashboard-text-secondary transition-[background-color,box-shadow,color] duration-dashboard-fast ease-dashboard hover:bg-dashboard-bg hover:text-dashboard-text-primary",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
