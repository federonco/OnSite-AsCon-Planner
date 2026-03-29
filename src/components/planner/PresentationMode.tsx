"use client";

import { useEffect, useRef, useState } from "react";
import { PlannerActivity } from "@/lib/planner-types";
import PlannerGantt from "./PlannerGantt";

interface CrewInfo {
  id: string;
  name: string;
  index: number;
}

interface PresentationModeProps {
  activities: PlannerActivity[];
  crewMap: Map<string, CrewInfo>;
  onClose: () => void;
}

export default function PresentationMode({
  activities,
  crewMap,
  onClose,
}: PresentationModeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    // Try to enter fullscreen
    containerRef.current?.requestFullscreen?.().catch(() => {});

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
  }, [onClose]);

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const ganttEl = containerRef.current?.querySelector(".planner-gantt");
      if (!ganttEl) return;

      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(ganttEl as HTMLElement, {
        backgroundColor: "#111827",
        scale: 2,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [canvas.width / 2, canvas.height / 2],
      });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save("planner-gantt.pdf");
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-gray-950 flex flex-col"
    >
      {/* Minimal header */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800">
        <div className="text-white font-semibold text-lg">
          Project Schedule
          <span className="text-gray-500 text-sm ml-3">
            {new Date().toLocaleDateString("en-AU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportPdf}
            disabled={exporting}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white text-sm rounded-md"
          >
            {exporting ? "Exporting..." : "Export PDF"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-md"
          >
            Exit
          </button>
        </div>
      </div>

      {/* Gantt fills remaining space */}
      <div className="flex-1 overflow-auto p-6">
        <PlannerGantt
          activities={activities}
          crewMap={crewMap}
          horizon={4}
          onActivityClick={() => {}}
        />
      </div>
    </div>
  );
}
