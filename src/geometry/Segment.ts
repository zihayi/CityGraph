import type { Point } from "./Point";

const DEFAULT_EPSILON = 1e-9;

export interface SegmentIntersection {
  point: Point;
  t: number;
  u: number;
}

export interface SegmentIntersectionOptions {
  includeEndpoints?: boolean;
  epsilon?: number;
}

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function pointAt(start: Point, direction: Point, t: number): Point {
  return {
    x: start.x + direction.x * t,
    y: start.y + direction.y * t,
  };
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isAcceptedParameter(
  value: number,
  includeEndpoints: boolean,
  epsilon: number,
): boolean {
  return includeEndpoints
    ? value >= -epsilon && value <= 1 + epsilon
    : value > epsilon && value < 1 - epsilon;
}

export function nearestPointOnSegment(point: Point, start: Point, end: Point): Point {
  const segment = subtract(end, start);
  const lengthSquared = dot(segment, segment);

  if (lengthSquared === 0) {
    return { ...start };
  }

  const t = clampUnit(dot(subtract(point, start), segment) / lengthSquared);
  return pointAt(start, segment, t);
}

export function distancePointToSegment(point: Point, start: Point, end: Point): number {
  const nearest = nearestPointOnSegment(point, start, end);
  return Math.hypot(point.x - nearest.x, point.y - nearest.y);
}

/** For collinear overlap, returns the first accepted overlap point along the first segment. */
export function segmentIntersection(
  firstStart: Point,
  firstEnd: Point,
  secondStart: Point,
  secondEnd: Point,
  options: SegmentIntersectionOptions = {},
): SegmentIntersection | null {
  const includeEndpoints = options.includeEndpoints ?? true;
  const epsilon = Math.max(0, options.epsilon ?? DEFAULT_EPSILON);
  const firstDirection = subtract(firstEnd, firstStart);
  const secondDirection = subtract(secondEnd, secondStart);
  const offset = subtract(secondStart, firstStart);
  const firstLengthSquared = dot(firstDirection, firstDirection);
  const secondLengthSquared = dot(secondDirection, secondDirection);

  if (firstLengthSquared <= epsilon * epsilon) {
    if (!includeEndpoints || secondLengthSquared <= epsilon * epsilon) {
      if (
        includeEndpoints
        && secondLengthSquared <= epsilon * epsilon
        && Math.hypot(offset.x, offset.y) <= epsilon
      ) {
        return { point: { ...firstStart }, t: 0, u: 0 };
      }
      return null;
    }

    const u = dot(subtract(firstStart, secondStart), secondDirection) / secondLengthSquared;
    const nearest = pointAt(secondStart, secondDirection, clampUnit(u));
    if (
      isAcceptedParameter(u, true, epsilon)
      && Math.hypot(firstStart.x - nearest.x, firstStart.y - nearest.y) <= epsilon
    ) {
      return { point: { ...firstStart }, t: 0, u: clampUnit(u) };
    }
    return null;
  }

  if (secondLengthSquared <= epsilon * epsilon) {
    if (!includeEndpoints) {
      return null;
    }

    const t = dot(offset, firstDirection) / firstLengthSquared;
    const nearest = pointAt(firstStart, firstDirection, clampUnit(t));
    if (
      isAcceptedParameter(t, true, epsilon)
      && Math.hypot(secondStart.x - nearest.x, secondStart.y - nearest.y) <= epsilon
    ) {
      return { point: { ...secondStart }, t: clampUnit(t), u: 0 };
    }
    return null;
  }

  const denominator = cross(firstDirection, secondDirection);
  if (Math.abs(denominator) > epsilon) {
    const t = cross(offset, secondDirection) / denominator;
    const u = cross(offset, firstDirection) / denominator;

    if (
      !isAcceptedParameter(t, includeEndpoints, epsilon)
      || !isAcceptedParameter(u, includeEndpoints, epsilon)
    ) {
      return null;
    }

    const normalizedT = clampUnit(t);
    return {
      point: pointAt(firstStart, firstDirection, normalizedT),
      t: normalizedT,
      u: clampUnit(u),
    };
  }

  if (Math.abs(cross(offset, firstDirection)) > epsilon) {
    return null;
  }

  const secondStartT = dot(offset, firstDirection) / firstLengthSquared;
  const secondEndT = secondStartT + dot(secondDirection, firstDirection) / firstLengthSquared;
  const overlapStart = Math.max(0, Math.min(secondStartT, secondEndT));
  const overlapEnd = Math.min(1, Math.max(secondStartT, secondEndT));

  if (overlapStart > overlapEnd + epsilon) {
    return null;
  }

  const t = includeEndpoints
    ? clampUnit(overlapStart)
    : (Math.max(overlapStart, epsilon) + Math.min(overlapEnd, 1 - epsilon)) / 2;
  const point = pointAt(firstStart, firstDirection, t);
  const u = dot(subtract(point, secondStart), secondDirection) / secondLengthSquared;

  if (
    !isAcceptedParameter(t, includeEndpoints, epsilon)
    || !isAcceptedParameter(u, includeEndpoints, epsilon)
  ) {
    return null;
  }

  return { point, t, u: clampUnit(u) };
}
