import { sampleBezier, type BezierControlPoints } from "./Bezier";
import type { Point } from "./Point";
import { distancePointToSegment, segmentIntersection } from "./Segment";

const DEFAULT_EPSILON = 1e-9;
export type PolygonEdgeStyle = "straight" | "smooth";

export interface PointInPolygonOptions {
  includeBoundary?: boolean;
  epsilon?: number;
}

export function pointInPolygon(
  point: Point,
  polygon: readonly Point[],
  options: PointInPolygonOptions = {},
): boolean {
  if (polygon.length < 3) {
    return false;
  }

  const includeBoundary = options.includeBoundary ?? true;
  const epsilon = Math.max(0, options.epsilon ?? DEFAULT_EPSILON);
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const start = polygon[previous];
    const end = polygon[index];
    if (start === undefined || end === undefined) {
      continue;
    }

    if (distancePointToSegment(point, start, end) <= epsilon) {
      return includeBoundary;
    }

    const crossesRay = (start.y > point.y) !== (end.y > point.y)
      && point.x < ((end.x - start.x) * (point.y - start.y)) / (end.y - start.y) + start.x;
    if (crossesRay) {
      inside = !inside;
    }
  }

  return inside;
}

export function polylineIntersectsPolygon(
  polyline: readonly Point[],
  polygon: readonly Point[],
): boolean {
  if (polyline.length === 0 || polygon.length < 3) {
    return false;
  }

  if (polyline.some((point) => pointInPolygon(point, polygon))) {
    return true;
  }

  for (let lineIndex = 1; lineIndex < polyline.length; lineIndex += 1) {
    const lineStart = polyline[lineIndex - 1];
    const lineEnd = polyline[lineIndex];
    if (lineStart === undefined || lineEnd === undefined) {
      continue;
    }

    for (
      let polygonIndex = 0, previous = polygon.length - 1;
      polygonIndex < polygon.length;
      previous = polygonIndex, polygonIndex += 1
    ) {
      const polygonStart = polygon[previous];
      const polygonEnd = polygon[polygonIndex];
      if (
        polygonStart !== undefined
        && polygonEnd !== undefined
        && segmentIntersection(lineStart, lineEnd, polygonStart, polygonEnd) !== null
      ) {
        return true;
      }
    }
  }

  return false;
}

export function bezierIntersectsPolygon(
  start: Point,
  end: Point,
  controlPoints: BezierControlPoints,
  polygon: readonly Point[],
  segments = 32,
): boolean {
  return polylineIntersectsPolygon(
    sampleBezier(start, end, controlPoints, segments),
    polygon,
  );
}

export function smoothClosedPolygon(
  polygon: readonly Point[],
  iterations = 1,
): Point[] {
  if (!Number.isInteger(iterations) || iterations < 0) {
    throw new RangeError("iterations must be a non-negative integer");
  }

  let smoothed = polygon.map((point) => ({ ...point }));
  for (let iteration = 0; iteration < iterations && smoothed.length >= 3; iteration += 1) {
    const next: Point[] = [];
    for (let index = 0; index < smoothed.length; index += 1) {
      const start = smoothed[index];
      const end = smoothed[(index + 1) % smoothed.length];
      if (start === undefined || end === undefined) {
        continue;
      }
      next.push(
        { x: start.x * 0.75 + end.x * 0.25, y: start.y * 0.75 + end.y * 0.25 },
        { x: start.x * 0.25 + end.x * 0.75, y: start.y * 0.25 + end.y * 0.75 },
      );
    }
    smoothed = next;
  }

  return smoothed;
}

export function applyPolygonEdgeStyle(
  polygon: readonly Point[],
  edgeStyle: PolygonEdgeStyle,
): Point[] {
  return edgeStyle === "smooth" && polygon.length >= 3
    ? smoothClosedPolygon(polygon, 1)
    : polygon.map((point) => ({ ...point }));
}

export function simplifyClosedPolygon(polygon: readonly Point[], tolerance: number): Point[] {
  const points = polygon.filter((point, index) => index === 0 || Math.hypot(point.x - polygon[index - 1]!.x, point.y - polygon[index - 1]!.y) > DEFAULT_EPSILON).map((point) => ({ ...point }));
  if (points.length > 1 && Math.hypot(points[0]!.x - points.at(-1)!.x, points[0]!.y - points.at(-1)!.y) <= DEFAULT_EPSILON) points.pop();
  if (points.length < 4 || tolerance <= 0) return points;
  let opposite = 1; let farthest = 0;
  for (let index = 1; index < points.length; index += 1) { const value = Math.hypot(points[index]!.x - points[0]!.x, points[index]!.y - points[0]!.y); if (value > farthest) { farthest = value; opposite = index; } }
  const first = simplifyOpenPath(points.slice(0, opposite + 1), tolerance); const second = simplifyOpenPath([...points.slice(opposite), points[0]!], tolerance);
  const simplified = [...first.slice(0, -1), ...second.slice(0, -1)];
  return simplified.length >= 3 ? simplified : points;
}

export function polygonContainsPolygon(container: readonly Point[], candidate: readonly Point[]): boolean {
  if (container.length < 3 || candidate.length < 3 || !candidate.every((point) => pointInPolygon(point, container, { includeBoundary: false, epsilon: 1e-6 }))) return false;
  for (let first = 0; first < container.length; first += 1) for (let second = 0; second < candidate.length; second += 1) if (segmentIntersection(container[first]!, container[(first + 1) % container.length]!, candidate[second]!, candidate[(second + 1) % candidate.length]!)) return false;
  return true;
}

export function polygonsIntersectOrContain(first: readonly Point[], second: readonly Point[]): boolean {
  if (first.length < 3 || second.length < 3) return false;
  for (let a = 0; a < first.length; a += 1) for (let b = 0; b < second.length; b += 1) if (segmentIntersection(first[a]!, first[(a + 1) % first.length]!, second[b]!, second[(b + 1) % second.length]!)) return true;
  return pointInPolygon(first[0]!, second) || pointInPolygon(second[0]!, first);
}

function simplifyOpenPath(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  const start = points[0]!; const end = points.at(-1)!; let farthestIndex = -1; let farthestDistance = tolerance;
  for (let index = 1; index < points.length - 1; index += 1) { const value = distancePointToSegment(points[index]!, start, end); if (value > farthestDistance) { farthestDistance = value; farthestIndex = index; } }
  if (farthestIndex < 0) return [{ ...start }, { ...end }];
  const left = simplifyOpenPath(points.slice(0, farthestIndex + 1), tolerance); const right = simplifyOpenPath(points.slice(farthestIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}
