import type { Point } from "./Point";
import { pointInPolygon } from "./Polygon";
import { distancePointToSegment, nearestPointOnSegment, segmentIntersection } from "./Segment";
import type { BuildingFootprint } from "../model/City";

export type BuildingPreset = "rectangle" | "l" | "u" | "h" | "courtyard";
export interface FootprintEdge { ringIndex: number; edgeIndex: number }

const EPSILON = 1e-5;

export function ringSignedArea(ring: readonly Point[]): number {
  let sum = 0;
  for (let index = 0; index < ring.length; index += 1) { const a = ring[index]!; const b = ring[(index + 1) % ring.length]!; sum += a.x * b.y - b.x * a.y; }
  return sum / 2;
}

export function ringPerimeter(ring: readonly Point[]): number {
  let value = 0;
  for (let index = 0; index < ring.length; index += 1) { const a = ring[index]!; const b = ring[(index + 1) % ring.length]!; value += Math.hypot(b.x - a.x, b.y - a.y); }
  return value;
}

export function buildingArea(footprint: BuildingFootprint): number { return Math.abs(ringSignedArea(footprint.outer)) - footprint.holes.reduce((sum, hole) => sum + Math.abs(ringSignedArea(hole)), 0); }
export function buildingPerimeter(footprint: BuildingFootprint): number { return ringPerimeter(footprint.outer) + footprint.holes.reduce((sum, hole) => sum + ringPerimeter(hole), 0); }
export function footprintCenter(footprint: BuildingFootprint): Point { const points = footprint.outer; const xs = points.map((point) => point.x); const ys = points.map((point) => point.y); return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }; }
export function footprintContainsPoint(footprint: BuildingFootprint, point: Point): boolean { return pointInPolygon(point, footprint.outer) && !footprint.holes.some((hole) => pointInPolygon(point, hole, { includeBoundary: false })); }

function rings(footprint: BuildingFootprint): Point[][] { return [footprint.outer, ...footprint.holes]; }
function ringAt(footprint: BuildingFootprint, ringIndex: number): Point[] | undefined { return ringIndex === 0 ? footprint.outer : footprint.holes[ringIndex - 1]; }
function clone(footprint: BuildingFootprint): BuildingFootprint { return structuredClone(footprint); }

function ringIsSimple(ring: readonly Point[]): boolean {
  if (ring.length < 3 || Math.abs(ringSignedArea(ring)) < EPSILON) return false;
  for (let first = 0; first < ring.length; first += 1) {
    const a = ring[first]!; const b = ring[(first + 1) % ring.length]!;
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite) || Math.hypot(a.x - b.x, a.y - b.y) < EPSILON) return false;
    for (let second = first + 1; second < ring.length; second += 1) if (Math.hypot(a.x - ring[second]!.x, a.y - ring[second]!.y) < EPSILON) return false;
    for (let second = first + 1; second < ring.length; second += 1) {
      const adjacent = second === first + 1 || first === 0 && second === ring.length - 1;
      if (!adjacent && segmentIntersection(a, b, ring[second]!, ring[(second + 1) % ring.length]!)) return false;
    }
    const previous = ring[(first - 1 + ring.length) % ring.length]!; const next = ring[(first + 1) % ring.length]!;
    const cross = (previous.x - a.x) * (next.y - a.y) - (previous.y - a.y) * (next.x - a.x); const dot = (previous.x - a.x) * (next.x - a.x) + (previous.y - a.y) * (next.y - a.y);
    if (Math.abs(cross) < EPSILON && dot > 0) return false;
  }
  return true;
}

function ringsIntersect(first: readonly Point[], second: readonly Point[]): boolean {
  for (let a = 0; a < first.length; a += 1) for (let b = 0; b < second.length; b += 1) if (segmentIntersection(first[a]!, first[(a + 1) % first.length]!, second[b]!, second[(b + 1) % second.length]!)) return true;
  return false;
}

export function isValidBuildingFootprint(footprint: BuildingFootprint): boolean {
  if (!ringIsSimple(footprint.outer) || !footprint.holes.every(ringIsSimple)) return false;
  for (const hole of footprint.holes) if (ringsIntersect(footprint.outer, hole) || !hole.every((point) => pointInPolygon(point, footprint.outer, { includeBoundary: false, epsilon: EPSILON }))) return false;
  for (let first = 0; first < footprint.holes.length; first += 1) for (let second = first + 1; second < footprint.holes.length; second += 1) { const a = footprint.holes[first]!; const b = footprint.holes[second]!; if (ringsIntersect(a, b) || pointInPolygon(a[0]!, b) || pointInPolygon(b[0]!, a)) return false; }
  return buildingArea(footprint) > EPSILON;
}

function transform(footprint: BuildingFootprint, operation: (point: Point) => Point): BuildingFootprint { return { outer: footprint.outer.map(operation), holes: footprint.holes.map((hole) => hole.map(operation)) }; }
export function translateFootprint(footprint: BuildingFootprint, delta: Point): BuildingFootprint { return transform(footprint, (point) => ({ x: point.x + delta.x, y: point.y + delta.y })); }
export function rotateFootprint(footprint: BuildingFootprint, radians: number, center = footprintCenter(footprint)): BuildingFootprint { const cos = Math.cos(radians); const sin = Math.sin(radians); return transform(footprint, (point) => { const x = point.x - center.x; const y = point.y - center.y; return { x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos }; }); }
export function scaleFootprint(footprint: BuildingFootprint, factor: number, center = footprintCenter(footprint)): BuildingFootprint { return transform(footprint, (point) => ({ x: center.x + (point.x - center.x) * factor, y: center.y + (point.y - center.y) * factor })); }
export function mirrorFootprint(footprint: BuildingFootprint, vertical = false, center = footprintCenter(footprint)): BuildingFootprint { return transform(footprint, (point) => vertical ? { x: point.x, y: center.y * 2 - point.y } : { x: center.x * 2 - point.x, y: point.y }); }

