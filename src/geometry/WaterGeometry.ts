import type { Point } from "./Point";
import { smoothClosedPolygon, type PolygonEdgeStyle } from "./Polygon";
import { segmentIntersection } from "./Segment";

const EPSILON = 1e-5;

export function waterArea(points: readonly Point[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) { const a = points[index]!; const b = points[(index + 1) % points.length]!; sum += a.x * b.y - b.x * a.y; }
  return Math.abs(sum) / 2;
}

export function waterPerimeter(points: readonly Point[]): number {
  return points.reduce((total, point, index) => { const next = points[(index + 1) % points.length]; return next ? total + Math.hypot(next.x - point.x, next.y - point.y) : total; }, 0);
}

export function isValidWaterPolygon(points: readonly Point[]): boolean {
  if (points.length < 3 || waterArea(points) < 1) return false;
  for (let first = 0; first < points.length; first += 1) {
    const a = points[first]!; const b = points[(first + 1) % points.length]!;
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite) || Math.hypot(a.x - b.x, a.y - b.y) < EPSILON) return false;
    for (let second = first + 1; second < points.length; second += 1) if (Math.hypot(a.x - points[second]!.x, a.y - points[second]!.y) < EPSILON) return false;
    for (let second = first + 1; second < points.length; second += 1) {
      const adjacent = second === first + 1 || first === 0 && second === points.length - 1;
      if (!adjacent && segmentIntersection(a, b, points[second]!, points[(second + 1) % points.length]!)) return false;
    }
  }
  return true;
}

export function translateWater(points: readonly Point[], delta: Point): Point[] {
  return points.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y }));
}

export function formatWaterArea(squareMeters: number): string {
  if (squareMeters >= 1_000_000) return `${formatValue(squareMeters / 1_000_000)} km²`;
  if (squareMeters >= 10_000) return `${formatValue(squareMeters / 10_000)} ha`;
  return `${formatValue(squareMeters)} m²`;
}

export function createIrregularLakeInRectangle(first: Point, opposite: Point, seed: number, pointCount = 24, edgeStyle: PolygonEdgeStyle = "straight"): Point[] {
  const minX = Math.min(first.x, opposite.x); const maxX = Math.max(first.x, opposite.x); const minY = Math.min(first.y, opposite.y); const maxY = Math.max(first.y, opposite.y);
  if (maxX - minX < 8 || maxY - minY < 8) return [];
  const count = Math.max(12, Math.round(pointCount)); const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }; let state = Math.floor(seed) || 1;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  const raw = Array.from({ length: count }, (_, index) => {
    const step = Math.PI * 2 / count; const angle = index * step + (random() - 0.5) * step * 0.42; const radius = 0.74 + random() * 0.25;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
  const xs = raw.map((point) => point.x); const ys = raw.map((point) => point.y); const rawMinX = Math.min(...xs); const rawMaxX = Math.max(...xs); const rawMinY = Math.min(...ys); const rawMaxY = Math.max(...ys);
  const polygon = raw.map((point) => ({ x: minX + (point.x - rawMinX) / (rawMaxX - rawMinX) * (maxX - minX), y: minY + (point.y - rawMinY) / (rawMaxY - rawMinY) * (maxY - minY) }));
  return edgeStyle === "smooth" ? smoothClosedPolygon(polygon, 1) : polygon;
}

function formatValue(value: number): string { return value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1).replace(/\.0$/, "") : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""); }
