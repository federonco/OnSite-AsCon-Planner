"use client";

import Image from "next/image";
import Link from "next/link";
import fabicon from "@/lib/public/fabicon.png";
import { SidebarItem } from "./SidebarItem";

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
  collapsed?: boolean;
}

export function Sidebar({ activeId = "schedule", collapsed }: SidebarProps) {
  return (
    <aside
      className="flex h-full w-sidebar shrink-0 flex-col bg-dashboard-sidebar px-3 py-6"
      aria-label="Main navigation"
    >
      <div className="mb-8 px-2">
        <Link href="/" className="flex h-9 items-center gap-2 rounded-dashboard-md outline-none ring-dashboard-sidebar-active/0 transition-shadow hover:ring-2 hover:ring-dashboard-sidebar-active/40 focus-visible:ring-2 focus-visible:ring-dashboard-sidebar-active/60">
          <Image
            src={fabicon}
            alt="OnSite"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-dashboard-md object-cover"
            priority
          />
          {!collapsed && (
            <span className="text-dashboard-md font-semibold text-dashboard-sidebar-text">OnSite</span>
          )}
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
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
