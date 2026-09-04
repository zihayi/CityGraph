import { footprintContainsPoint } from "../geometry/BuildingGeometry";
import type { Point } from "../geometry/Point";
import { pointInPolygon } from "../geometry/Polygon";
import type { Building, Zone } from "./City";

export function isFacilityPlacementValid(buildings: readonly Building[], position: Point): boolean {
  return buildings.some((building) => footprintContainsPoint(building.footprint, position));
}

export function universityZoneAt(zones: readonly Zone[], position: Point): Zone | undefined {
  return [...zones].reverse().find((zone) => (zone.universityId !== undefined || zone.purpose === "university") && pointInPolygon(position, zone.polygon));
}
