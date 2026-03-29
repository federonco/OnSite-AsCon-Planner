"use client";

import { useState, useEffect } from "react";
import { DrainerProgress } from "@/lib/planner-types";

interface DrainerSection {
  id: string;
  name: string;
  crew_id: string;
}

interface DrainerLinkProps {
  sectionId: string | null;
  crewId: string;
  onSectionChange: (sectionId: string | null) => void;
}

export default function DrainerLink({
  sectionId,
  crewId,
  onSectionChange,
}: DrainerLinkProps) {
  const [sections, setSections] = useState<DrainerSection[]>([]);
  const [progress, setProgress] = useState<DrainerProgress | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch available drainer sections for this crew
  useEffect(() => {
    if (!crewId) return;

    const fetchSections = async () => {
      try {
        const res = await fetch(`/api/planner/drainer/sections?crew_id=${crewId}`);
        if (res.ok) {
          const data = await res.json();
          setSections(data);
        }
      } catch {
        // Sections endpoint may not exist yet
        setSections([]);
      }
    };

    fetchSections();
  }, [crewId]);

  // Fetch progress when section is selected
  useEffect(() => {
    if (!sectionId) {
      setProgress(null);
      return;
    }

    const fetchProgress = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/planner/drainer?section_id=${sectionId}`);
        if (res.ok) {
          setProgress(await res.json());
        }
      } catch {
        setProgress(null);
      } finally {
        setLoading(false);
      }
    };

    fetchProgress();
  }, [sectionId]);

  return (
    <div className="space-y-2">
      <label className="block text-sm text-gray-400">Link to Drainer Section</label>
      <select
        value={sectionId || ""}
        onChange={(e) => onSectionChange(e.target.value || null)}
        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
      >
        <option value="">None</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {/* Progress bar */}
      {sectionId && (
        <div className="bg-gray-800 rounded-lg p-3">
          {loading ? (
            <div className="text-gray-500 text-sm">Loading progress...</div>
          ) : progress ? (
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Pipeline Progress</span>
                <span className="text-white font-medium">{progress.progress_percent}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${progress.progress_percent}%`,
                    backgroundColor:
                      progress.progress_percent >= 100
                        ? "#1D9E75"
                        : progress.progress_percent > 50
                        ? "#EF9F27"
                        : "#3B8BD4",
                  }}
                />
              </div>
              <div className="flex gap-4 text-xs text-gray-500">
                <span>{progress.total_segments} segments</span>
                <span>{progress.installed_count} installed</span>
                <span>{progress.backfilled_count} backfilled</span>
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-sm">No progress data available</div>
          )}
        </div>
      )}
    </div>
  );
}
