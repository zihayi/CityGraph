import type { Point } from "./Point";
import { distancePointToSegment } from "./Segment";
import { pointInPolygon } from "./Polygon";

export function zoneArea(polygon: Point[]): number {
  let sum = 0;
  for (let index = 0; index < polygon.length; index += 1) { const a = polygon[index]!; const b = polygon[(index + 1) % polygon.length]!; sum += a.x * b.y - b.x * a.y; }
  return Math.abs(sum) / 2;
}

export function zonePerimeter(polygon: Point[]): number {
  return polygon.reduce((total, point, index) => { const next = polygon[(index + 1) % polygon.length]; return next ? total + Math.hypot(next.x - point.x, next.y - point.y) : total; }, 0);
}

export function formatZoneArea(squareMeters: number): string {
  return `${formatValue(squareMeters * 3 / 2000)} 亩`;
}

export function formatZonePerimeter(meters: number): string {
  return meters >= 1000 ? `${formatValue(meters / 1000)} km` : `${formatValue(meters)} m`;
}

export function nearestZoneSegment(point: Point, polygon: Point[]): { index: number; distance: number } | undefined {
  let nearest: { index: number; distance: number } | undefined;
  for (let index = 0; index < polygon.length; index += 1) { const next = polygon[(index + 1) % polygon.length]; if (!next) continue; const value = distancePointToSegment(point, polygon[index]!, next); if (!nearest || value < nearest.distance) nearest = { index, distance: value }; }
  return nearest;
}

export function zoneLabelPoint(polygon: Point[]): Point | undefined {
  if (polygon.length < 3) return undefined; let crossSum = 0; let xSum = 0; let ySum = 0;
  for (let index = 0; index < polygon.length; index += 1) { const a = polygon[index]!; const b = polygon[(index + 1) % polygon.length]!; const cross = a.x * b.y - b.x * a.y; crossSum += cross; xSum += (a.x + b.x) * cross; ySum += (a.y + b.y) * cross; }
  if (Math.abs(crossSum) > 1e-9) { const centroid = { x: xSum / (3 * crossSum), y: ySum / (3 * crossSum) }; if (pointInPolygon(centroid, polygon)) return centroid; }
  const xs = polygon.map((point) => point.x); const ys = polygon.map((point) => point.y); const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }; let best: { point: Point; clearance: number } | undefined;
  for (let yIndex = 1; yIndex < 10; yIndex += 1) for (let xIndex = 1; xIndex < 10; xIndex += 1) { const point = { x: bounds.minX + (bounds.maxX - bounds.minX) * xIndex / 10, y: bounds.minY + (bounds.maxY - bounds.minY) * yIndex / 10 }; if (!pointInPolygon(point, polygon)) continue; const clearance = polygon.reduce((minimum, start, index) => Math.min(minimum, distancePointToSegment(point, start, polygon[(index + 1) % polygon.length]!)), Number.POSITIVE_INFINITY); if (!best || clearance > best.clearance) best = { point, clearance }; }
  return best?.point ?? { ...polygon[0]! };
}

function formatValue(value: number): string { return value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1).replace(/\.0$/, "") : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""); }
