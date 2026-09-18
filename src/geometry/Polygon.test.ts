import { describe, expect, it } from "vitest";
import type { Point } from "./Point";
import {
  bezierIntersectsPolygon,
  pointInPolygon,
  polygonContainsPolygon,
  polygonsIntersectOrContain,
  polylineIntersectsPolygon,
  simplifyClosedPolygon,
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

  it("simplifies closed rings while preserving corners", () => {
    const dense = [{ x: 0, y: 0 }, { x: 5, y: 0.1 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 10, y: 10 }, { x: 5, y: 9.9 }, { x: 0, y: 10 }, { x: 0, y: 5 }, { x: 0, y: 0 }];
    expect(simplifyClosedPolygon(dense, 0.2)).toEqual(square);
  });

  it("validates polygon containment and overlap for generated footprints", () => {
    expect(polygonContainsPolygon(square, [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 8 }, { x: 2, y: 8 }])).toBe(true);
    expect(polygonContainsPolygon(square, [{ x: 0, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 8 }, { x: 0, y: 8 }])).toBe(false);
    expect(polygonsIntersectOrContain(square, [{ x: 8, y: 8 }, { x: 12, y: 8 }, { x: 12, y: 12 }, { x: 8, y: 12 }])).toBe(true);
    expect(polygonsIntersectOrContain(square, [{ x: 12, y: 12 }, { x: 14, y: 12 }, { x: 14, y: 14 }, { x: 12, y: 14 }])).toBe(false);
  });

  it("rejects a polygon that bridges a concave opening", () => {
    const concave = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 7, y: 10 }, { x: 7, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 10 }, { x: 0, y: 10 }];
    expect(polygonContainsPolygon(concave, [{ x: 1, y: 2 }, { x: 9, y: 2 }, { x: 9, y: 8 }, { x: 1, y: 8 }])).toBe(false);
  });
});
