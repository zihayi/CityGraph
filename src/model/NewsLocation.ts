import type { LayerId } from "../app/store/editorStore";
import type { EditorSelection } from "../editor/Editor";
import type { Point } from "../geometry/Point";
import { sampleDirectedBusPath } from "../geometry/BusGeometry";
import { sampleRailPath } from "../geometry/RailGeometry";
import { sampleLogicalRoad } from "../geometry/RoadGeometry";
import type { City } from "./City";
import type { NewsArticle } from "./AI";
import { resolveCityInformationLocation } from "./CityInformation";

export interface NewsMapLocation {
  selection: Exclude<EditorSelection, null>;
  points: Point[];
  layer?: LayerId;
}

export function resolveNewsMapLocation(city: City, article: NewsArticle): NewsMapLocation | undefined {
  for (const id of article.relatedEntityIds) {
    for (const kind of ["university", "hospital", "company", "district"] as const) {
      const resolved = resolveCityInformationLocation(city, { kind, id });
      if (resolved) return resolved as NewsMapLocation;
    }
    const zone = city.zones.find((item) => item.id === id); if (zone) return { selection: { kind: "zone", id }, points: zone.polygon, layer: "zoning" };
    const facility = city.facilities.find((item) => item.id === id); if (facility) return { selection: { kind: "facility", id }, points: [facility.position], layer: "facilities" };
    const building = city.buildings.find((item) => item.id === id); if (building) return { selection: { kind: "building", id }, points: building.footprint.outer, layer: "buildings" };
    const road = city.roads.find((item) => item.id === id); if (road) return { selection: { kind: "road", id }, points: sampleLogicalRoad(road, new Map(city.roadEdges.map((edge) => [edge.id, edge])), new Map(city.roadNodes.map((node) => [node.id, node]))), layer: "roads" };
    const busLine = city.busLines.find((item) => item.id === id); if (busLine) return { selection: { kind: "bus-line", id }, points: sampleDirectedBusPath(city, busLine), layer: "transit" };
    const busStop = city.busStops.find((item) => item.id === id); if (busStop) return { selection: { kind: "bus-stop", id }, points: [busStop.position], layer: "transit" };
    const railLine = city.railLines?.find((item) => item.id === id); if (railLine) return { selection: { kind: "rail-line", id }, points: sampleRailPath(city, railLine.path), layer: "transit" };
    const railStation = city.railStations?.find((item) => item.id === id); if (railStation) { const node = city.railNodes?.find((item) => item.id === railStation.nodeId); return { selection: { kind: "rail-station", id }, points: node ? [node] : [], layer: "transit" }; }
  }
  return undefined;
}
