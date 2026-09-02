import { describe, expect, it } from "vitest";
import { createBuildingPreset } from "../geometry/BuildingGeometry";
import type { Building } from "./City";
import { isFacilityPlacementValid } from "./FacilityPlacement";

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
});
