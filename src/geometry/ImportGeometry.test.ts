import { describe, expect, it } from "vitest";
import { buildingArea, isValidBuildingFootprint } from "./BuildingGeometry";
import { boundsCorners, clipFootprint, clipPolyline, simpleAreaParts } from "./ImportGeometry";
import { pointInPolygon } from "./Polygon";
import { waterArea } from "./WaterGeometry";

describe("import clipping", () => {
  it("clips crossing paths and never connects separate re-entry points", () => {
    const bounds = { x: 0, y: 0, width: 10, height: 10 };
    const paths = clipPolyline([{ x: -5, y: 2 }, { x: 15, y: 2 }, { x: 15, y: 8 }, { x: -5, y: 8 }], bounds);
    expect(paths).toEqual([[{ x: 0, y: 2 }, { x: 10, y: 2 }], [{ x: 10, y: 8 }, { x: 0, y: 8 }]]);
    expect(clipPolyline([{ x: -2, y: -1 }, { x: 12, y: -1 }], bounds)).toEqual([]);
  });
  it("splits concave polygons into separate areas instead of inventing a connecting edge", () => {
    const outer = [[0, 0], [10, 0], [10, 2], [2, 2], [2, 8], [10, 8], [10, 10], [0, 10]].map(([x, y]) => ({ x: x!, y: y! }));
    const parts = clipFootprint({ outer, holes: [] }, { x: 5, y: 0, width: 5, height: 10 });
    expect(parts).toHaveLength(2); expect(parts.every(isValidBuildingFootprint)).toBe(true);
    expect(parts.reduce((sum, part) => sum + buildingArea(part), 0)).toBeCloseTo(20);
  });
  it("preserves the exact area of multiple holes as editable simple polygons", () => {
    const footprint = { outer: boundsCorners({ x: 0, y: 0, width: 100, height: 100 }), holes: [boundsCorners({ x: 10, y: 10, width: 20, height: 20 }), boundsCorners({ x: 40, y: 40, width: 40, height: 30 })] };
    const parts = simpleAreaParts(footprint);
    expect(parts.reduce((sum, ring) => sum + waterArea(ring), 0)).toBeCloseTo(buildingArea(footprint), 6);
    expect(parts.every((ring) => !pointInPolygon({ x: 20, y: 20 }, ring) && !pointInPolygon({ x: 60, y: 50 }, ring))).toBe(true);
  });
});
