import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { subdivideAlignment, mgaToWgs84 } from "@/lib/geo-utils";
import type { RawAlignmentPoint } from "@/lib/geo-utils";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const sectionId = formData.get("section_id") as string;
    const isPreview = formData.get("preview") === "true";

    if (!file || !sectionId) {
      return NextResponse.json(
        { error: "file and section_id are required" },
        { status: 400 }
      );
    }

    // Parse Excel
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    if (rows.length < 2) {
      return NextResponse.json(
        { error: "Excel must have at least 2 data rows" },
        { status: 400 }
      );
    }

    // Helper to get a numeric value from a row with flexible column names
    const num = (row: Record<string, unknown>, ...keys: string[]): number => {
      for (const k of keys) {
        if (row[k] != null) return parseFloat(String(row[k]));
      }
      return NaN;
    };
    const str = (row: Record<string, unknown>, ...keys: string[]): string | undefined => {
      for (const k of keys) {
        if (row[k] != null) return String(row[k]);
      }
      return undefined;
    };

    // Parse rows into alignment points
    const points: RawAlignmentPoint[] = [];
    for (const row of rows) {
      const chainage = num(row, "Chainage", "chainage", "CHAINAGE");
      if (isNaN(chainage)) continue;

      let lat = num(row, "Lat", "lat", "LAT", "Latitude", "latitude");
      let lng = num(row, "Lng", "lng", "LNG", "Longitude", "longitude");

      // If lat/lng not available, try Easting/Northing (MGA Zone 50)
      if (isNaN(lat) || isNaN(lng)) {
        const easting = num(row, "Easting", "easting", "EASTING", "E");
        const northing = num(row, "Northing", "northing", "NORTHING", "N");
        if (!isNaN(easting) && !isNaN(northing)) {
          const wgs = mgaToWgs84(easting, northing);
          lat = wgs.lat;
          lng = wgs.lng;
        }
      }

      if (isNaN(lat) || isNaN(lng)) continue;

      const pipeType = str(row, "Pipe_Type", "pipe_type", "PIPE_TYPE", "PipeType") ?? "MSCL DN1600";

      points.push({ chainage, lat, lng, pipe_type: String(pipeType) });
    }

    if (points.length < 2) {
      return NextResponse.json(
        { error: "Could not parse enough valid points from Excel (need at least 2 with coordinates)" },
        { status: 400 }
      );
    }

    // Subdivide into 12.2m segments
    const segments = subdivideAlignment(points);

    if (segments.length === 0) {
      return NextResponse.json(
        { error: "No segments generated. Check that the alignment is long enough." },
        { status: 400 }
      );
    }

    // Preview mode — return without saving
    if (isPreview) {
      return NextResponse.json({
        totalSegments: segments.length,
        chainageRange: `Ch ${segments[0].chainage_start.toFixed(1)} – ${segments[segments.length - 1].chainage_end.toFixed(1)}m`,
        segments: segments.slice(0, 10), // First 10 for preview
      });
    }

    // Save to database
    const dbRows = segments.map((seg) => ({
      section_id: sectionId,
      segment_number: seg.segment_number,
      chainage_start: seg.chainage_start,
      chainage_end: seg.chainage_end,
      lat_start: seg.lat_start,
      lng_start: seg.lng_start,
      lat_end: seg.lat_end,
      lng_end: seg.lng_end,
      pipe_type: seg.pipe_type,
    }));

    // Insert in batches of 500
    const batchSize = 500;
    let totalInserted = 0;
    for (let i = 0; i < dbRows.length; i += batchSize) {
      const batch = dbRows.slice(i, i + batchSize);
      const { error } = await supabase.from("alignment_segments").insert(batch);
      if (error) {
        return NextResponse.json(
          { error: `Insert failed at batch ${Math.floor(i / batchSize) + 1}: ${error.message}` },
          { status: 500 }
        );
      }
      totalInserted += batch.length;
    }

    return NextResponse.json({
      success: true,
      totalSegments: totalInserted,
      chainageRange: `Ch ${segments[0].chainage_start.toFixed(1)} – ${segments[segments.length - 1].chainage_end.toFixed(1)}m`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error during import";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
