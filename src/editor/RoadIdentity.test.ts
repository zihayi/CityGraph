import { describe, expect, it } from "vitest";
import type { City, RoadEdge } from "../model/City";
import { Editor } from "./Editor";
import { buildRoadCreation, splitRoadEdge } from "./RoadGraph";
import { connectedRoadEdgeComponents, roadIdentityGroupEdges, selectedRoadEdges } from "./RoadIdentity";

function emptyCity(): City {
  return { id: "identity", name: "Identity", bounds: { x: -200, y: -200, width: 800, height: 800 }, mapSize: "small", terrain: "flat", roadNodes: [], roads: [], roadEdges: [], buildings: [], blocks: [], zones: [], parks: [], districts: [], waters: [], pois: [], facilities: [], universities: [], hospitals: [], companies: [], transitLines: [], transitStations: [], busTerminals: [], busLines: [], busStops: [], labels: [] };
}
function add(city: City, start: { x: number; y: number }, end: { x: number; y: number }, name: string): City {
  const result = buildRoadCreation(city, { start, end, category: "normal", subtype: "small", width: 8, name, structure: "ground", geometry: { type: "line" } });
  return { ...city, roadNodes: result.roadNodes, roads: result.roads, roadEdges: result.roadEdges };
}

describe("road name identity groups", () => {
  it("groups every segment of a named road after three crossings", () => {
    let city = add(emptyCity(), { x: 0, y: 100 }, { x: 400, y: 100 }, "人民大道");
    city = add(city, { x: 80, y: 0 }, { x: 80, y: 200 }, "甲路"); city = add(city, { x: 200, y: 0 }, { x: 200, y: 200 }, "乙路"); city = add(city, { x: 320, y: 0 }, { x: 320, y: 200 }, "丙路");
    const mainEdges = city.roadEdges.filter((edge) => edge.name === "人民大道"); expect(mainEdges).toHaveLength(4);
    for (const edge of mainEdges) expect(roadIdentityGroupEdges(city, edge).map((candidate) => candidate.id).sort()).toEqual(mainEdges.map((candidate) => candidate.id).sort());
  });

  it("renames the entire current non-empty name group by default", () => {
    let city = add(emptyCity(), { x: 0, y: 0 }, { x: 100, y: 0 }, "人民大道"); city = add(city, { x: 200, y: 0 }, { x: 300, y: 0 }, "人民大道");
    const editor = new Editor(city); editor.renameRoadEdge(city.roadEdges[0]!.id, "人民东路");
    expect(editor.state.city.roadEdges.map((edge) => edge.name)).toEqual(["人民东路", "人民东路"]); editor.undo(); expect(editor.state.city.roadEdges.every((edge) => edge.name === "人民大道")).toBe(true);
  });

  it("can rename only the selected topology segment", () => {
    let city = add(emptyCity(), { x: 0, y: 0 }, { x: 100, y: 0 }, "人民大道"); city = add(city, { x: 200, y: 0 }, { x: 300, y: 0 }, "人民大道");
    const editor = new Editor(city); editor.renameRoadEdge(city.roadEdges[0]!.id, "人民西路", "segment");
    expect(editor.state.city.roadEdges.map((edge) => edge.name)).toEqual(["人民西路", "人民大道"]);
  });

  it("keeps a T-junction branch out of the main-road name group", () => {
    let city = add(emptyCity(), { x: 0, y: 100 }, { x: 200, y: 100 }, "人民大道"); const mainEdge = city.roadEdges[0]!; const split = splitRoadEdge(city, mainEdge.id, { x: 100, y: 100 });
    city = { ...city, roadNodes: split.roadNodes, roads: split.roads, roadEdges: split.roadEdges }; const junction = split.nodeId;
    const branch = buildRoadCreation(city, { start: { x: 100, y: 100 }, end: { x: 100, y: 200 }, startNodeId: junction, category: "normal", subtype: "small", width: 8, name: "学府路", structure: "ground", geometry: { type: "line" } });
    expect(branch.roadEdges.filter((edge) => edge.name === "人民大道")).toHaveLength(2); expect(branch.roadEdges.filter((edge) => edge.name === "学府路")).toHaveLength(1);
  });

  it("inherits the original name on both sides of an intersection split", () => {
    const city = add(emptyCity(), { x: 0, y: 0 }, { x: 200, y: 0 }, "人民大道"); const split = splitRoadEdge(city, city.roadEdges[0]!.id, { x: 80, y: 0 });
    expect(split.roadEdges).toHaveLength(2); expect(split.roadEdges.every((edge) => edge.name === "人民大道")).toBe(true);
  });

  it("groups disconnected equal names in the UI without changing topology", () => {
    let city = add(emptyCity(), { x: 0, y: 0 }, { x: 100, y: 0 }, "环湖路"); city = add(city, { x: 300, y: 0 }, { x: 400, y: 0 }, "环湖路");
    const group = roadIdentityGroupEdges(city, city.roadEdges[0]!); expect(group).toHaveLength(2); expect(connectedRoadEdgeComponents(group)).toHaveLength(2);
    const firstNodes = new Set(group[0] ? [group[0].startNodeId, group[0].endNodeId] : []); const secondNodes = new Set(group[1] ? [group[1].startNodeId, group[1].endNodeId] : []);
    expect([...firstNodes].some((nodeId) => secondNodes.has(nodeId))).toBe(false);
  });

  it("does not group unnamed edges from different internal roads", () => {
    let city = add(emptyCity(), { x: 0, y: 0 }, { x: 100, y: 0 }, ""); city = add(city, { x: 200, y: 0 }, { x: 300, y: 0 }, "");
    expect(roadIdentityGroupEdges(city, city.roadEdges[0]!)).toHaveLength(1); expect(roadIdentityGroupEdges(city, city.roadEdges[1]!)).toHaveLength(1);
  });

  it("resolves logical and segment selections explicitly", () => {
    let city = add(emptyCity(), { x: 0, y: 0 }, { x: 100, y: 0 }, "环湖路"); city = add(city, { x: 300, y: 0 }, { x: 400, y: 0 }, "环湖路"); const anchor = city.roadEdges[0]!;
    expect(selectedRoadEdges(city, { id: anchor.roadId, edgeId: anchor.id, scope: "logical" })).toHaveLength(2);
    expect(selectedRoadEdges(city, { id: anchor.roadId, edgeId: anchor.id, scope: "segment" })).toEqual([anchor]);
  });
});

