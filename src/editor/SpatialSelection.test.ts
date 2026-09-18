import { afterEach, describe, expect, it, vi } from "vitest";
import type { LayerVisibility } from "../app/store/editorStore";
import * as BuildingGeometry from "../geometry/BuildingGeometry";
import type { Point } from "../geometry/Point";
import * as Polygon from "../geometry/Polygon";
import * as RoadGeometry from "../geometry/RoadGeometry";
import * as Segment from "../geometry/Segment";
import { defaultEconomySettings, type City, type RoadEdge } from "../model/City";
import { normalizeSpatialItems, spatialItemAtPoint, spatialItemsInPolygon, type SpatialSelectionItem } from "./SpatialSelection";

const visibleLayers: LayerVisibility = { baseMap: true, roads: true, buildings: true, facilities: true, poi: true, transit: true, parks: true, districts: true, water: true, labels: true, zoning: true, grid: true };
const hiddenLayers = Object.fromEntries(Object.keys(visibleLayers).map((key) => [key, false])) as LayerVisibility;
const roadLayers = { ...hiddenLayers, roads: true };

function rectangle(minX: number, minY: number, maxX: number, maxY: number): Point[] {
  return [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];
}

function originalRoadMarquee(source: City, polygon: Point[]): SpatialSelectionItem[] {
  const nodes = new Map(source.roadNodes.map((node) => [node.id, node])); const roads = new Map(source.roads.map((road) => [road.id, road]));
  return source.roadEdges.filter((edge) => {
    const road = roads.get(edge.roadId);
    return road && (Polygon.polylineIntersectsPolygon(RoadGeometry.sampleRoad(edge, nodes, 48), polygon) || polygon.some((point) => RoadGeometry.roadDistance(point, edge, nodes) <= road.width / 2));
  }).map((edge) => ({ kind: "road-edge", id: edge.id }));
}

function addDistantObjects(source: City, count = 500): void {
  for (let index = 0; index < count; index += 1) {
    const id = `distant-${index}`; const x = 10_000 + index * 100; const points = rectangle(x, x, x + 40, x + 40);
    source.roadNodes.push({ id: `${id}-a`, x, y: x }, { id: `${id}-b`, x: x + 40, y: x });
    source.roads.push({ ...source.roads[0]!, id, segmentIds: [id] });
    source.roadEdges.push({ ...source.roadEdges[0]!, id, roadId: id, startNodeId: `${id}-a`, endNodeId: `${id}-b`, geometry: index % 2 ? { type: "polyline", points } : { type: "bezier", controlPoints: points.slice(0, 2) } });
    source.zones.push({ ...source.zones[0]!, id, polygon: points });
    source.parks.push({ ...source.parks[0]!, id, points });
    source.districts.push({ ...source.districts[0]!, id, points });
    source.waters.push({ ...source.waters[0]!, id, points });
    source.buildings.push({ ...source.buildings[0]!, id, footprint: { outer: points, holes: [rectangle(x + 10, x + 10, x + 20, x + 20)] } });
    source.facilities.push({ ...source.facilities[0]!, id, position: { x, y: x } });
    source.pois.push({ ...source.pois[0]!, id, x, y: x });
  }
}

afterEach(() => vi.restoreAllMocks());

