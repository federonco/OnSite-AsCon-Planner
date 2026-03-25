"use client";

import { useState } from "react";
import { CHECKPOINT_TYPES, type CheckpointType } from "@/lib/constants";

interface CheckpointCreatorProps {
  sectionId: string;
  onCreated: () => void;
}

export default function CheckpointCreator({ sectionId, onCreated }: CheckpointCreatorProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chainage, setChainage] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [type, setType] = useState<CheckpointType>("bend");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setChainage("");
    setLat("");
    setLng("");
    setType("bend");
    setLabel("");
    setNotes("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chainage || !lat || !lng || !label) {
      setError("Chainage, lat, lng, and label are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_id: sectionId,
          chainage: parseFloat(chainage),
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          type,
          label,
          notes: notes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create checkpoint");
      }

      reset();
      setOpen(false);
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create checkpoint");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-600 border-dashed text-gray-400 hover:text-white text-sm py-2.5 px-3 rounded-lg transition-colors"
      >
        + Add Checkpoint
      </button>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          New Checkpoint
        </h3>
        <button
          onClick={() => { setOpen(false); reset(); }}
          className="text-gray-500 hover:text-gray-300 text-lg"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Type selector */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Type</label>
          <div className="grid grid-cols-3 gap-1">
            {CHECKPOINT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`text-xs py-1.5 px-2 rounded capitalize transition-colors ${
                  type === t
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Label */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. 45° Bend at McLennan"
            className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-1.5 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Chainage */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Chainage (m)</label>
          <input
            type="number"
            step="0.01"
            value={chainage}
            onChange={(e) => setChainage(e.target.value)}
            placeholder="e.g. 2500.00"
            className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-1.5 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Lat / Lng */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Latitude</label>
            <input
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="-31.xxx"
              className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-1.5 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Longitude</label>
            <input
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="115.xxx"
              className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-1.5 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional details..."
            rows={2}
            className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-1.5 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-3 rounded transition-colors disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Checkpoint"}
        </button>
      </form>
    </div>
  );
}
