import polygonClipping, { type Polygon } from "polygon-clipping";
import type { Bounds, Point } from "./Point";
import type { BuildingFootprint } from "../model/City";

export function pointsBounds(points: readonly Point[]): Bounds {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const point of points) { minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
export function insideBounds(point: Point, bounds: Bounds): boolean { return point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height; }
export function overlappingBounds(a: Bounds, b: Bounds): boolean { return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y; }
export function boundsCorners(bounds: Bounds): Point[] { return [{ x: bounds.x, y: bounds.y }, { x: bounds.x + bounds.width, y: bounds.y }, { x: bounds.x + bounds.width, y: bounds.y + bounds.height }, { x: bounds.x, y: bounds.y + bounds.height }]; }
function polygon(footprint: BuildingFootprint): Polygon { return [footprint.outer, ...footprint.holes].map((ring) => ring.map((point) => [point.x, point.y])); }

export function clipFootprint(footprint: BuildingFootprint, bounds: Bounds): BuildingFootprint[] {
  if (!overlappingBounds(pointsBounds(footprint.outer), bounds)) return [];
  if (footprint.outer.every((point) => insideBounds(point, bounds))) return [footprint];
  const result = polygonClipping.intersection(polygon(footprint), [boundsCorners(bounds).map((point): [number, number] => [point.x, point.y])]);
  return result.map((rings) => ({ outer: rings[0]!.slice(0, -1).map(([x, y]) => ({ x, y })), holes: rings.slice(1).map((ring) => ring.slice(0, -1).map(([x, y]) => ({ x, y }))) }));
}

/** Existing water/park/zone models use simple polygons. Open holes along horizontal cuts,
 * preserving the covered area instead of filling lakes' islands or parks' exclusions. */
export function simpleAreaParts(footprint: BuildingFootprint): Point[][] {
  if (!footprint.holes.length) return [footprint.outer];
  const bounds = pointsBounds(footprint.outer);
  const cuts = [bounds.y - 1, ...new Set(footprint.holes.map((hole) => { const box = pointsBounds(hole); return box.y + box.height / 2; })), bounds.y + bounds.height + 1].sort((a, b) => a - b);
  const parts: Point[][] = [];
  for (let index = 1; index < cuts.length; index += 1) {
    const strip = { x: bounds.x - 1, y: cuts[index - 1]!, width: bounds.width + 2, height: cuts[index]! - cuts[index - 1]! };
    for (const part of clipFootprint(footprint, strip)) {
      if (part.holes.length) throw new Error("Unsplit area hole");
      if (part.outer.length >= 3) parts.push(part.outer);
    }
  }
  return parts;
}

export function clipPolyline(points: readonly Point[], bounds: Bounds): Point[][] {
  const result: Point[][] = []; let path: Point[] = [];
  const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-7;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!; const b = points[index]!; const dx = b.x - a.x; const dy = b.y - a.y;
    let from = 0; let to = 1; let valid = true;
    for (const [p, q] of [[-dx, a.x - bounds.x], [dx, bounds.x + bounds.width - a.x], [-dy, a.y - bounds.y], [dy, bounds.y + bounds.height - a.y]] as const) {
      if (Math.abs(p) < 1e-12) { if (q < 0) { valid = false; break; } }
      else if (p < 0) from = Math.max(from, q / p); else to = Math.min(to, q / p);
    }
    if (!valid || from >= to) { if (path.length > 1) result.push(path); path = []; continue; }
    const start = from === 0 ? a : { x: a.x + dx * from, y: a.y + dy * from };
    const end = to === 1 ? b : { x: a.x + dx * to, y: a.y + dy * to };
    if (path.length && !same(path.at(-1)!, start)) { if (path.length > 1) result.push(path); path = []; }
    if (!path.length) path.push(start);
    if (!same(path.at(-1)!, end)) path.push(end);
    if (to < 1) { if (path.length > 1) result.push(path); path = []; }
  }
  if (path.length > 1) result.push(path);
  return result;
}
