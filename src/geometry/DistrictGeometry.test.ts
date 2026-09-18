import { describe, expect, it } from "vitest";
import { districtPolygonsOverlap, isValidDistrictPolygon } from "./DistrictGeometry";

const rectangle = (x: number, y: number, width: number, height: number) => [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];

describe("DistrictGeometry", () => {
  it("allows districts to share a boundary or touch at a point", () => {
    const first = rectangle(0, 0, 100, 100);
    expect(districtPolygonsOverlap(first, rectangle(100, 0, 80, 100))).toBe(false);
    expect(districtPolygonsOverlap(first, rectangle(100, 100, 80, 80))).toBe(false);
  });

  it("detects crossing, containment, and duplicate boundaries", () => {
    const first = rectangle(0, 0, 100, 100);
    expect(districtPolygonsOverlap(first, rectangle(50, -20, 20, 140))).toBe(true);
    expect(districtPolygonsOverlap(first, rectangle(20, 20, 30, 30))).toBe(true);
    expect(districtPolygonsOverlap(first, structuredClone(first))).toBe(true);
  });

  it("rejects invalid and overlapping candidates", () => {
    const districts = [{ id: "first", points: rectangle(0, 0, 100, 100) }];
    expect(isValidDistrictPolygon(rectangle(100, 0, 100, 100), districts)).toBe(true);
    expect(isValidDistrictPolygon(rectangle(90, 0, 100, 100), districts)).toBe(false);
    expect(isValidDistrictPolygon([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 }], districts)).toBe(false);
  });
});
