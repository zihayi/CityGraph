import { describe, expect, it } from "vitest";
import { createIrregularLakeInRectangle, createRiverPolygon, formatWaterArea, isValidWaterPolygon, waterArea } from "./WaterGeometry";

describe("WaterGeometry", () => {
  it("calculates and formats polygon area", () => {
    expect(waterArea([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }])).toBe(200);
    expect(formatWaterArea(200)).toBe("200 m²"); expect(formatWaterArea(20_000)).toBe("2 ha"); expect(formatWaterArea(2_000_000)).toBe("2 km²");
  });

  it("creates a stable irregular lake fitted to either rectangle direction", () => {
    const first = createIrregularLakeInRectangle({ x: 100, y: 80 }, { x: 0, y: 0 }, 42); const second = createIrregularLakeInRectangle({ x: 0, y: 0 }, { x: 100, y: 80 }, 42);
    expect(first).toEqual(second); expect(isValidWaterPolygon(first)).toBe(true);
    expect(Math.min(...first.map((point) => point.x))).toBeCloseTo(0); expect(Math.max(...first.map((point) => point.x))).toBeCloseTo(100);
    expect(Math.min(...first.map((point) => point.y))).toBeCloseTo(0); expect(Math.max(...first.map((point) => point.y))).toBeCloseTo(80);
  });

  it("supports smooth edges for irregular rectangle lakes", () => {
    const straight = createIrregularLakeInRectangle({ x: 0, y: 0 }, { x: 100, y: 80 }, 42, 24, "straight");
    const smooth = createIrregularLakeInRectangle({ x: 0, y: 0 }, { x: 100, y: 80 }, 42, 24, "smooth");
    expect(smooth.length).toBe(straight.length * 2); expect(smooth).not.toEqual(straight); expect(isValidWaterPolygon(smooth)).toBe(true);
  });

  it("creates a deterministic requested-width river and removes consecutive near-duplicates", () => {
    const centerline = [{ x: 0, y: 0 }, { x: 0.000001, y: 0 }, { x: 100, y: 0 }];
    const first = createRiverPolygon(centerline, 20); const second = createRiverPolygon(centerline, 20);
    expect(first).toEqual(second); expect(first).toHaveLength(4); expect(isValidWaterPolygon(first)).toBe(true);
    expect(Math.max(...first.map((point) => point.y)) - Math.min(...first.map((point) => point.y))).toBeCloseTo(20, 8);
    const smooth = createRiverPolygon(centerline, 20, "smooth");
    expect(Math.max(...smooth.map((point) => point.y)) - Math.min(...smooth.map((point) => point.y))).toBeCloseTo(20, 8);
  });

  it("builds valid bounded joins and only keeps valid smoothing", () => {
    const centerline = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 55, y: 40 }, { x: 100, y: 45 }];
    const straight = createRiverPolygon(centerline, 12, "straight"); const smooth = createRiverPolygon(centerline, 12, "smooth");
    expect(isValidWaterPolygon(straight)).toBe(true); expect(isValidWaterPolygon(smooth)).toBe(true);
    const joins = [straight[1]!, straight[2]!, straight.at(-3)!, straight.at(-2)!];
    expect(joins.every((point) => Math.min(...centerline.slice(1, -1).map((center) => Math.hypot(point.x - center.x, point.y - center.y))) <= 24)).toBe(true);
    expect(smooth.length).toBeGreaterThanOrEqual(straight.length);
  });

  it("bevels a turn whose miter would exceed the width bound", () => {
    const corner = { x: 50, y: 0 };
    const polygon = createRiverPolygon([{ x: 0, y: 0 }, corner, { x: 3.015, y: 17.101 }], 12);
    expect(polygon).toHaveLength(7); expect(isValidWaterPolygon(polygon)).toBe(true);
    for (const point of [polygon.at(-3)!, polygon.at(-2)!]) expect(Math.hypot(point.x - corner.x, point.y - corner.y)).toBeCloseTo(6, 4);
  });

  it("rejects invalid river centerlines and widths", () => {
    expect(createRiverPolygon([{ x: 0, y: 0 }], 10)).toEqual([]);
    expect(createRiverPolygon([{ x: 0, y: 0 }, { x: 0.000001, y: 0 }], 10)).toEqual([]);
    expect(createRiverPolygon([{ x: 0, y: 0 }, { x: Number.NaN, y: 10 }], 10)).toEqual([]);
    expect(createRiverPolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }], 0)).toEqual([]);
    expect(createRiverPolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }], Number.POSITIVE_INFINITY)).toEqual([]);
  });

  it("rejects undersized and self-intersecting water polygons", () => {
    expect(createIrregularLakeInRectangle({ x: 0, y: 0 }, { x: 4, y: 20 }, 1)).toEqual([]);
    expect(isValidWaterPolygon([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }])).toBe(false);
  });
});
