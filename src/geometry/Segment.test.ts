import { describe, expect, it } from "vitest";
import {
  distancePointToSegment,
  nearestPointOnSegment,
  segmentIntersection,
} from "./Segment";

describe("segment geometry", () => {
  it("returns the intersection point and normalized parameters", () => {
    const intersection = segmentIntersection(
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    );

    expect(intersection).toEqual({
      point: { x: 5, y: 5 },
      t: 0.5,
      u: 0.5,
    });
  });

  it("controls whether endpoint intersections are accepted", () => {
    const firstStart = { x: 0, y: 0 };
    const firstEnd = { x: 10, y: 0 };
    const secondStart = { x: 10, y: 0 };
    const secondEnd = { x: 10, y: 10 };

    expect(segmentIntersection(firstStart, firstEnd, secondStart, secondEnd)).toEqual({
      point: { x: 10, y: 0 },
      t: 1,
      u: 0,
    });
    expect(segmentIntersection(
      firstStart,
      firstEnd,
      secondStart,
      secondEnd,
      { includeEndpoints: false },
    )).toBeNull();
  });

  it("handles parallel and collinear segments", () => {
    expect(segmentIntersection(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 2 },
      { x: 10, y: 2 },
    )).toBeNull();

    expect(segmentIntersection(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 0 },
      { x: 15, y: 0 },
    )).toEqual({
      point: { x: 5, y: 0 },
      t: 0.5,
      u: 0,
    });
  });

  it("finds the nearest point and distance to a finite segment", () => {
    const point = { x: 14, y: 3 };
    const start = { x: 0, y: 0 };
    const end = { x: 10, y: 0 };

    expect(nearestPointOnSegment(point, start, end)).toEqual({ x: 10, y: 0 });
    expect(distancePointToSegment(point, start, end)).toBe(5);
  });
});
