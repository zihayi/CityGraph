import { describe, expect, it } from "vitest";
import type { City } from "../model/City";
import { buildRoadCreation, continuationRoad, splitRoadEdge } from "./RoadGraph";

function emptyCity(): City {
  return { id: "test", name: "Test", bounds: { x: 0, y: 0, width: 1000, height: 1000 }, mapSize: "small", terrain: "flat", roadNodes: [], roads: [], roadEdges: [], buildings: [], blocks: [], zones: [], parks: [], waters: [], pois: [], transitLines: [], transitStations: [], labels: [] };
}
function input(start: { x: number; y: number }, end: { x: number; y: number }, overrides: Partial<Parameters<typeof buildRoadCreation>[1]> = {}): Parameters<typeof buildRoadCreation>[1] {
  return { start, end, category: "normal", subtype: "small", width: 8, name: "Road", structure: "ground", geometry: { type: "line" }, ...overrides };
}
function cityFrom(result: ReturnType<typeof buildRoadCreation>): City { return { ...emptyCity(), roadNodes: result.roadNodes, roads: result.roads, roadEdges: result.roadEdges }; }

describe("Logical roads", () => {
  it("keeps a continuous A-B-C-D drawing as one road with three edges", () => {
    const first = buildRoadCreation(emptyCity(), input({ x: 0, y: 0 }, { x: 100, y: 0 }));
    const second = buildRoadCreation(cityFrom(first), input({ x: 100, y: 0 }, { x: 200, y: 30 }, { startNodeId: first.endNodeId, roadId: first.roadId }));
    const third = buildRoadCreation(cityFrom(second), input({ x: 200, y: 30 }, { x: 300, y: 30 }, { startNodeId: second.endNodeId, roadId: first.roadId }));
    expect(third.roads).toHaveLength(1); expect(third.roadEdges).toHaveLength(3); expect(third.roads[0]?.segmentIds).toHaveLength(3);
  });

  it("splits both ground roads at a crossing without changing either identity", () => {
    const horizontal = buildRoadCreation(emptyCity(), input({ x: 0, y: 50 }, { x: 100, y: 50 }, { name: "Horizontal" }));
    const vertical = buildRoadCreation(cityFrom(horizontal), input({ x: 50, y: 0 }, { x: 50, y: 100 }, { name: "Vertical" }));
    expect(vertical.roads.map((road) => road.name)).toEqual(["Horizontal", "Vertical"]);
    expect(vertical.roads.map((road) => road.segmentIds.length)).toEqual([2, 2]);
    expect(new Set(vertical.roadEdges.map((edge) => edge.roadId))).toEqual(new Set(vertical.roads.map((road) => road.id)));
  });

  it("does not create topology at an elevated crossing", () => {
    const horizontal = buildRoadCreation(emptyCity(), input({ x: 0, y: 50 }, { x: 100, y: 50 }));
    const vertical = buildRoadCreation(cityFrom(horizontal), input({ x: 50, y: 0 }, { x: 50, y: 100 }, { structure: "elevated" }));
    expect(vertical.roadNodes).toHaveLength(4); expect(vertical.roadEdges).toHaveLength(2); expect(vertical.roads).toHaveLength(2);
  });

  it("keeps a main road identity when a branch starts in its middle", () => {
    const main = buildRoadCreation(emptyCity(), input({ x: 0, y: 50 }, { x: 100, y: 50 }, { name: "Main" }));
    const split = splitRoadEdge(cityFrom(main), main.roadEdges[0]!.id, { x: 50, y: 50 });
    const branch = buildRoadCreation({ ...emptyCity(), roadNodes: split.roadNodes, roads: split.roads, roadEdges: split.roadEdges }, input({ x: 50, y: 50 }, { x: 50, y: 100 }, { startNodeId: split.nodeId, name: "Branch" }));
    expect(branch.roads.find((road) => road.id === main.roadId)?.segmentIds).toHaveLength(2);
    expect(branch.roads.find((road) => road.id === branch.roadId)?.name).toBe("Branch");
  });

  it("replaces one edge with two while retaining its logical road id", () => {
    const created = buildRoadCreation(emptyCity(), input({ x: 0, y: 0 }, { x: 100, y: 0 }));
    const split = splitRoadEdge(cityFrom(created), created.roadEdges[0]!.id, { x: 40, y: 0 });
    expect(split.changed).toBe(true); expect(split.roads).toHaveLength(1); expect(split.roads[0]?.id).toBe(created.roadId);
    expect(split.roadEdges).toHaveLength(2); expect(split.roadEdges.every((edge) => edge.roadId === created.roadId)).toBe(true);
  });

  it("only offers terminal roads for continuation", () => {
    const first = buildRoadCreation(emptyCity(), input({ x: 0, y: 0 }, { x: 100, y: 0 }));
    const split = splitRoadEdge(cityFrom(first), first.roadEdges[0]!.id, { x: 50, y: 0 });
    const splitCity = { ...emptyCity(), roadNodes: split.roadNodes, roads: split.roads, roadEdges: split.roadEdges };
    expect(continuationRoad(splitCity, first.startNodeId, { x: -20, y: 0 })?.id).toBe(first.roadId);
    expect(continuationRoad(splitCity, split.nodeId, { x: 50, y: 30 })).toBeUndefined();
  });

  it("honors a preferred road at a shared terminal junction", () => {
    const east = buildRoadCreation(emptyCity(), input({ x: 0, y: 0 }, { x: 100, y: 0 }, { name: "East" }));
    const north = buildRoadCreation(cityFrom(east), input({ x: 100, y: 0 }, { x: 100, y: -100 }, { startNodeId: east.endNodeId, name: "North" }));
    expect(continuationRoad(cityFrom(north), east.endNodeId, { x: 130, y: 0 }, north.roadId)?.id).toBe(north.roadId);
  });

  it("uses one shared node when a new road crosses multiple roads at the same junction", () => {
    const horizontal = buildRoadCreation(emptyCity(), input({ x: 0, y: 50 }, { x: 100, y: 50 }));
    const vertical = buildRoadCreation(cityFrom(horizontal), input({ x: 50, y: 0 }, { x: 50, y: 100 }));
    const diagonal = buildRoadCreation(cityFrom(vertical), input({ x: 0, y: 0 }, { x: 100, y: 100 }));
    const junctions = diagonal.roadNodes.filter((node) => Math.abs(node.x - 50) < 0.001 && Math.abs(node.y - 50) < 0.001);
    expect(junctions).toHaveLength(1); expect(diagonal.roads.find((road) => road.id === diagonal.roadId)?.segmentIds).toHaveLength(2);
  });

  it("creates topology when a ground curve crosses another road", () => {
    const horizontal = buildRoadCreation(emptyCity(), input({ x: 0, y: 50 }, { x: 100, y: 50 }, { name: "Horizontal" }));
    const curved = buildRoadCreation(cityFrom(horizontal), input({ x: 0, y: 0 }, { x: 100, y: 100 }, { name: "Curve", geometry: { type: "bezier", controlPoints: [{ x: 15, y: 85 }] } }));
    expect(curved.roads.map((road) => road.segmentIds.length)).toEqual([2, 2]);
    expect(curved.roadNodes.filter((node) => Math.abs(node.y - 50) < 0.1)).toHaveLength(3);
  });
});
