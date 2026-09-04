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
