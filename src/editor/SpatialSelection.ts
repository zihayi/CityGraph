import type { LayerVisibility } from "../app/store/editorStore";
import { footprintContainsPoint } from "../geometry/BuildingGeometry";
import type { Point } from "../geometry/Point";
import { pointInPolygon, polygonsIntersectOrContain, polylineIntersectsPolygon } from "../geometry/Polygon";
import { pointToSegmentDistance, roadBounds, roadDistance, sampleRoad, type RoadBounds } from "../geometry/RoadGeometry";
import { segmentIntersection } from "../geometry/Segment";
import type { BuildingFootprint, City } from "../model/City";

export type SpatialSelectionKind = "road-edge" | "zone" | "park" | "district" | "water" | "building" | "facility" | "poi";
export interface SpatialSelectionItem { kind: SpatialSelectionKind; id: string }

export function spatialItemKey(item: SpatialSelectionItem): string { return `${item.kind}:${item.id}`; }

function polygonBounds(points: readonly Point[]): RoadBounds {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const point of points) {
    bounds.minX = Math.min(bounds.minX, point.x); bounds.minY = Math.min(bounds.minY, point.y);
    bounds.maxX = Math.max(bounds.maxX, point.x); bounds.maxY = Math.max(bounds.maxY, point.y);
  }
  return bounds;
}

function boundsOverlap(a: RoadBounds, b: RoadBounds): boolean {
  // Segment intersection accepts parameters within 1e-9 of endpoints. Its cross-product
  // tolerance also admits gaps up to 2 units for nearly degenerate, parallel segments.
  const padding = 2 + 1e-9 * (Math.max(1, a.maxX - a.minX, a.maxY - a.minY) + Math.max(1, b.maxX - b.minX, b.maxY - b.minY));
  return a.minX <= b.maxX + padding && a.maxX >= b.minX - padding && a.minY <= b.maxY + padding && a.maxY >= b.minY - padding;
}

function pointInBounds(point: Point, bounds: RoadBounds): boolean {
  const epsilon = 1e-9; // Match pointInPolygon's boundary tolerance.
  return point.x >= bounds.minX - epsilon && point.x <= bounds.maxX + epsilon && point.y >= bounds.minY - epsilon && point.y <= bounds.maxY + epsilon;
}

function boundariesIntersect(first: readonly Point[], second: readonly Point[]): boolean {
  for (let a = 0; a < first.length; a += 1) for (let b = 0; b < second.length; b += 1) if (segmentIntersection(first[a]!, first[(a + 1) % first.length]!, second[b]!, second[(b + 1) % second.length]!)) return true;
  return false;
}

function footprintIntersectsPolygon(footprint: BuildingFootprint, polygon: readonly Point[], queryBounds: RoadBounds): boolean {
  const outerOverlaps = boundsOverlap(polygonBounds(footprint.outer), queryBounds);
  if (outerOverlaps && boundariesIntersect(footprint.outer, polygon)) return true;
  for (const hole of footprint.holes) if (boundsOverlap(polygonBounds(hole), queryBounds) && boundariesIntersect(hole, polygon)) return true;
  if (!outerOverlaps) return false;
  if (footprint.outer.some((point) => pointInPolygon(point, polygon))) return true;
  return polygon.some((point) => footprintContainsPoint(footprint, point));
}

export function spatialItemsInPolygon(city: City, polygon: readonly Point[], layers: LayerVisibility): SpatialSelectionItem[] {
  if (polygon.length < 3) return [];
  const items: SpatialSelectionItem[] = [];
  const queryBounds = polygonBounds(polygon);
  if (layers.roads) {
    const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const roads = new Map(city.roads.map((road) => [road.id, road]));
    for (const edge of city.roadEdges) {
      const road = roads.get(edge.roadId); if (!road) continue;
      const bounds = roadBounds(edge, nodes, road.width / 2);
      if (!bounds || !boundsOverlap(bounds, queryBounds)) continue;
      const path = sampleRoad(edge, nodes, 48);
      let intersects = polylineIntersectsPolygon(path, polygon);
      if (!intersects) {
        // Preserve the distance test's 28-segment resolution, but sample only once per candidate.
        const distancePath = edge.geometry.type === "bezier" ? sampleRoad(edge, nodes) : path;
        intersects = polygon.some((point) => {
          for (let index = 1; index < distancePath.length; index += 1) {
            if (pointToSegmentDistance(point, distancePath[index - 1]!, distancePath[index]!) <= road.width / 2) return true;
          }
          return false;
        });
      }
      if (intersects) items.push({ kind: "road-edge", id: edge.id });
    }
  }
  if (layers.zoning) for (const zone of city.zones) if (boundsOverlap(polygonBounds(zone.polygon), queryBounds) && polygonsIntersectOrContain(zone.polygon, polygon)) items.push({ kind: "zone", id: zone.id });
  if (layers.parks) for (const park of city.parks) if (boundsOverlap(polygonBounds(park.points), queryBounds) && polygonsIntersectOrContain(park.points, polygon)) items.push({ kind: "park", id: park.id });
  if (layers.districts) for (const district of city.districts) if (boundsOverlap(polygonBounds(district.points), queryBounds) && polygonsIntersectOrContain(district.points, polygon)) items.push({ kind: "district", id: district.id });
  if (layers.water) for (const water of city.waters) if (boundsOverlap(polygonBounds(water.points), queryBounds) && polygonsIntersectOrContain(water.points, polygon)) items.push({ kind: "water", id: water.id });
  if (layers.buildings) for (const building of city.buildings) if (footprintIntersectsPolygon(building.footprint, polygon, queryBounds)) items.push({ kind: "building", id: building.id });
  if (layers.facilities) for (const facility of city.facilities) if (pointInBounds(facility.position, queryBounds) && pointInPolygon(facility.position, polygon)) items.push({ kind: "facility", id: facility.id });
  if (layers.poi) for (const poi of city.pois) if (pointInBounds(poi, queryBounds) && pointInPolygon(poi, polygon)) items.push({ kind: "poi", id: poi.id });
  return items;
}

