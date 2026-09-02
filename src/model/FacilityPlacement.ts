import { footprintContainsPoint } from "../geometry/BuildingGeometry";
import type { Point } from "../geometry/Point";
import type { Building } from "./City";

export function isFacilityPlacementValid(buildings: readonly Building[], position: Point): boolean {
  return buildings.some((building) => footprintContainsPoint(building.footprint, position));
}
