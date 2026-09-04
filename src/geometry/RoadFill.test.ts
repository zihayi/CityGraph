import { describe, expect, it } from "vitest";
import type { City, RoadStructure } from "../model/City";
import { buildRoadFillFaces, findRoadFillPolygon } from "./RoadFill";
import { zoneArea } from "./ZoneGeometry";

function square(structure: RoadStructure = "ground"): City {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  return { id: "fill", name: "Fill", bounds: { x: -50, y: -50, width: 200, height: 200 }, mapSize: "small", terrain: "flat", roadNodes: points.map((point, index) => ({ id: `n${index}`, ...point })), roads: points.map((_, index) => ({ id: `r${index}`, name: "", category: "normal", subtype: "small", width: 10, segmentIds: [`e${index}`] })), roadEdges: points.map((_, index) => ({ id: `e${index}`, roadId: `r${index}`, name: "", startNodeId: `n${index}`, endNodeId: `n${(index + 1) % points.length}`, structure, level: structure === "ground" ? 0 : structure === "elevated" ? 1 : -1, geometry: { type: "line" } })), buildings: [], blocks: [], zones: [], parks: [], waters: [], pois: [], facilities: [], universities: [], transitLines: [], transitStations: [], busTerminals: [], busLines: [], busStops: [], labels: [] };
}

describe("road fill", () => {
  it("finds a bounded ground-road face and insets by half the road width", () => { const faces = buildRoadFillFaces(square()); const polygon = findRoadFillPolygon(faces, { x: 50, y: 50 }); expect(faces).toHaveLength(1); expect(polygon).toHaveLength(4); expect(zoneArea(polygon!)).toBeCloseTo(8100, 3); });
  it("does not use elevated or tunnel roads as boundaries", () => { expect(buildRoadFillFaces(square("elevated"))).toHaveLength(0); expect(buildRoadFillFaces(square("tunnel"))).toHaveLength(0); });
  it("uses geometric ground crossings but ignores elevated and tunnel dividers", () => {
    const addDivider = (city: City, structure: RoadStructure) => { city.roadNodes.push({ id: "left", x: 0, y: 50 }, { id: "right", x: 100, y: 50 }); city.roads.push({ id: "divider", name: "", category: "normal", subtype: "small", width: 10, segmentIds: ["divider-edge"] }); city.roadEdges.push({ id: "divider-edge", roadId: "divider", name: "", startNodeId: "left", endNodeId: "right", structure, level: structure === "ground" ? 0 : structure === "elevated" ? 1 : -1, geometry: { type: "line" } }); return city; };
    expect(buildRoadFillFaces(addDivider(square(), "ground"))).toHaveLength(2); expect(buildRoadFillFaces(addDivider(square(), "elevated"))).toHaveLength(1); expect(buildRoadFillFaces(addDivider(square(), "tunnel"))).toHaveLength(1);
  });
  it("recognizes a curved four-bezier road loop", () => { const city = square(); const k = 55.228; city.roadNodes = [{ id: "n0", x: 100, y: 0 }, { id: "n1", x: 0, y: 100 }, { id: "n2", x: -100, y: 0 }, { id: "n3", x: 0, y: -100 }]; city.roadEdges.forEach((edge, index) => { const controls = [[{ x: 100, y: k }, { x: k, y: 100 }], [{ x: -k, y: 100 }, { x: -100, y: k }], [{ x: -100, y: -k }, { x: -k, y: -100 }], [{ x: k, y: -100 }, { x: 100, y: -k }]][index]!; edge.geometry = { type: "bezier", controlPoints: controls }; }); const polygon = findRoadFillPolygon(buildRoadFillFaces(city), { x: 0, y: 0 }); expect(polygon?.length).toBeGreaterThan(100); expect(zoneArea(polygon!)).toBeGreaterThan(27_000); });
});
