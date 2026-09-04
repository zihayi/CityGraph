import { describe, expect, it } from "vitest";
import { createIrregularLakeInRectangle, formatWaterArea, isValidWaterPolygon, waterArea } from "./WaterGeometry";

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

  it("rejects undersized and self-intersecting water polygons", () => {
    expect(createIrregularLakeInRectangle({ x: 0, y: 0 }, { x: 4, y: 20 }, 1)).toEqual([]);
    expect(isValidWaterPolygon([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }])).toBe(false);
  });
});
