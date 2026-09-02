import { describe, expect, it } from "vitest";
import {
  approximateDistancePointToBezier,
  bezierPoint,
  quadraticControlThroughMidpoint,
  sampleBezier,
  symmetricCurveFromHandle,
} from "./Bezier";

describe("Bezier geometry", () => {
  it("evaluates quadratic curves from one control point", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 10, y: 0 };
    const controls = [{ x: 5, y: 10 }] as const;

    expect(bezierPoint(start, end, controls, 0)).toEqual(start);
    expect(bezierPoint(start, end, controls, 0.5)).toEqual({ x: 5, y: 5 });
    expect(bezierPoint(start, end, controls, 1)).toEqual(end);
  });

  it("evaluates cubic curves from two control points", () => {
    expect(bezierPoint(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      [{ x: 0, y: 10 }, { x: 10, y: 10 }],
      0.5,
    )).toEqual({ x: 5, y: 7.5 });
  });

  it("approximates point distance using the sampled curve segments", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 10, y: 0 };
    const controls = [{ x: 5, y: 10 }] as const;

    expect(approximateDistancePointToBezier(
      { x: 5, y: 8 },
      start,
      end,
      controls,
      20,
    )).toBeCloseTo(3);
    expect(sampleBezier(start, end, controls, 4)).toHaveLength(5);
  });

  it("treats the curvature handle as a point on the symmetric curve", () => {
    const start = { x: 0, y: 0 }; const end = { x: 100, y: 0 }; const curve = symmetricCurveFromHandle(start, end, { x: 80, y: 25 });
    expect(curve.handle).toEqual({ x: 50, y: 25 }); expect(bezierPoint(start, end, [curve.control], 0.5)).toEqual(curve.handle);
  });


  it("builds a quadratic curve through the clicked midpoint", () => {
    const start = { x: 0, y: 0 }; const midpoint = { x: 40, y: 30 }; const end = { x: 100, y: 0 }; const control = quadraticControlThroughMidpoint(start, midpoint, end);
    expect(bezierPoint(start, end, [control], 0.5)).toEqual(midpoint);
  });
});
