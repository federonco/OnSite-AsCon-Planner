import type { EventGroup } from "@/types/dashboard-events";

export const mockEventGroups: EventGroup[] = [
  {
    id: "g1",
    title: "Civil & earthworks",
    events: [
      {
        id: "e1",
        title: "Trench excavation — Section 12",
        subtitle: "Crew A · MSCL DN1600",
        assigneeInitials: "AK",
        timeline: { startCol: 0, spanCols: 4, accent: "blue", label: "Excavation" },
        subEvents: [
          { id: "s1", title: "Shoring install", assigneeInitials: "LM", timeline: { startCol: 1, spanCols: 2, accent: "teal" } },
          { id: "s2", title: "Dewatering check", assigneeInitials: "PT", timeline: { startCol: 3, spanCols: 2, accent: "lightPurple" } },
        ],
      },
      {
        id: "e2",
        title: "Bedding placement",
        subtitle: "Approved material only",
        assigneeInitials: "JR",
        timeline: { startCol: 4, spanCols: 3, accent: "purple", label: "Bedding" },
      },
    ],
  },
  {
    id: "g2",
    title: "Pipe installation",
    events: [
      {
        id: "e3",
        title: "Joint welding — strings 40–48",
        subtitle: "QA hold points",
        assigneeInitials: "CW",
        timeline: { startCol: 2, spanCols: 5, accent: "purple", label: "Welding" },
        subEvents: [
          { id: "s3", title: "NDT batch", assigneeInitials: "ND", timeline: { startCol: 5, spanCols: 2, accent: "blue" } },
        ],
      },
      {
        id: "e4",
        title: "Backfill & compaction",
        assigneeInitials: "MV",
        timeline: { startCol: 6, spanCols: 4, accent: "teal", label: "Backfill" },
      },
    ],
  },
];
