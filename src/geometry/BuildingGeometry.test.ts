import { describe, expect, it } from "vitest";
import { applyPolygonEdgeStyle } from "./Polygon";
import { buildingArea, buildingPerimeter, createBuildingPreset, createBuildingRectangleFromCorners, dragFootprintEdge, extrudeFootprintEdge, footprintContainsPoint, isValidBuildingFootprint, mirrorFootprint, rotateFootprint, scaleFootprint } from "./BuildingGeometry";

describe("BuildingGeometry", () => {
  it("creates an exact rectangle from opposite corners in either direction", () => {
    const footprint = createBuildingRectangleFromCorners({ x: 80, y: 60 }, { x: 10, y: 20 });
    expect(footprint.outer).toEqual([{ x: 10, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 60 }, { x: 10, y: 60 }]); expect(footprint.holes).toEqual([]); expect(buildingArea(footprint)).toBe(2800); expect(isValidBuildingFootprint(footprint)).toBe(true);
  });
  it("rounds polygon corners only in smooth edge mode", () => {
    const rectangle = createBuildingRectangleFromCorners({ x: 0, y: 0 }, { x: 40, y: 20 });
    const smooth = { outer: applyPolygonEdgeStyle(rectangle.outer, "smooth"), holes: [] };
    expect(smooth.outer).toHaveLength(8); expect(isValidBuildingFootprint(smooth)).toBe(true); expect(applyPolygonEdgeStyle(rectangle.outer, "straight")).toEqual(rectangle.outer);
  });
  it("creates valid editable presets including a courtyard hole", () => { for (const preset of ["rectangle", "l", "u", "h", "courtyard"] as const) { expect(isValidBuildingFootprint(createBuildingPreset(preset, { x: 20, y: 30 }, 60, 40))).toBe(true); expect(isValidBuildingFootprint(createBuildingPreset(preset, { x: 0, y: 0 }, 4, 4))).toBe(true); } const courtyard = createBuildingPreset("courtyard", { x: 0, y: 0 }, 60, 40); expect(courtyard.holes).toHaveLength(1); expect(buildingArea(courtyard)).toBeLessThan(2400); expect(buildingPerimeter(courtyard)).toBeGreaterThan(200); expect(footprintContainsPoint(courtyard, { x: 0, y: 0 })).toBe(false); });
  it("rejects duplicate, self-intersecting, collapsed, and invalid hole rings", () => { expect(isValidBuildingFootprint({ outer: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }], holes: [] })).toBe(false); expect(isValidBuildingFootprint({ outer: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }], holes: [] })).toBe(false); expect(isValidBuildingFootprint({ outer: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], holes: [] })).toBe(false); expect(isValidBuildingFootprint({ outer: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }], holes: [[{ x: 15, y: 15 }, { x: 25, y: 15 }, { x: 25, y: 25 }, { x: 15, y: 25 }]] })).toBe(false); });
  it("supports edge drag and outward extrusion without template binding", () => { const rectangle = createBuildingPreset("rectangle", { x: 0, y: 0 }, 40, 20); const dragged = dragFootprintEdge(rectangle, { ringIndex: 0, edgeIndex: 0 }, { x: 0, y: -5 })!; expect(isValidBuildingFootprint(dragged)).toBe(true); const extruded = extrudeFootprintEdge(rectangle, 0, 8)!; expect(extruded.outer).toHaveLength(6); expect(isValidBuildingFootprint(extruded)).toBe(true); expect(buildingArea(extruded)).toBeGreaterThan(buildingArea(rectangle)); });
  it("transforms outer and holes together", () => { const footprint = createBuildingPreset("courtyard", { x: 10, y: 20 }, 60, 40); const area = buildingArea(footprint); expect(buildingArea(rotateFootprint(footprint, Math.PI / 3))).toBeCloseTo(area); expect(buildingArea(scaleFootprint(footprint, 2))).toBeCloseTo(area * 4); expect(buildingArea(mirrorFootprint(mirrorFootprint(footprint)))).toBeCloseTo(area); });
});