function city(): City {
  return {
    id: "city", name: "City", bounds: { x: 0, y: 0, width: 200, height: 200 }, mapSize: "small", terrain: "flat", economy: { ...defaultEconomySettings },
    roadNodes: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 40, y: 0 }], roads: [{ id: "road", name: "Road", category: "normal", subtype: "small", width: 8, segmentIds: ["edge"] }], roadEdges: [{ id: "edge", roadId: "road", name: "Road", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } }],
    zones: [{ id: "zone", type: "commercial", polygon: [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 }], source: "custom", opacity: 0.5 }],
    parks: [{ id: "park", points: [{ x: 50, y: 50 }, { x: 60, y: 50 }, { x: 60, y: 60 }, { x: 50, y: 60 }], source: "custom", color: "#00aa00", opacity: 0.6 }],
    districts: [{ id: "district", name: "District", points: [{ x: 70, y: 70 }, { x: 80, y: 70 }, { x: 80, y: 80 }, { x: 70, y: 80 }] }],
    waters: [{ id: "water", points: [{ x: 90, y: 90 }, { x: 100, y: 90 }, { x: 100, y: 100 }, { x: 90, y: 100 }] }],
    buildings: [{ id: "building", footprint: { outer: [{ x: 12, y: 12 }, { x: 24, y: 12 }, { x: 24, y: 24 }, { x: 12, y: 24 }], holes: [] }, type: "office", subtype: "", floors: 2, height: 6, style: "modern" }],
    facilities: [{ id: "facility", type: "store", name: "Store", position: { x: 16, y: 16 }, icon: "", color: "#123456" }], pois: [{ id: "poi", type: "school", name: "School", x: 18, y: 18 }],
    blocks: [], universities: [], hospitals: [], companies: [], transitLines: [], transitStations: [], railNodes: [], railTracks: [], railStations: [], railLines: [], busTerminals: [], busLines: [], busStops: [], labels: [],
  };
}

