import type { Point } from "./Point";
import { pointInPolygon } from "./Polygon";
import { isValidWaterPolygon } from "./WaterGeometry";
import { zoneLabelPoint } from "./ZoneGeometry";

const EPSILON = 1e-6;

function cross(start: Point, end: Point, point: Point): number {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
}

function properlyIntersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c); const abD = cross(a, b, d); const cdA = cross(c, d, a); const cdB = cross(c, d, b);
  return abC * abD < -EPSILON && cdA * cdB < -EPSILON;
}

function interiorProbePoints(points: readonly Point[]): Point[] {
  const probes = points.flatMap((point, index) => { const next = points[(index + 1) % points.length]!; return [point, { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }]; });
  const center = zoneLabelPoint([...points]); if (center) probes.push(center); return probes;
}

export function districtPolygonsOverlap(first: readonly Point[], second: readonly Point[]): boolean {
  if (first.length < 3 || second.length < 3) return false;
  for (let a = 0; a < first.length; a += 1) for (let b = 0; b < second.length; b += 1) if (properlyIntersects(first[a]!, first[(a + 1) % first.length]!, second[b]!, second[(b + 1) % second.length]!)) return true;
  const strictlyInside = (point: Point, polygon: readonly Point[]) => pointInPolygon(point, polygon, { includeBoundary: false, epsilon: EPSILON });
  return interiorProbePoints(first).some((point) => strictlyInside(point, second)) || interiorProbePoints(second).some((point) => strictlyInside(point, first));
}

export function isValidDistrictPolygon(points: readonly Point[], others: readonly { id: string; points: Point[] }[], excludedId?: string): boolean {
  return isValidWaterPolygon(points) && !others.some((district) => district.id !== excludedId && districtPolygonsOverlap(points, district.points));
}
