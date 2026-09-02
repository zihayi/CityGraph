import { describe, expect, it } from "vitest";
import { pointInPolygon } from "../geometry/RoadGeometry";
import { createNewCity, mapDimensions } from "./mapGenerator";

describe("createNewCity", () => {
  it("uses meter-scale world bounds and creates requested lakes inside them", () => {
    const city = createNewCity({ name: "Test", size: "large", terrain: "lakes", lakeCount: 3 });
    expect(city.bounds.width).toBe(mapDimensions.large);
    expect(city.waters).toHaveLength(3);
    for (const lake of city.waters) {
      for (const point of lake.points) {
        expect(point.x).toBeGreaterThan(0); expect(point.x).toBeLessThan(city.bounds.width);
        expect(point.y).toBeGreaterThan(0); expect(point.y).toBeLessThan(city.bounds.height);
      }
    }
    expect(pointInPolygon(city.waters[0]!.points[0]!, city.waters[1]!.points)).toBe(false);
  });
  it("creates an unbounded editing canvas centered on the origin", () => {
    const city = createNewCity({ name: "Infinite", size: "unlimited", terrain: "flat", lakeCount: 1 });
    expect(city.mapSize).toBe("unlimited");
    expect(city.bounds.x).toBeLessThan(0);
    expect(city.bounds.x + city.bounds.width).toBeGreaterThan(0);
  });
});
