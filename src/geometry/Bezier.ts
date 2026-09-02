import type { Point } from "./Point";
import { distancePointToSegment } from "./Segment";

export type BezierControlPoints = readonly [Point] | readonly [Point, Point];

export function symmetricCurveFromHandle(start: Point, end: Point, cursor: Point): { control: Point; handle: Point } {
  const dx = end.x - start.x; const dy = end.y - start.y; const length = Math.hypot(dx, dy) || 1; const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }; const normal = { x: -dy / length, y: dx / length };
  const rawHeight = (cursor.x - midpoint.x) * normal.x + (cursor.y - midpoint.y) * normal.y; const height = Math.max(-length, Math.min(length, rawHeight)); const handle = { x: midpoint.x + normal.x * height, y: midpoint.y + normal.y * height };
  return { handle, control: { x: handle.x * 2 - midpoint.x, y: handle.y * 2 - midpoint.y } };
}

export function quadraticControlThroughMidpoint(start: Point, midpoint: Point, end: Point): Point {
  return { x: midpoint.x * 2 - (start.x + end.x) / 2, y: midpoint.y * 2 - (start.y + end.y) / 2 };
}

export function bezierPoint(
  start: Point,
  end: Point,
  controlPoints: BezierControlPoints,
  t: number,
): Point {
  const inverseT = 1 - t;
  const firstControl = controlPoints[0];

  if (controlPoints.length === 1) {
    return {
      x: inverseT * inverseT * start.x
        + 2 * inverseT * t * firstControl.x
        + t * t * end.x,
      y: inverseT * inverseT * start.y
        + 2 * inverseT * t * firstControl.y
        + t * t * end.y,
    };
  }

  const secondControl = controlPoints[1];
  return {
    x: inverseT * inverseT * inverseT * start.x
      + 3 * inverseT * inverseT * t * firstControl.x
      + 3 * inverseT * t * t * secondControl.x
      + t * t * t * end.x,
    y: inverseT * inverseT * inverseT * start.y
      + 3 * inverseT * inverseT * t * firstControl.y
      + 3 * inverseT * t * t * secondControl.y
      + t * t * t * end.y,
  };
}

export function sampleBezier(
  start: Point,
  end: Point,
  controlPoints: BezierControlPoints,
  segments = 32,
): Point[] {
  if (!Number.isInteger(segments) || segments < 1) {
    throw new RangeError("segments must be a positive integer");
  }

  return Array.from(
    { length: segments + 1 },
    (_, index) => bezierPoint(start, end, controlPoints, index / segments),
  );
}

export function approximateDistancePointToBezier(
  point: Point,
  start: Point,
  end: Point,
  controlPoints: BezierControlPoints,
  segments = 32,
): number {
  const samples = sampleBezier(start, end, controlPoints, segments);
  let minimumDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < samples.length; index += 1) {
    const segmentStart = samples[index - 1];
    const segmentEnd = samples[index];
    if (segmentStart === undefined || segmentEnd === undefined) {
      continue;
    }
    minimumDistance = Math.min(
      minimumDistance,
      distancePointToSegment(point, segmentStart, segmentEnd),
    );
  }

  return minimumDistance;
}
