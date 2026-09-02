import { describe, expect, it } from "vitest";
import type { City } from "../model/City";
import { Editor } from "./Editor";
import { buildRoadCreation, splitRoadEdge } from "./RoadGraph";
import { connectedRoadEdgeComponents, roadIdentityGroupEdges } from "./RoadIdentity";

function emptyCity(): City {
  return { id: "identity", name: "Identity", bounds: { x: -200, y: -200, width: 800, height: 800 }, mapSize: "small", terrain: "flat", roadNodes: [], roads: [], roadEdges: [], buildings: [], blocks: [], zones: [], parks: [], waters: [], pois: [], transitLines: [], transitStations: [], labels: [] };
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
});