describe("connected road components", () => {
  function edge(id: string, startNodeId: string, endNodeId: string): RoadEdge {
    return { id, roadId: "road", name: "Road", startNodeId, endNodeId, structure: "ground", level: 0, geometry: { type: "line" } };
  }

  it("preserves component and edge input order across branches, cycles and self-loops", () => {
    const edges = [edge("a2", "a2", "a3"), edge("b1", "b1", "b2"), edge("a0", "a0", "a1"), edge("loop", "alone", "alone"), edge("a1", "a1", "a2"), edge("b2", "b2", "b1"), edge("branch", "a1", "a4")];
    const before = [...edges]; const components = connectedRoadEdgeComponents(edges);
    expect(components.map((component) => component.map((entry) => entry.id))).toEqual([["a2", "a0", "a1", "branch"], ["b1", "b2"], ["loop"]]);
    expect(components[0]![0]).toBe(edges[0]); expect(edges).toEqual(before);
    expect(connectedRoadEdgeComponents([])).toEqual([]);
  });

  it("retains ID grouping when the input repeats an edge ID", () => {
    const edges = [edge("same", "a", "b"), edge("other", "c", "d"), edge("same", "d", "e"), edge("separate", "f", "g")];
    expect(connectedRoadEdgeComponents(edges)).toEqual([edges.slice(0, 3), [edges[3]]]);
  });

  it("traverses long reversed chains and high-degree junctions with linear endpoint reads", () => {
    let reads = 0;
    const chain = Array.from({ length: 500 }, (_, index) => ({ ...edge(`chain-${index}`, "", ""), get startNodeId() { reads += 1; return `n${index}`; }, get endNodeId() { reads += 1; return `n${index + 1}`; } })).reverse();
    const star = Array.from({ length: 500 }, (_, index) => ({ ...edge(`star-${index}`, "", ""), get startNodeId() { reads += 1; return "hub"; }, get endNodeId() { reads += 1; return `spoke-${index}`; } }));
    const components = connectedRoadEdgeComponents([...chain, ...star]);
    expect(reads).toBeLessThanOrEqual(4 * (chain.length + star.length));
    expect(components).toEqual([chain, star]);
  });
});