export function dragFootprintEdge(footprint: BuildingFootprint, edge: FootprintEdge, delta: Point): BuildingFootprint | undefined {
  const result = clone(footprint); const ring = ringAt(result, edge.ringIndex); if (!ring || edge.edgeIndex < 0 || edge.edgeIndex >= ring.length) return undefined; const a = ring[edge.edgeIndex]!; const b = ring[(edge.edgeIndex + 1) % ring.length]!; const length = Math.hypot(b.x - a.x, b.y - a.y); if (length < EPSILON) return undefined; const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length }; const amount = delta.x * normal.x + delta.y * normal.y; ring[edge.edgeIndex] = { x: a.x + normal.x * amount, y: a.y + normal.y * amount }; ring[(edge.edgeIndex + 1) % ring.length] = { x: b.x + normal.x * amount, y: b.y + normal.y * amount }; return result;
}

export function extrudeFootprintEdge(footprint: BuildingFootprint, edgeIndex: number, distance: number): BuildingFootprint | undefined {
  const result = clone(footprint); const ring = result.outer; if (edgeIndex < 0 || edgeIndex >= ring.length || Math.abs(distance) < EPSILON) return undefined; const a = ring[edgeIndex]!; const b = ring[(edgeIndex + 1) % ring.length]!; const length = Math.hypot(b.x - a.x, b.y - a.y); if (length < EPSILON) return undefined; const sign = Math.sign(ringSignedArea(ring)) || 1; const normal = { x: sign * (b.y - a.y) / length, y: sign * -(b.x - a.x) / length }; const a2 = { x: a.x + normal.x * distance, y: a.y + normal.y * distance }; const b2 = { x: b.x + normal.x * distance, y: b.y + normal.y * distance }; if (edgeIndex === ring.length - 1) ring.push(a2, b2); else ring.splice(edgeIndex + 1, 0, a2, b2); return result;
}

export function footprintEdgeOutwardNormal(footprint: BuildingFootprint, edgeIndex: number): Point | undefined { const a = footprint.outer[edgeIndex]; const b = footprint.outer[(edgeIndex + 1) % footprint.outer.length]; if (!a || !b) return undefined; const length = Math.hypot(b.x - a.x, b.y - a.y); if (length < EPSILON) return undefined; const sign = Math.sign(ringSignedArea(footprint.outer)) || 1; return { x: sign * (b.y - a.y) / length, y: sign * -(b.x - a.x) / length }; }

export function nearestFootprintEdge(footprint: BuildingFootprint, point: Point): (FootprintEdge & { point: Point; distance: number }) | undefined {
  let nearest: (FootprintEdge & { point: Point; distance: number }) | undefined;
  rings(footprint).forEach((ring, ringIndex) => ring.forEach((start, edgeIndex) => { const end = ring[(edgeIndex + 1) % ring.length]!; const projected = nearestPointOnSegment(point, start, end); const distance = Math.hypot(point.x - projected.x, point.y - projected.y); if (!nearest || distance < nearest.distance) nearest = { ringIndex, edgeIndex, point: projected, distance }; }));
  return nearest;
}

export function createBuildingPreset(preset: BuildingPreset, center: Point, width: number, depth: number, rotation = 0): BuildingFootprint {
  const w = Math.max(4, width); const d = Math.max(4, depth); const t = Math.max(0.5, Math.min(w, d) * 0.28); let outer: Point[]; let holes: Point[][] = [];
  if (preset === "l") outer = [{ x: -w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 + t }, { x: -w / 2 + t, y: -d / 2 + t }, { x: -w / 2 + t, y: d / 2 }, { x: -w / 2, y: d / 2 }];
  else if (preset === "u") outer = [{ x: -w / 2, y: -d / 2 }, { x: -w / 2 + t, y: -d / 2 }, { x: -w / 2 + t, y: d / 2 - t }, { x: w / 2 - t, y: d / 2 - t }, { x: w / 2 - t, y: -d / 2 }, { x: w / 2, y: -d / 2 }, { x: w / 2, y: d / 2 }, { x: -w / 2, y: d / 2 }];
  else if (preset === "h") outer = [{ x: -w / 2, y: -d / 2 }, { x: -w / 2 + t, y: -d / 2 }, { x: -w / 2 + t, y: -t / 2 }, { x: w / 2 - t, y: -t / 2 }, { x: w / 2 - t, y: -d / 2 }, { x: w / 2, y: -d / 2 }, { x: w / 2, y: d / 2 }, { x: w / 2 - t, y: d / 2 }, { x: w / 2 - t, y: t / 2 }, { x: -w / 2 + t, y: t / 2 }, { x: -w / 2 + t, y: d / 2 }, { x: -w / 2, y: d / 2 }];
  else { outer = [{ x: -w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 }, { x: w / 2, y: d / 2 }, { x: -w / 2, y: d / 2 }]; if (preset === "courtyard") holes = [[{ x: -w / 2 + t, y: -d / 2 + t }, { x: -w / 2 + t, y: d / 2 - t }, { x: w / 2 - t, y: d / 2 - t }, { x: w / 2 - t, y: -d / 2 + t }]]; }
  const local = { outer, holes }; return rotateFootprint(translateFootprint(local, center), rotation, center);
}
