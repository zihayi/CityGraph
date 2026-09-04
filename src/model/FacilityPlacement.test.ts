import { describe, expect, it } from "vitest";
import { createBuildingPreset } from "../geometry/BuildingGeometry";
import type { Building, Zone } from "./City";
import { isFacilityPlacementValid, universityZoneAt } from "./FacilityPlacement";

function building(footprint: Building["footprint"]): Building {
  return { id: "building", name: "Building", type: "commercial", subtype: "", style: "modern", floors: 2, height: 8, footprint, description: "" };
}

describe("FacilityPlacement", () => {
  it("accepts positions inside a building and rejects positions outside it", () => {
    const buildings = [building(createBuildingPreset("rectangle", { x: 20, y: 20 }, 20, 20))];
    expect(isFacilityPlacementValid(buildings, { x: 20, y: 20 })).toBe(true);
    expect(isFacilityPlacementValid(buildings, { x: 40, y: 40 })).toBe(false);
  });

  it("rejects positions in a building courtyard", () => {
    const buildings = [building(createBuildingPreset("courtyard", { x: 20, y: 20 }, 40, 40))];
    expect(isFacilityPlacementValid(buildings, { x: 20, y: 20 })).toBe(false);
    expect(isFacilityPlacementValid(buildings, { x: 5, y: 20 })).toBe(true);
  });

  it("finds only explicitly marked university zones", () => {
    const polygon = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const zones: Zone[] = [{ id: "school", type: "education", polygon, source: "custom", opacity: 0.4 }, { id: "campus", type: "education", polygon: polygon.map((point) => ({ x: point.x + 150, y: point.y })), source: "custom", opacity: 0.4, purpose: "university" }];
    expect(universityZoneAt(zones, { x: 50, y: 50 })).toBeUndefined();
    expect(universityZoneAt(zones, { x: 175, y: 50 })?.id).toBe("campus");
  });
});
