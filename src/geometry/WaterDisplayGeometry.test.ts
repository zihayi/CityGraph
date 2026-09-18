import { describe, expect, it } from "vitest";
import { buildingArea, footprintContainsPoint } from "./BuildingGeometry";
import { boundsCorners, simpleAreaParts } from "./ImportGeometry";
import { waterDisplayGroups } from "./WaterDisplayGeometry";
import type { WaterArea } from "../model/City";

function lake(prefix = ""): WaterArea[] {
  const footprint = { outer: boundsCorners({ x: 0, y: 0, width: 100, height: 100 }), holes: [boundsCorners({ x: 40, y: 40, width: 20, height: 20 })] };
  return simpleAreaParts(footprint).map((points, index) => ({ id: `${prefix}osm-waters-relation-123-0-part-${index}-crop-0`, name: "西湖", points }));
}

describe("water display groups", () => {
  it("reassembles saved legacy pieces into one named lake and preserves its island", () => {
    const waters = lake(); const before = structuredClone(waters); const groups = waterDisplayGroups(waters);
    expect(groups).toHaveLength(1); expect(groups[0]!.name).toBe("西湖"); expect(groups[0]!.footprints).toHaveLength(1);
    const footprint = groups[0]!.footprints[0]!;
    expect(footprint.holes).toHaveLength(1); expect(buildingArea(footprint)).toBeCloseTo(9600);
    expect(footprintContainsPoint(footprint, { x: 50, y: 50 })).toBe(false);
    expect(footprintContainsPoint(footprint, groups[0]!.label!)).toBe(true);
    expect(waters).toEqual(before); expect(waterDisplayGroups(waters)).toBe(groups);
  });
  it("keeps separate import instances and unrelated same-name waters separate", () => {
    const waters = [...lake("import-first-"), ...lake("import-second-").map((water) => ({ ...water, points: water.points.map((point) => ({ x: point.x + 300, y: point.y })) })), { id: "hand-drawn", name: "西湖", points: boundsCorners({ x: 500, y: 0, width: 30, height: 30 }) }];
    const groups = waterDisplayGroups(waters);
    expect(groups).toHaveLength(3); expect(groups.map((group) => group.name)).toEqual(["西湖", "西湖", "西湖"]);
    expect(groups[1]!.label!.x).toBeGreaterThan(300);
  });
  it("honors individually renamed pieces and invalidates geometry after in-place edits", () => {
    const waters = lake(); const before = waterDisplayGroups(waters);
    waters[0]!.name = "Renamed inlet";
    for (const point of waters[0]!.points) point.x += 200;
    const groups = waterDisplayGroups(waters, true);
    expect(groups).not.toBe(before); expect(groups).toHaveLength(2);
    expect(groups[0]!.label!.x).toBeGreaterThan(200); expect(groups[0]!.name).toBe("Renamed inlet");
    expect(waterDisplayGroups(waters)).toBe(groups);
  });
});
