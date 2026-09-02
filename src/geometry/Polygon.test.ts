import { describe, expect, it } from "vitest";
import type { Point } from "./Point";
import {
  bezierIntersectsPolygon,
  pointInPolygon,
  polylineIntersectsPolygon,
} from "./Polygon";

const square: readonly Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe("polygon geometry", () => {
  it("distinguishes interior, exterior, and boundary points", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 12, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: 0, y: 5 }, square)).toBe(true);
    expect(pointInPolygon(
      { x: 0, y: 5 },
      square,
      { includeBoundary: false },
    )).toBe(false);
  });

  it("detects crossing and contained polylines without false positives", () => {
    expect(polylineIntersectsPolygon([
      { x: -5, y: 5 },
      { x: 15, y: 5 },
    ], square)).toBe(true);
    expect(polylineIntersectsPolygon([
      { x: 2, y: 2 },
      { x: 8, y: 8 },
    ], square)).toBe(true);
    expect(polylineIntersectsPolygon([
      { x: -5, y: -5 },
      { x: -1, y: -1 },
    ], square)).toBe(false);
  });

  it("detects a sampled road curve crossing a polygon", () => {
    expect(bezierIntersectsPolygon(
      { x: -5, y: 5 },
      { x: 15, y: 5 },
      [{ x: 5, y: 12 }],
      square,
    )).toBe(true);

    expect(bezierIntersectsPolygon(
      { x: -5, y: -5 },
      { x: 15, y: -5 },
      [{ x: 5, y: -2 }],
      square,
    )).toBe(false);
  });
});
