"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface SearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface AddressSearchProps {
  onSelect: (lat: number, lng: number, label: string) => void;
}

async function geocode(q: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q,
    format: "json",
    limit: "5",
    countrycodes: "au",
    viewbox: "114.5,-33.0,117.0,-30.5",
    bounded: "0",
  });
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    { headers: { "User-Agent": "OnSitePipelineTracker/1.0" } }
  );
  return res.json();
}

export default function AddressSearch({ onSelect }: AddressSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectResult = useCallback(
    (result: SearchResult) => {
      const lat = parseFloat(result.lat);
      const lng = parseFloat(result.lon);
      const shortName = result.display_name.split(",").slice(0, 2).join(",").trim();
      setQuery(shortName);
      setOpen(false);
      setResults([]);
      onSelect(lat, lng, shortName);
    },
    [onSelect]
  );

  // Debounced search for dropdown while typing
  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (value.trim().length < 3) {
        setResults([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const data = await geocode(value);
        setResults(data);
        setOpen(data.length > 0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  };

  // Enter: immediately search and fly to first result
  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // If dropdown is open, pick first result
      if (open && results.length > 0) {
        selectResult(results[0]);
        return;
      }
      // Otherwise, force an immediate search
      if (query.trim().length < 3) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setLoading(true);
      try {
        const data = await geocode(query);
        if (data.length > 0) {
          selectResult(data[0]);
        } else {
          setResults([]);
          setOpen(false);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full max-w-sm">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
          🔍
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search address or location..."
          className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded-lg pl-9 pr-3 py-2 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 text-xs animate-pulse">
            ...
          </span>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-[9999] mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                onClick={() => selectResult(r)}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-b-0"
              >
                <div className="truncate font-medium">
                  {r.display_name.split(",").slice(0, 2).join(",")}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {r.display_name.split(",").slice(2).join(",").trim()}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
