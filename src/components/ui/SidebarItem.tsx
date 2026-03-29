"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SidebarItemProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  collapsed?: boolean;
  /** When set, renders as Next.js `Link` (navigation) */
  href?: string;
}

const itemClassName = (active: boolean | undefined) =>
  cn(
    "flex h-sidebar-item w-full items-center gap-3 rounded-dashboard-md px-3 text-dashboard-sm font-medium text-dashboard-sidebar-text transition-colors duration-dashboard-fast ease-dashboard",
    active
      ? "bg-dashboard-sidebar-active"
      : "bg-transparent hover:bg-dashboard-sidebar-item"
  );

export function SidebarItem({ icon, label, active, onClick, collapsed, href }: SidebarItemProps) {
  const inner = (
    <>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        title={collapsed ? label : undefined}
        className={itemClassName(active)}
        aria-current={active ? "page" : undefined}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} title={collapsed ? label : undefined} className={itemClassName(active)}>
      {inner}
    </button>
  );
}
