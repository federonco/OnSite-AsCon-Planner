import { SegmentStatus, CheckpointType } from "./constants";

export interface AlignmentSegment {
  id: string;
  section_id: string;
  segment_number: number;
  chainage_start: number;
  chainage_end: number;
  lat_start: number;
  lng_start: number;
  lat_end: number;
  lng_end: number;
  pipe_type: string;
  created_at: string;
}

export interface AlignmentCheckpoint {
  id: string;
  section_id: string;
  chainage: number;
  lat: number;
  lng: number;
  type: CheckpointType;
  label: string;
  notes: string | null;
  created_at: string;
}

export interface AlignmentProgress {
  id: string;
  segment_id: string;
  status: SegmentStatus;
  status_date: string;
  updated_by: string;
  created_at: string;
}

/** Segment with its latest status resolved */
export interface SegmentWithStatus extends AlignmentSegment {
  status: SegmentStatus;
  status_date: string | null;
}
