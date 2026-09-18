import type { Building, Park, Road, RoadEdge, Zone } from "../../model/City";
import { defaultZoneColors, defaultZoneIconColors, defaultZoneIcons } from "../../model/ZoneStyle";
import type { EditorTool, EditorUiState } from "./editorStore";

export type EyedropperSample =
  | { kind: "road"; road: Road; edge: RoadEdge }
  | { kind: "building"; building: Building }
  | { kind: "zone"; zone: Zone }
  | { kind: "park"; park: Park };

// Copy drawing parameters only, never object IDs, names or institution links.
export function eyedropperSettings(sample: EyedropperSample, previous: EditorTool): Partial<EditorUiState> {
  switch (sample.kind) {
    case "road": return { currentTool: previous === "blocks" ? "blocks" : "roads", roadSubtype: sample.road.subtype, blockRoadSubtype: sample.road.subtype, roadWidth: sample.road.width, roadStructure: sample.edge.structure, roadShape: "draw", roadMode: sample.edge.geometry.type === "bezier" ? "curve" : "straight" };
    case "building": {
      const building = sample.building;
      return { currentTool: "buildings", buildingMode: "preset", buildingType: building.type, buildingSubtype: building.subtype, buildingStyle: building.style, buildingFloors: building.floors, buildingHeight: building.height };
    }
    case "zone": {
      const zone = sample.zone;
      return { currentTool: "zones", zoneMode: "custom", zoneType: zone.type, zoneColor: zone.color ?? defaultZoneColors[zone.type], zoneIcon: zone.icon ?? defaultZoneIcons[zone.type], zoneIconColor: zone.iconColor ?? defaultZoneIconColors[zone.type], zoneIconOpacity: zone.iconOpacity ?? 1 };
    }
    case "park": return { currentTool: "parks", landscapingMode: "custom", landscapingColor: sample.park.color, landscapingOpacity: sample.park.opacity };
  }
}
