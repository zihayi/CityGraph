import type { Point } from "./Point";
import type { Road, RoadEdge, RoadNode } from "../model/City";

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const crosses = a.y > point.y !== b.y > point.y
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function segmentIntersection(a: Point, b: Point, c: Point, d: Point): { point: Point; t: number; u: number } | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-8) return null;
  const qx = c.x - a.x;
  const qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / denominator;
  const u = (qx * ry - qy * rx) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { point: { x: a.x + t * rx, y: a.y + t * ry }, t, u };
}

export function pointToSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distance(point, { x: start.x + t * dx, y: start.y + t * dy });
}

export function bezierPoint(start: Point, end: Point, controls: Point[], t: number): Point {
  const control = controls[0];
  const second = controls[1];
  if (!control) return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
  if (!second) {
    const n = 1 - t;
    return { x: n * n * start.x + 2 * n * t * control.x + t * t * end.x, y: n * n * start.y + 2 * n * t * control.y + t * t * end.y };
  }
  const n = 1 - t;
  return {
    x: n ** 3 * start.x + 3 * n * n * t * control.x + 3 * n * t * t * second.x + t ** 3 * end.x,
    y: n ** 3 * start.y + 3 * n * n * t * control.y + 3 * n * t * t * second.y + t ** 3 * end.y,
  };
}

export function sampleRoad(edge: RoadEdge, nodes: Map<string, RoadNode>, segments = 28): Point[] {
  const start = nodes.get(edge.startNodeId);
  const end = nodes.get(edge.endNodeId);
  if (!start || !end) return [];
  if (edge.geometry.type === "line") return [start, end];
  if (edge.geometry.type === "polyline") return [start, ...edge.geometry.points, end];
  const controls = edge.geometry.controlPoints;
  return Array.from({ length: segments + 1 }, (_, index) => bezierPoint(start, end, controls, index / segments));
}

export function roadDistance(point: Point, edge: RoadEdge, nodes: Map<string, RoadNode>): number {
  const samples = sampleRoad(edge, nodes);
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < samples.length; index += 1) {
    const start = samples[index - 1];
    const end = samples[index];
    if (start && end) nearest = Math.min(nearest, pointToSegmentDistance(point, start, end));
  }
  return nearest;
}

export function nearestPointOnRoad(point: Point, edge: RoadEdge, nodes: Map<string, RoadNode>): { point: Point; distance: number } | undefined {
  const samples = sampleRoad(edge, nodes, 64);
  let nearest: { point: Point; distance: number } | undefined;
  for (let index = 1; index < samples.length; index += 1) {
    const start = samples[index - 1]; const end = samples[index];
    if (!start || !end) continue;
    const dx = end.x - start.x; const dy = end.y - start.y; const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
    const projected = { x: start.x + dx * ratio, y: start.y + dy * ratio };
    const candidateDistance = distance(point, projected);
    if (!nearest || candidateDistance < nearest.distance) nearest = { point: projected, distance: candidateDistance };
  }
  return nearest;
}

export function sampleLogicalRoad(road: Road, edgeLookup: Map<string, RoadEdge>, nodes: Map<string, RoadNode>): Point[] {
  const paths = road.segmentIds.map((id) => edgeLookup.get(id)).filter((edge): edge is RoadEdge => Boolean(edge)).map((edge) => sampleRoad(edge, nodes));
  const first = paths.shift();
  if (!first) return [];
  const result = [...first];
  const close = (a: Point | undefined, b: Point | undefined) => Boolean(a && b && distance(a, b) < 1e-5);
  for (const path of paths) {
    if (path.length < 2) continue;
    if (close(result.at(-1), path[0])) result.push(...path.slice(1));
    else if (close(result.at(-1), path.at(-1))) result.push(...[...path].reverse().slice(1));
    else if (close(result[0], path.at(-1))) result.unshift(...path.slice(0, -1));
    else if (close(result[0], path[0])) result.unshift(...[...path].reverse().slice(0, -1));
  }
  return result;
}

export function pathIntersectsPolygon(path: Point[], polygon: Point[]): boolean {
  if (path.some((point) => pointInPolygon(point, polygon))) return true;
  for (let p = 1; p < path.length; p += 1) {
    const a = path[p - 1];
    const b = path[p];
    if (!a || !b) continue;
    for (let i = 0; i < polygon.length; i += 1) {
      const c = polygon[i];
      const d = polygon[(i + 1) % polygon.length];
      if (c && d && segmentIntersection(a, b, c, d)) return true;
    }
  }
  return false;
}