describe("spatial selection", () => {
  it("finds every visible entity intersecting a marquee", () => {
    const items = spatialItemsInPolygon(city(), [{ x: 5, y: -2 }, { x: 35, y: -2 }, { x: 35, y: 35 }, { x: 5, y: 35 }], visibleLayers);
    expect(items).toEqual(expect.arrayContaining([{ kind: "road-edge", id: "edge" }, { kind: "zone", id: "zone" }, { kind: "building", id: "building" }, { kind: "facility", id: "facility" }, { kind: "poi", id: "poi" }]));
    expect(items).toHaveLength(5);
  });

  it("respects hidden layers and point-picking priority", () => {
    const source = city();
    expect(spatialItemAtPoint(source, { x: 16, y: 16 }, 4, visibleLayers)).toEqual({ kind: "facility", id: "facility" });
    expect(spatialItemsInPolygon(source, [{ x: 5, y: -2 }, { x: 35, y: -2 }, { x: 35, y: 35 }, { x: 5, y: 35 }], { ...visibleLayers, roads: false, facilities: false }).map((item) => item.kind)).toEqual(["zone", "building", "poi"]);
  });

  it("normalizes duplicate and stale items", () => {
    expect(normalizeSpatialItems(city(), [{ kind: "zone", id: "zone" }, { kind: "zone", id: "zone" }, { kind: "poi", id: "missing" }])).toEqual([{ kind: "zone", id: "zone" }]);
  });

  it("samples only the local marquee candidate and reuses its distance path for every corner", () => {
    const source = city(); source.roadEdges[0]!.geometry = { type: "bezier", controlPoints: [{ x: 20, y: 80 }] };
    addDistantObjects(source);
    const sample = vi.spyOn(RoadGeometry, "sampleRoad"); const exact = vi.spyOn(Polygon, "polylineIntersectsPolygon");
    // All four corners miss the curve, despite lying in its conservative control bounds.
    expect(spatialItemsInPolygon(source, rectangle(18, 60, 22, 64), roadLayers)).toEqual([]);
    expect(sample.mock.calls.map(([edge, , segments]) => [edge.id, segments])).toEqual([["edge", 48], ["edge", undefined]]);
    expect(exact).toHaveBeenCalledTimes(1);
    sample.mockClear(); exact.mockClear();
    expect(spatialItemsInPolygon(source, rectangle(18, 42, 22, 43), roadLayers)).toEqual([{ kind: "road-edge", id: "edge" }]);
    expect(sample).toHaveBeenCalledTimes(2); expect(exact).toHaveBeenCalledTimes(1);
  });

  it("runs exact road distance only for nearby point candidates, including width-only hits", () => {
    const source = city(); source.roadEdges[0]!.geometry = { type: "bezier", controlPoints: [{ x: 20, y: 80 }] };
    addDistantObjects(source);
    const exact = vi.spyOn(RoadGeometry, "roadDistance");
    expect(spatialItemAtPoint(source, { x: 20, y: 43 }, 0.5, roadLayers)).toEqual({ kind: "road-edge", id: "edge" });
    expect(exact).toHaveBeenCalledTimes(1); expect(exact.mock.calls[0]![1].id).toBe("edge");
    exact.mockClear();
    expect(spatialItemAtPoint(source, { x: -1_000, y: -1_000 }, 2, roadLayers)).toBeUndefined();
    expect(exact).not.toHaveBeenCalled();
  });

  it("does not add polygon, footprint or segment exact work for 500 distant objects per collection", () => {
    const source = city();
    const spies = [vi.spyOn(Polygon, "polygonsIntersectOrContain"), vi.spyOn(Polygon, "pointInPolygon"), vi.spyOn(BuildingGeometry, "footprintContainsPoint"), vi.spyOn(Segment, "segmentIntersection"), vi.spyOn(RoadGeometry, "sampleRoad"), vi.spyOn(RoadGeometry, "roadDistance")];
    const query = rectangle(-5, -5, 105, 105);
    const expectedMarquee = spatialItemsInPolygon(source, query, visibleLayers);
    const marqueeCalls = spies.map((spy) => spy.mock.calls.length); spies.forEach((spy) => spy.mockClear());
    const expectedPoint = spatialItemAtPoint(source, { x: 11, y: 11 }, 0.1, visibleLayers);
    const pointCalls = spies.map((spy) => spy.mock.calls.length); spies.forEach((spy) => spy.mockClear());
    addDistantObjects(source);
    expect(spatialItemsInPolygon(source, query, visibleLayers)).toEqual(expectedMarquee);
    expect(spies.map((spy) => spy.mock.calls.length)).toEqual(marqueeCalls); spies.forEach((spy) => spy.mockClear());
    expect(spatialItemAtPoint(source, { x: 11, y: 11 }, 0.1, visibleLayers)).toEqual(expectedPoint);
    expect(spies.map((spy) => spy.mock.calls.length)).toEqual(pointCalls); spies.forEach((spy) => spy.mockClear());
    expect(spatialItemsInPolygon(source, rectangle(-1_000, -1_000, -990, -990), visibleLayers)).toEqual([]);
    expect(spatialItemAtPoint(source, { x: -1_000, y: -1_000 }, 1, visibleLayers)).toBeUndefined();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it.each<{ geometry: RoadEdge["geometry"]; y: number }>([
    { geometry: { type: "line" }, y: 0 },
    { geometry: { type: "bezier", controlPoints: [{ x: 0, y: 80 }] }, y: 40 },
    { geometry: { type: "bezier", controlPoints: [{ x: -40, y: 80 }, { x: 40, y: 80 }] }, y: 60 },
    { geometry: { type: "polyline", points: [{ x: -40, y: 60 }, { x: 40, y: 60 }] }, y: 60 },
  ])("preserves centerline and width-only selection for $geometry.type", ({ geometry, y }) => {
    const source = city(); source.roadNodes[0]!.x = -40; source.roadEdges[0]!.geometry = geometry;
    const nodes = new Map(source.roadNodes.map((node) => [node.id, node])); const selected = [{ kind: "road-edge", id: "edge" }];
    const widthOnly = rectangle(-0.1, y + 2.9, 0.1, y + 3.1);
    expect(Polygon.polylineIntersectsPolygon(RoadGeometry.sampleRoad(source.roadEdges[0]!, nodes, 48), widthOnly)).toBe(false);
    const sample = vi.spyOn(RoadGeometry, "sampleRoad");
    expect(spatialItemsInPolygon(source, widthOnly, roadLayers)).toEqual(selected);
    expect(sample).toHaveBeenCalledTimes(geometry.type === "bezier" ? 2 : 1);
    sample.mockRestore();
    expect(spatialItemsInPolygon(source, rectangle(-0.1, y - 0.1, 0.1, y + 0.1), roadLayers)).toEqual(selected);
    expect(spatialItemAtPoint(source, { x: 0, y: y + 3 }, 0.5, roadLayers)).toEqual(selected[0]);
    expect(spatialItemAtPoint(source, { x: 0, y: y + 5 }, 0.5, roadLayers)).toBeUndefined();
    // Compare both sampling resolutions at narrow boundaries and broad-phase false positives.
    for (const width of [0.01, 8]) {
      source.roads[0]!.width = width;
      for (let x = -45; x <= 45; x += 9) for (let queryY = -5; queryY <= 85; queryY += 5) {
        const query = rectangle(x, queryY, x + 0.05, queryY + 0.05);
        expect(spatialItemsInPolygon(source, query, roadLayers)).toEqual(originalRoadMarquee(source, query));
        const distance = RoadGeometry.roadDistance(query[0]!, source.roadEdges[0]!, nodes);
        expect(spatialItemAtPoint(source, query[0]!, 0.1, roadLayers)).toEqual(distance <= Math.max(0.1, width / 2) ? selected[0] : undefined);
      }
    }
  });

  it("preserves both original curve sampling resolutions at sub-sample marquee boundaries", () => {
    const source = city(); source.roadNodes[0]!.x = -40; source.roads[0]!.width = 0.001;
    source.roadEdges[0]!.geometry = { type: "bezier", controlPoints: [{ x: 0, y: 80 }] };
    const edge = source.roadEdges[0]!; const nodes = new Map(source.roadNodes.map((node) => [node.id, node]));
    for (const segments of [28, 48]) {
      const path = RoadGeometry.sampleRoad(edge, nodes, segments);
      const point = { x: (path[1]!.x + path[2]!.x) / 2, y: (path[1]!.y + path[2]!.y) / 2 };
      const query = rectangle(point.x - 1e-6, point.y - 1e-6, point.x + 1e-6, point.y + 1e-6);
      expect(Polygon.polylineIntersectsPolygon(RoadGeometry.sampleRoad(edge, nodes, 48), query)).toBe(segments === 48);
      expect(RoadGeometry.roadDistance(query[0]!, edge, nodes) <= source.roads[0]!.width / 2).toBe(segments === 28);
      expect(spatialItemsInPolygon(source, query, roadLayers)).toEqual([{ kind: "road-edge", id: "edge" }]);
    }
  });

  it("preserves layer priorities, reverse insertion order, road ties and marquee order", () => {
    const source = city(); const polygon = rectangle(-10, -10, 10, 10);
    source.facilities = [0, 1].map((index) => ({ ...source.facilities[0]!, id: `facility-${index}`, position: { x: 0, y: 0 } }));
    source.pois = [0, 1].map((index) => ({ ...source.pois[0]!, id: `poi-${index}`, x: 0, y: 0 }));
    source.buildings = [0, 1].map((index) => ({ ...source.buildings[0]!, id: `building-${index}`, footprint: { outer: polygon, holes: [] } }));
    source.roadEdges = [0, 1].map((index) => ({ ...source.roadEdges[0]!, id: `edge-${index}` }));
    source.parks = [0, 1].map((index) => ({ ...source.parks[0]!, id: `park-${index}`, points: polygon }));
    source.zones = [0, 1].map((index) => ({ ...source.zones[0]!, id: `zone-${index}`, polygon }));
    source.waters = [0, 1].map((index) => ({ ...source.waters[0]!, id: `water-${index}`, points: polygon }));
    source.districts = [0, 1].map((index) => ({ ...source.districts[0]!, id: `district-${index}`, points: polygon }));
    const layers = { ...visibleLayers }; const before = structuredClone(source);
    for (const [layer, kind, id] of [
      ["facilities", "facility", "facility-1"], ["poi", "poi", "poi-1"], ["buildings", "building", "building-1"], ["roads", "road-edge", "edge-0"],
      ["parks", "park", "park-1"], ["zoning", "zone", "zone-1"], ["water", "water", "water-1"], ["districts", "district", "district-1"],
    ] as const) {
      expect(spatialItemAtPoint(source, { x: 0, y: 0 }, 1, layers)).toEqual({ kind, id }); layers[layer] = false;
    }
    expect(spatialItemAtPoint(source, { x: 0, y: 0 }, 1, layers)).toBeUndefined();
    expect(spatialItemsInPolygon(source, polygon, visibleLayers).map((item) => item.id)).toEqual(["edge-0", "edge-1", "zone-0", "zone-1", "park-0", "park-1", "district-0", "district-1", "water-0", "water-1", "building-0", "building-1", "facility-0", "facility-1", "poi-0", "poi-1"]);
    expect(source).toEqual(before);
  });

  it("chooses the nearest eligible road rather than the first width hit", () => {
    const source = city(); source.roadNodes.push({ id: "c", x: 0, y: 3 }, { id: "d", x: 40, y: 3 });
    source.roadEdges.push({ ...source.roadEdges[0]!, id: "nearer", startNodeId: "c", endNodeId: "d" });
    expect(spatialItemAtPoint(source, { x: 20, y: 2 }, 0.1, roadLayers)).toEqual({ kind: "road-edge", id: "nearer" });
    source.roadEdges[1]!.roadId = "missing";
    expect(spatialItemAtPoint(source, { x: 20, y: 2 }, 0.1, roadLayers)).toEqual({ kind: "road-edge", id: "edge" });
    expect(spatialItemAtPoint(source, { x: 20, y: 2 }, 1, roadLayers)).toEqual({ kind: "road-edge", id: "nearer" });
    source.roadEdges[1]!.endNodeId = "missing";
    expect(spatialItemAtPoint(source, { x: 20, y: 2 }, 1, roadLayers)).toEqual({ kind: "road-edge", id: "edge" });
    expect(spatialItemsInPolygon(source, rectangle(19, 1, 21, 4), roadLayers)).toEqual([{ kind: "road-edge", id: "edge" }]);
  });

  it("retains exact rotated footprint and courtyard hole handling after AABB rejection", () => {
    const source = city(); const footprint = BuildingGeometry.createBuildingPreset("courtyard", { x: 0, y: 0 }, 20, 20, Math.PI / 4);
    source.buildings[0]!.footprint = footprint; const layers = { ...hiddenLayers, buildings: true }; const selected = { kind: "building", id: "building" };
    expect(spatialItemAtPoint(source, { x: 0, y: 0 }, 0, layers)).toBeUndefined();
    expect(spatialItemsInPolygon(source, rectangle(-1, -1, 1, 1), layers)).toEqual([]);
    expect(spatialItemAtPoint(source, { x: 12, y: 12 }, 0, layers)).toBeUndefined();
    expect(spatialItemsInPolygon(source, rectangle(11, 11, 12, 12), layers)).toEqual([]);
    expect(spatialItemAtPoint(source, { x: 10, y: 0 }, 0, layers)).toEqual(selected);
    const holeVertex = footprint.holes[0]![0]!;
    expect(spatialItemAtPoint(source, holeVertex, 0, layers)).toEqual(selected);
    expect(spatialItemsInPolygon(source, rectangle(holeVertex.x - 0.1, holeVertex.y - 0.1, holeVertex.x + 0.1, holeVertex.y + 0.1), layers)).toEqual([selected]);
    expect(spatialItemsInPolygon(source, rectangle(-20, -20, 20, 20), layers)).toEqual([selected]);
  });

  it("keeps rotated polygon exact tests and boundary epsilon semantics", () => {
    const source = city(); source.zones[0]!.polygon = [{ x: 0, y: -10 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 }];
    const layers = { ...hiddenLayers, zoning: true };
    expect(spatialItemAtPoint(source, { x: 9, y: 9 }, 0, layers)).toBeUndefined();
    expect(spatialItemsInPolygon(source, rectangle(8, 8, 9, 9), layers)).toEqual([]);
    expect(spatialItemAtPoint(source, { x: 10 + 5e-10, y: 0 }, 0, layers)).toEqual({ kind: "zone", id: "zone" });
    source.zones[0]!.polygon = rectangle(0, 0, 1e6, 1e6);
    const query = rectangle(1e6 + 0.0005, 100, 2e6, 200);
    expect(Polygon.polygonsIntersectOrContain(source.zones[0]!.polygon, query)).toBe(true);
    expect(spatialItemsInPolygon(source, query, layers)).toEqual([{ kind: "zone", id: "zone" }]);
    source.zones[0]!.polygon = rectangle(0, 0, 2e-9, 2e-9);
    const tinyParallel = rectangle(0, 0.1, 2e-9, 0.1 + 2e-9);
    expect(Polygon.polygonsIntersectOrContain(source.zones[0]!.polygon, tinyParallel)).toBe(true);
    expect(spatialItemsInPolygon(source, tinyParallel, layers)).toEqual([{ kind: "zone", id: "zone" }]);
  });

  it("rebuilds query data after in-place drags and road width changes", () => {
    const source = city(); const point = { x: 20, y: 15 }; const query = rectangle(19, 14, 21, 16);
    const check = (hit: boolean) => {
      expect(spatialItemAtPoint(source, point, 0, roadLayers)).toEqual(hit ? { kind: "road-edge", id: "edge" } : undefined);
      expect(spatialItemsInPolygon(source, query, roadLayers)).toEqual(hit ? [{ kind: "road-edge", id: "edge" }] : []);
    };
    check(false); source.roads[0]!.width = 32; check(true); source.roads[0]!.width = 8; check(false);
    for (const node of source.roadNodes) node.y += 15;
    check(true); for (const node of source.roadNodes) node.y += 100; check(false);
    const buildingPoint = { x: 18, y: 18 }; const buildingQuery = rectangle(17, 17, 19, 19); const layers = { ...hiddenLayers, buildings: true, zoning: true };
    expect(spatialItemAtPoint(source, buildingPoint, 0, layers)?.kind).toBe("building");
    expect(spatialItemsInPolygon(source, buildingQuery, layers)).toHaveLength(2);
    for (const vertex of [...source.buildings[0]!.footprint.outer, ...source.zones[0]!.polygon]) vertex.x += 1_000;
    expect(spatialItemAtPoint(source, buildingPoint, 0, layers)).toBeUndefined();
    expect(spatialItemsInPolygon(source, buildingQuery, layers)).toEqual([]);
  });

  it.each(["bezier", "polyline"] as const)("reflects in-place %s control/vertex drags in both selection queries", (type) => {
    const source = city(); source.roadNodes[0]!.x = -40; const control = { x: 0, y: 200 };
    source.roadEdges[0]!.geometry = type === "bezier" ? { type, controlPoints: [control] } : { type, points: [control] };
    const point = { x: 0, y: type === "bezier" ? 30 : 60 }; const query = rectangle(-0.1, point.y - 0.1, 0.1, point.y + 0.1);
    for (const y of [200, 60, 200]) {
      control.y = y;
      expect(spatialItemAtPoint(source, point, 0, roadLayers)).toEqual(y === 60 ? { kind: "road-edge", id: "edge" } : undefined);
      expect(spatialItemsInPolygon(source, query, roadLayers)).toEqual(y === 60 ? [{ kind: "road-edge", id: "edge" }] : []);
    }
  });

  it("builds one ID set per used collection and preserves first occurrence order across kinds", () => {
    const source = city(); let reads = 0;
    source.zones = Array.from({ length: 500 }, (_, index) => ({ ...source.zones[0]!, get id() { reads += 1; return `zone-${index}`; } }));
    source.buildings[0] = { ...source.buildings[0]!, get id(): string { throw new Error("Unused collection was indexed"); } };
    source.pois[0]!.id = "zone-0";
    const items: SpatialSelectionItem[] = Array.from({ length: 500 }, (_, index) => ({ kind: "zone", id: `zone-${499 - index}` }));
    const otherKind: SpatialSelectionItem = { kind: "poi", id: "zone-0" };
    const result = normalizeSpatialItems(source, [...items, ...items, { kind: "zone", id: "missing" }, otherKind, otherKind]);
    expect(result).toEqual([...items, otherKind]); expect(result[0]).toBe(items[0]); expect(reads).toBe(500);
    source.zones.splice(499, 1);
    expect(normalizeSpatialItems(source, [items[0]!])).toEqual([]);
  });
});
