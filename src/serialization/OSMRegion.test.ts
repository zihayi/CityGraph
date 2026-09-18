import { describe, expect, it } from "vitest";
import { createNewCity } from "../model/mapGenerator";
import { boundsCorners, insideBounds } from "../geometry/ImportGeometry";
import { sampleRoad } from "../geometry/RoadGeometry";
import { cropOSMRegion } from "./OSMRegion";

describe("OSM region", () => {
  it("crops all layers to the chosen rectangle and maintains valid road references", () => {
    const city = createNewCity({ name: "Source", size: "small", terrain: "flat", lakeCount: 1 });
    city.roadNodes = [{ id: "a", x: -10, y: 50 }, { id: "b", x: 110, y: 50 }, { id: "c", x: 50, y: 50 }];
    city.roads = [{ id: "r", name: "Road", width: 6, subtype: "small", category: "normal", segmentIds: ["ab", "cb"] }];
    city.roadEdges = [{ id: "ab", roadId: "r", name: "Road", startNodeId: "a", endNodeId: "c", structure: "ground", level: 0, geometry: { type: "line" } }, { id: "cb", roadId: "r", name: "Road", startNodeId: "c", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } }];
    const polygon = boundsCorners({ x: -20, y: -20, width: 140, height: 140 });
    city.buildings = [{ id: "b", footprint: { outer: polygon, holes: [] }, floors: 2, height: 6, type: "residential", subtype: "", style: "modern" }];
    city.zones = [{ id: "z", polygon, type: "residential", source: "custom", opacity: 0.4 }];
    city.parks = [{ id: "p", points: polygon, source: "custom", color: "#558855", opacity: 0.6 }];
    city.waters = [{ id: "w", points: polygon }];
    city.facilities = [{ id: "in", type: "cafe", name: "In", position: { x: 50, y: 50 }, icon: "", color: "#123456" }, { id: "out", type: "cafe", name: "Out", position: { x: 200, y: 200 }, icon: "", color: "#123456" }];
    const before = structuredClone(city); const bounds = { x: 0, y: 0, width: 100, height: 100 }; const result = cropOSMRegion(city, bounds);
    expect(city).toEqual(before); expect(result.facilities.map((facility) => facility.id)).toEqual(["in"]);
    expect(result.roadEdges).toHaveLength(2); expect(result.roadEdges[0]!.endNodeId).toBe(result.roadEdges[1]!.startNodeId);
    const nodes = new Map(result.roadNodes.map((node) => [node.id, node]));
    expect(result.roadEdges.flatMap((edge) => sampleRoad(edge, nodes)).every((point) => insideBounds(point, bounds))).toBe(true);
    const allAreas = [...result.buildings.map((building) => building.footprint.outer), ...result.zones.map((zone) => zone.polygon), ...result.parks.map((park) => park.points), ...result.waters.map((water) => water.points)];
    expect(allAreas).toHaveLength(4); expect(allAreas.flat().every((point) => insideBounds(point, bounds))).toBe(true);
    expect(result.roads[0]!.segmentIds).toEqual(result.roadEdges.map((edge) => edge.id));
  });
});
