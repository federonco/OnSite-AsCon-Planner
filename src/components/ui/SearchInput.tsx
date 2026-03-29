"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  containerClassName?: string;
}

export function SearchInput({ className, containerClassName, ...rest }: SearchInputProps) {
  return (
    <div
      className={cn(
        "flex h-10 w-full max-w-md items-center gap-2 rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 shadow-dashboard-card transition-shadow duration-dashboard-normal ease-dashboard focus-within:shadow-dashboard-hover",
        containerClassName
      )}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="shrink-0 text-dashboard-text-muted"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3-3" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        className={cn(
          "min-w-0 flex-1 bg-transparent text-dashboard-sm font-normal text-dashboard-text-primary placeholder:text-dashboard-text-muted focus:outline-none",
          className
        )}
        {...rest}
      />
    </div>
  );
}