export function spatialItemAtPoint(city: City, point: Point, tolerance: number, layers: LayerVisibility): SpatialSelectionItem | undefined {
  if (layers.facilities) for (let index = city.facilities.length - 1; index >= 0; index -= 1) {
    const facility = city.facilities[index]!;
    if (Math.hypot(facility.position.x - point.x, facility.position.y - point.y) <= tolerance * 1.5) return { kind: "facility", id: facility.id };
  }
  if (layers.poi) for (let index = city.pois.length - 1; index >= 0; index -= 1) {
    const poi = city.pois[index]!;
    if (Math.hypot(poi.x - point.x, poi.y - point.y) <= tolerance * 1.5) return { kind: "poi", id: poi.id };
  }
  if (layers.buildings) for (let index = city.buildings.length - 1; index >= 0; index -= 1) {
    const building = city.buildings[index]!;
    if (pointInBounds(point, polygonBounds(building.footprint.outer)) && footprintContainsPoint(building.footprint, point)) return { kind: "building", id: building.id };
  }
  if (layers.roads) {
    const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const roads = new Map(city.roads.map((road) => [road.id, road]));
    let nearest: SpatialSelectionItem | undefined; let nearestDistance = Infinity;
    for (const edge of city.roadEdges) {
      const radius = Math.max(tolerance, (roads.get(edge.roadId)?.width ?? 0) / 2);
      const bounds = roadBounds(edge, nodes, radius);
      if (!bounds || !pointInBounds(point, bounds)) continue;
      const distance = roadDistance(point, edge, nodes);
      if (distance <= radius && (!nearest || distance < nearestDistance)) { nearest = { kind: "road-edge", id: edge.id }; nearestDistance = distance; }
    }
    if (nearest) return nearest;
  }
  if (layers.parks) for (let index = city.parks.length - 1; index >= 0; index -= 1) {
    const park = city.parks[index]!;
    if (pointInBounds(point, polygonBounds(park.points)) && pointInPolygon(point, park.points)) return { kind: "park", id: park.id };
  }
  if (layers.zoning) for (let index = city.zones.length - 1; index >= 0; index -= 1) {
    const zone = city.zones[index]!;
    if (pointInBounds(point, polygonBounds(zone.polygon)) && pointInPolygon(point, zone.polygon)) return { kind: "zone", id: zone.id };
  }
  if (layers.water) for (let index = city.waters.length - 1; index >= 0; index -= 1) {
    const water = city.waters[index]!;
    if (pointInBounds(point, polygonBounds(water.points)) && pointInPolygon(point, water.points)) return { kind: "water", id: water.id };
  }
  if (layers.districts) for (let index = city.districts.length - 1; index >= 0; index -= 1) {
    const district = city.districts[index]!;
    if (pointInBounds(point, polygonBounds(district.points)) && pointInPolygon(point, district.points)) return { kind: "district", id: district.id };
  }
  return undefined;
}

export function normalizeSpatialItems(city: City, items: readonly SpatialSelectionItem[]): SpatialSelectionItem[] {
  const collections = { "road-edge": city.roadEdges, zone: city.zones, park: city.parks, district: city.districts, water: city.waters, building: city.buildings, facility: city.facilities, poi: city.pois } as const;
  const idsByKind = new Map<SpatialSelectionKind, Set<string>>(); const seen = new Set<string>();
  return items.filter((item) => {
    const key = spatialItemKey(item); if (seen.has(key)) return false;
    let ids = idsByKind.get(item.kind);
    if (!ids) { ids = new Set(collections[item.kind].map((entity) => entity.id)); idsByKind.set(item.kind, ids); }
    if (!ids.has(item.id)) return false;
    seen.add(key); return true;
  });
}
