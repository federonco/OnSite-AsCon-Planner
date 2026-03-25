import * as turf from "@turf/turf";
import { PIPE_LENGTH_M } from "./constants";

export interface PointCoord {
  lat: number;
  lng: number;
}

export interface RawAlignmentPoint {
  chainage: number;
  lat: number;
  lng: number;
  pipe_type?: string;
}

export interface GeneratedSegment {
  segment_number: number;
  chainage_start: number;
  chainage_end: number;
  lat_start: number;
  lng_start: number;
  lat_end: number;
  lng_end: number;
  pipe_type: string;
}

/**
 * Build a GeoJSON LineString from an array of survey points.
 */
export function buildLineString(points: RawAlignmentPoint[]) {
  const sorted = [...points].sort((a, b) => a.chainage - b.chainage);
  const coords = sorted.map((p) => [p.lng, p.lat]);
  return turf.lineString(coords);
}

/**
 * Subdivide a line of survey points into 12.2m pipe segments,
 * interpolating lat/lng at each cut.
 */
export function subdivideAlignment(
  points: RawAlignmentPoint[],
  pipeLengthM: number = PIPE_LENGTH_M
): GeneratedSegment[] {
  if (points.length < 2) return [];

  const line = buildLineString(points);
  const totalLengthKm = turf.length(line, { units: "kilometers" });
  const segmentLengthKm = pipeLengthM / 1000;

  const segments: GeneratedSegment[] = [];
  let segNum = 1;
  let chainageStart = points[0].chainage;

  for (let distKm = 0; distKm + segmentLengthKm <= totalLengthKm + 0.0001; distKm += segmentLengthKm) {
    const startPoint = turf.along(line, distKm, { units: "kilometers" });
    const endDistKm = Math.min(distKm + segmentLengthKm, totalLengthKm);
    const endPoint = turf.along(line, endDistKm, { units: "kilometers" });

    const [lngStart, latStart] = startPoint.geometry.coordinates;
    const [lngEnd, latEnd] = endPoint.geometry.coordinates;

    const chainageEnd = chainageStart + pipeLengthM;

    const pipeType = findPipeTypeAtChainage(points, chainageStart) || "MSCL DN1600";

    segments.push({
      segment_number: segNum,
      chainage_start: Math.round(chainageStart * 100) / 100,
      chainage_end: Math.round(chainageEnd * 100) / 100,
      lat_start: latStart,
      lng_start: lngStart,
      lat_end: latEnd,
      lng_end: lngEnd,
      pipe_type: pipeType,
    });

    chainageStart = chainageEnd;
    segNum++;
  }

  return segments;
}

/**
 * Find the pipe type at a given chainage by checking which survey point range covers it.
 */
function findPipeTypeAtChainage(points: RawAlignmentPoint[], chainage: number): string | undefined {
  const sorted = [...points].sort((a, b) => a.chainage - b.chainage);
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].chainage <= chainage && sorted[i].pipe_type) {
      return sorted[i].pipe_type;
    }
  }
  return sorted[0]?.pipe_type;
}

/**
 * Convert MGA Zone 50 (EPSG:28350) Easting/Northing to WGS84 lat/lng.
 * Simplified Redfearn's formula — accurate to ~1m for WA.
 */
export function mgaToWgs84(easting: number, northing: number): PointCoord {
  const zone = 50;
  const falseEasting = 500000;
  const falseNorthing = 10000000;
  const k0 = 0.9996;
  const a = 6378137;
  const f = 1 / 298.257222101;
  const e2 = 2 * f - f * f;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const centralMeridian = (zone * 6 - 183) * (Math.PI / 180);

  const N = northing - falseNorthing;
  const E = easting - falseEasting;

  const mu = N / (a * k0 * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const phi1 =
    mu +
    (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) +
    (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) +
    (151 * e1 ** 3 / 96) * Math.sin(6 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);
  const ep2 = e2 / (1 - e2);
  const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = ep2 * cosPhi1 * cosPhi1;
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const D = E / (N1 * k0);

  const lat =
    phi1 -
    (N1 * tanPhi1 / R1) *
      (D * D / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);

  const lng =
    centralMeridian +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) /
      cosPhi1;

  return {
    lat: lat * (180 / Math.PI),
    lng: lng * (180 / Math.PI),
  };
}

/**
 * Get the center point of a set of coordinates for initial map viewport.
 */
export function getCenterPoint(points: PointCoord[]): PointCoord {
  if (points.length === 0) return { lat: -31.95, lng: 115.86 }; // Perth default
  const sumLat = points.reduce((acc, p) => acc + p.lat, 0);
  const sumLng = points.reduce((acc, p) => acc + p.lng, 0);
  return { lat: sumLat / points.length, lng: sumLng / points.length };
}
