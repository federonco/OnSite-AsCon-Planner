# OnSite Pipeline Tracker

## Project Overview
Pipeline tracker for a 27km DN1600 MSCL aqueduct (Water Corporation, Perth WA). Part of the OnSite ecosystem of construction management apps.

The app visualizes the pipeline alignment on a satellite map, subdivides it into 12.2m pipe segments, tracks installation and backfill progress, and identifies upcoming checkpoints (bends, fittings, crossings, valves, tie-ins).

## Tech Stack
- **Framework:** Next.js 14+ with TypeScript and App Router
- **Styling:** Tailwind CSS
- **Database:** Supabase (existing instance — see schema below)
- **Maps:** Leaflet + React-Leaflet with ESRI World Imagery satellite tiles (free, no API key)
- **Geospatial:** Turf.js for line operations (lineChunk, along, length, etc.)
- **Excel parsing:** SheetJS (xlsx) for importing surveyor data
- **Deployment:** Vercel (free tier)
- **Auth:** Supabase Auth (already configured in ecosystem)

## Existing Supabase Schema (DO NOT MODIFY)
The OnSite ecosystem already has these tables. The pipeline tracker hooks into them:

```
regions
  └── crews (region_id → regions)
        ├── drainer_sections (crew_id → crews)  ← THIS IS OUR "SECTIONS"
        │     └── drainer_pipe_records (section_id → drainer_sections)
        └── user_app_roles (+ RPC has_role where used) — shared auth model
```

### Key Conventions
- `crew_id` is always uuid FK → `crews`, NEVER plain text
- `start_chainage` / `end_chainage` are type `numeric`
- `created_at` is type `timestamptz`
- RLS in this repo’s SQL migrations uses `get_admin_crew_ids()` (shared function; implementation may read `user_app_roles` / `has_role` — see main Supabase project, not duplicated here)
- Constants: `PIPE_LENGTH_M = 12.2`, `TARGET_PIPES_PER_DAY = 2.5`

## New Tables for Pipeline Tracker

### `alignment_segments`
Each 12.2m pipe along the alignment. Linked to a `drainer_sections` row.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| section_id | uuid FK → drainer_sections | NOT NULL |
| segment_number | integer | Sequential within section |
| chainage_start | numeric | Meters from start |
| chainage_end | numeric | chainage_start + 12.2 |
| lat_start | double precision | |
| lng_start | double precision | |
| lat_end | double precision | |
| lng_end | double precision | |
| pipe_type | text | From surveyor Excel (e.g. "MSCL DN1600") |
| created_at | timestamptz | default now() |

### `alignment_checkpoints`
Bends, fittings, crossings — added by admin only.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| section_id | uuid FK → drainer_sections | NOT NULL |
| chainage | numeric | Position along alignment |
| lat | double precision | |
| lng | double precision | |
| type | text | CHECK: bend, fitting, crossing, valve, tie-in, other |
| label | text | Short name |
| notes | text | Detailed description |
| created_at | timestamptz | default now() |

### `alignment_progress`
Status changes for each segment. Separate table to keep geometry immutable and maintain history.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| segment_id | uuid FK → alignment_segments | NOT NULL |
| status | text | CHECK: pending, installed, backfilled |
| status_date | date | When the status changed |
| updated_by | text | User identifier |
| created_at | timestamptz | default now() |

## Excel Input Format
The surveyor provides an Excel (.xlsx) with at minimum:
- `Chainage` (numeric, meters) — progressive distance along alignment
- `Pipe_Type` (text) — e.g. "MSCL DN1600"
- `Lat` (numeric, optional) — WGS84 latitude
- `Lng` (numeric, optional) — WGS84 longitude
- `Easting` / `Northing` (numeric, optional) — if in MGA Zone 50, convert to WGS84

The importer reads the Excel, subdivides into 12.2m segments, interpolates coordinates, and saves to `alignment_segments`.

## Map Viewport Logic

### Color coding
- **Blue** (#3B8BD4): Pending segments (not yet installed)
- **Green** (#1D9E75): Installed segments
- **Orange** (#EF9F27): Backfilled segments

### Viewport zones (relative to laying front)
- **Backfill zone**: 60m behind laying front (~5 segments)
- **Laying front**: Last installed segment (current crew position)
- **Lookahead zone**: 200m ahead of laying front (~16 segments) with checkpoint markers

### Checkpoint markers (by type)
- Bend: orange diamond
- Fitting: blue circle
- Crossing: red triangle
- Valve: green square
- Tie-in: purple star

## File Structure
```
src/
  app/
    tracker/
      page.tsx           — Main tracker page with map
    api/
      segments/
        route.ts         — CRUD for alignment_segments
      checkpoints/
        route.ts         — CRUD for alignment_checkpoints
      progress/
        route.ts         — Update segment status
      import/
        route.ts         — Excel import endpoint
  components/
    tracker/
      PipelineMap.tsx     — Main Leaflet map component
      SegmentLayer.tsx    — Colored polyline segments
      CheckpointLayer.tsx — Checkpoint markers
      ViewportControls.tsx — "Go to front" + lookahead panel
      ExcelImporter.tsx   — Upload + preview + confirm
      StatusUpdater.tsx   — Change segment status (single/batch)
      LookaheadPanel.tsx  — Side panel with upcoming checkpoints
  lib/
    constants.ts          — PIPE_LENGTH_M, targets, etc. (EXISTING)
    supabase.ts           — Supabase client (EXISTING)
    geo-utils.ts          — Turf.js helpers for line operations
```

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=<existing>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<existing>
```

No additional API keys needed. ESRI tiles are free and keyless.

## RLS Policies
All three new tables need RLS enabled. Policies should use:
```sql
CREATE POLICY "Users can view segments for their crews"
ON alignment_segments FOR SELECT
USING (
  section_id IN (
    SELECT id FROM drainer_sections
    WHERE crew_id = ANY(get_admin_crew_ids())
  )
);
```
Same pattern for INSERT/UPDATE on all three tables.
