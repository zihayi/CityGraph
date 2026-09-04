import { describe, expect, it } from "vitest";
import { formatZoneArea, zoneArea, zoneLabelPoint, zonePerimeter } from "./ZoneGeometry";
import { pointInPolygon } from "./Polygon";

describe("zone geometry", () => {
  it("measures polygons in world meters", () => { const polygon = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }]; expect(zoneArea(polygon)).toBe(5000); expect(zonePerimeter(polygon)).toBe(300); });
  it("formats area in mu", () => { expect(formatZoneArea(900)).toBe("1.35 亩"); expect(formatZoneArea(25_000)).toBe("37.5 亩"); expect(formatZoneArea(2_500_000)).toBe("3750 亩"); });
  it("keeps labels inside concave zones", () => { const polygon = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 30 }, { x: 30, y: 30 }, { x: 30, y: 100 }, { x: 0, y: 100 }]; expect(pointInPolygon(zoneLabelPoint(polygon)!, polygon)).toBe(true); });
});
