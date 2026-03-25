/** Length of each pipe segment in meters */
export const PIPE_LENGTH_M = 12.2;

/** Target pipes per day for progress tracking */
export const TARGET_PIPES_PER_DAY = 2.5;

/** Backfill zone: distance behind the laying front (meters) */
export const BACKFILL_ZONE_M = 60;

/** Lookahead zone: distance ahead of the laying front (meters) */
export const LOOKAHEAD_ZONE_M = 200;

/** Segment status options */
export const SEGMENT_STATUSES = ["pending", "installed", "backfilled"] as const;
export type SegmentStatus = (typeof SEGMENT_STATUSES)[number];

/** Checkpoint types */
export const CHECKPOINT_TYPES = ["bend", "fitting", "crossing", "valve", "tie-in", "other"] as const;
export type CheckpointType = (typeof CHECKPOINT_TYPES)[number];

/** Map color coding by status */
export const STATUS_COLORS: Record<SegmentStatus, string> = {
  pending: "#3B8BD4",
  installed: "#1D9E75",
  backfilled: "#EF9F27",
};
