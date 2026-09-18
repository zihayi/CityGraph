import { clipFootprint, clipPolyline, insideBounds, simpleAreaParts } from "../geometry/ImportGeometry";
import type { Bounds } from "../geometry/Point";
import { isValidBuildingFootprint } from "../geometry/BuildingGeometry";
import { sampleRoad } from "../geometry/RoadGeometry";
import { isValidWaterPolygon } from "../geometry/WaterGeometry";
import type { City, RoadEdge, RoadNode } from "../model/City";

/** Cropping is non-mutating: the full import remains available for choosing a different region. */
export function cropOSMRegion(source: City, bounds: Bounds): City {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) throw new Error("Invalid import region");
  const city: City = { ...source, bounds: { ...bounds }, roadNodes: [], roadEdges: [], roads: [], buildings: [], waters: [], parks: [], zones: [], facilities: [] };
  const nodes = new Map(source.roadNodes.map((node) => [node.id, node]));
  const keptNodes = new Map<string, RoadNode>(); const roadEdges = new Map<string, RoadEdge[]>();
  for (const edge of source.roadEdges) {
    const original = sampleRoad(edge, nodes); if (!original.length) continue;
    const paths = clipPolyline(original, bounds);
    paths.forEach((path, index) => {
      const endpoint = (point: typeof path[number], end: boolean) => {
        const originalId = end ? edge.endNodeId : edge.startNodeId; const originalPoint = nodes.get(originalId)!;
        const id = Math.hypot(point.x - originalPoint.x, point.y - originalPoint.y) < 1e-7 ? originalId : `${edge.id}-crop-${index}-${end ? "end" : "start"}`;
        keptNodes.set(id, { id, x: point.x, y: point.y }); return id;
      };
      const next: RoadEdge = { ...edge, id: `${edge.id}-crop-${index}`, startNodeId: endpoint(path[0]!, false), endNodeId: endpoint(path.at(-1)!, true), geometry: path.length === 2 ? { type: "line" } : { type: "polyline", points: path.slice(1, -1) } };
      city.roadEdges.push(next); const group = roadEdges.get(edge.roadId) ?? []; group.push(next); roadEdges.set(edge.roadId, group);
    });
  }
  city.roadNodes = [...keptNodes.values()];
  city.roads = source.roads.flatMap((road) => { const edges = roadEdges.get(road.id); return edges ? [{ ...road, segmentIds: edges.map((edge) => edge.id) }] : []; });
  city.buildings = source.buildings.flatMap((building) => clipFootprint(building.footprint, bounds).filter(isValidBuildingFootprint).map((footprint, index) => ({ ...building, id: `${building.id}-crop-${index}`, footprint })));
  const clipArea = (points: typeof source.waters[number]["points"]) => clipFootprint({ outer: points, holes: [] }, bounds).flatMap(simpleAreaParts).filter(isValidWaterPolygon);
  city.waters = source.waters.flatMap((water) => clipArea(water.points).map((points, index) => ({ ...water, id: `${water.id}-crop-${index}`, points })));
  city.parks = source.parks.flatMap((park) => clipArea(park.points).map((points, index) => ({ ...park, id: `${park.id}-crop-${index}`, points, waterId: undefined })));
  city.zones = source.zones.flatMap((zone) => clipArea(zone.polygon).map((polygon, index) => ({ ...zone, id: `${zone.id}-crop-${index}`, polygon })));
  city.facilities = source.facilities.filter((facility) => insideBounds(facility.position, bounds));
  return city;
}
