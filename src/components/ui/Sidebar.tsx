"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { OnSiteMark } from "./OnSiteMark";
import { SidebarItem } from "./SidebarItem";

const STORAGE_KEY = "onsite-dashboard-sidebar-collapsed";

const iconChevronLeft = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const iconChevronRight = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const iconHome = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
    <path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1v-10.5z" strokeLinejoin="round" />
  </svg>
);
const iconCalendar = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
  </svg>
);
const iconDailyNotes = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" />
  </svg>
);

export interface SidebarProps {
  activeId?: string;
  /**
   * Controlled width: pass both `collapsed` and `onCollapsedChange`.
   * If only `collapsed` is set, the sidebar reflects that value but the toggle is disabled (read-only).
   */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function Sidebar({ activeId = "schedule", collapsed: collapsedProp, onCollapsedChange }: SidebarProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : internalCollapsed;
  const toggleEnabled = !isControlled || onCollapsedChange != null;
  const readOnlyControlled = isControlled && onCollapsedChange == null;

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !readOnlyControlled) return;
    console.warn(
      "[Sidebar] Invalid props: `collapsed` without `onCollapsedChange`. Toggle is disabled; parent must update `collapsed` or switch to uncontrolled mode."
    );
  }, [readOnlyControlled]);

  useEffect(() => {
    if (isControlled) return;
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "1") setInternalCollapsed(true);
    } catch {
      /* ignore */
    }
  }, [isControlled]);

  const setCollapsed = useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setInternalCollapsed(next);
        try {
          localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        } catch {
          /* ignore */
        }
      }
      onCollapsedChange?.(next);
    },
    [isControlled, onCollapsedChange]
  );

  const toggle = useCallback(() => {
    if (!toggleEnabled) return;
    setCollapsed(!collapsed);
  }, [collapsed, setCollapsed, toggleEnabled]);

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col bg-dashboard-sidebar py-6 text-dashboard-sidebar-text transition-[width] duration-200 ease-dashboard",
        collapsed ? "w-sidebar-collapsed px-2" : "w-sidebar px-3"
      )}
      aria-label="Main navigation"
    >
      <div className={cn("mb-4 flex shrink-0 items-center", collapsed ? "justify-center" : "justify-end px-2")}>
        <button
          type="button"
          onClick={toggle}
          disabled={!toggleEnabled}
          aria-expanded={!collapsed}
          aria-label={
            !toggleEnabled
              ? "Sidebar width is controlled externally"
              : collapsed
                ? "Expand sidebar"
                : "Collapse sidebar"
          }
          title={!toggleEnabled ? "Collapse is controlled by parent (pass onCollapsedChange to enable)" : undefined}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-dashboard-md text-dashboard-sidebar-text outline-none ring-dashboard-sidebar-active/0 transition-[background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-dashboard-sidebar-active/60",
            toggleEnabled ? "hover:bg-dashboard-sidebar-item" : "cursor-not-allowed opacity-50"
          )}
        >
          {collapsed ? iconChevronRight : iconChevronLeft}
        </button>
      </div>
      <div className={cn("mb-6", collapsed ? "flex justify-center px-0" : "px-2")}>
        <Link
          href="/"
          aria-label={collapsed ? "OnSite home" : undefined}
          className={cn(
            "flex h-9 items-center rounded-dashboard-md outline-none ring-dashboard-sidebar-active/0 transition-shadow hover:ring-2 hover:ring-dashboard-sidebar-active/40 focus-visible:ring-2 focus-visible:ring-dashboard-sidebar-active/60",
            collapsed ? "justify-center" : "gap-2"
          )}
        >
          <OnSiteMark className="h-8 w-8 shrink-0" />
          {!collapsed && (
            <span className="text-dashboard-md font-semibold text-dashboard-sidebar-text">OnSite</span>
          )}
        </Link>
      </div>
      <nav id="sidebar-main-nav" className="flex flex-1 flex-col gap-1">
        <SidebarItem
          href="/"
          icon={iconHome}
          label="Home"
          active={activeId === "home"}
          collapsed={collapsed}
        />
        <SidebarItem
          href="/planner"
          icon={iconCalendar}
          label="Planner"
          active={activeId === "schedule"}
          collapsed={collapsed}
        />
        <SidebarItem
          href="/daily-notes"
          icon={iconDailyNotes}
          label="Daily notes"
          active={activeId === "daily-notes"}
          collapsed={collapsed}
        />
      </nav>
    </aside>
  );
}
