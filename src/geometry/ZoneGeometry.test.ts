import { describe, expect, it } from "vitest";
import { formatZoneArea, zoneArea, zoneLabelPoint, zonePerimeter } from "./ZoneGeometry";
import { pointInPolygon } from "./Polygon";

describe("zone geometry", () => {
  it("measures polygons in world meters", () => { const polygon = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }]; expect(zoneArea(polygon)).toBe(5000); expect(zonePerimeter(polygon)).toBe(300); });
  it("chooses readable area units", () => { expect(formatZoneArea(900)).toBe("900 m²"); expect(formatZoneArea(25_000)).toBe("2.5 ha"); expect(formatZoneArea(2_500_000)).toBe("2.5 km²"); });
  it("keeps labels inside concave zones", () => { const polygon = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 30 }, { x: 30, y: 30 }, { x: 30, y: 100 }, { x: 0, y: 100 }]; expect(pointInPolygon(zoneLabelPoint(polygon)!, polygon)).toBe(true); });
});
