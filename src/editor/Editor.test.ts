import { describe, expect, it } from "vitest";
import type { City } from "../model/City";
import { Editor } from "./Editor";
import { buildRoadCreation } from "./RoadGraph";

function city(): City {
  return {
    id: "city", name: "City", bounds: { x: 0, y: 0, width: 1000, height: 1000 }, mapSize: "small", terrain: "flat",
    roadNodes: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 110, y: 80 }, { id: "d", x: 220, y: 80 }],
    roads: [
      { id: "old", category: "normal", subtype: "small", width: 8, name: "Old", segmentIds: ["old-edge"] },
      { id: "new", category: "normal", subtype: "small", width: 8, name: "New", segmentIds: ["new-edge"] },
    ],
    roadEdges: [{ id: "old-edge", roadId: "old", name: "Old", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } }, { id: "new-edge", roadId: "new", name: "New", startNodeId: "c", endNodeId: "d", structure: "ground", level: 0, geometry: { type: "line" } }],
    buildings: [], blocks: [], zones: [], parks: [], waters: [], pois: [], transitLines: [], transitStations: [], labels: [],
  };
}

describe("Editor road endpoint merging", () => {
  it("merges a dragged endpoint into an existing endpoint with undo and redo", () => {
    const editor = new Editor(city());
    editor.moveNode("c", { x: 110, y: 80 }, { x: 100, y: 0 }, "b");
    expect(editor.state.city.roadNodes.some((node) => node.id === "c")).toBe(false);
    expect(editor.state.city.roadEdges.find((edge) => edge.roadId === "new")?.startNodeId).toBe("b");
    editor.undo();
    expect(editor.state.city.roadNodes.find((node) => node.id === "c")).toMatchObject({ x: 110, y: 80 });
    expect(editor.state.city.roadEdges.find((edge) => edge.roadId === "new")?.startNodeId).toBe("c");
    editor.redo();
    expect(editor.state.city.roadNodes.some((node) => node.id === "c")).toBe(false);
    expect(editor.state.city.roadEdges.find((edge) => edge.roadId === "new")?.startNodeId).toBe("b");
  });

  it("moves a whole internal road with one undo while preserving shared topology", () => {
    const shared = city(); shared.roadEdges[0]!.geometry = { type: "bezier", controlPoints: [{ x: 50, y: 30 }] }; shared.roadEdges[1] = { ...shared.roadEdges[1]!, startNodeId: "b" }; shared.roadNodes = shared.roadNodes.filter((node) => node.id !== "c"); const editor = new Editor(shared); const before = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }]; const beforeGeometries = [{ id: "old-edge", geometry: structuredClone(shared.roadEdges[0]!.geometry) }];
    for (const node of editor.state.city.roadNodes) if (node.id === "a" || node.id === "b") { node.x += 40; node.y += 25; }
    const geometry = editor.state.city.roadEdges[0]!.geometry; if (geometry.type === "bezier") { geometry.controlPoints[0]!.x += 40; geometry.controlPoints[0]!.y += 25; }
    editor.select({ kind: "road", id: "old", edgeId: "old-edge" }); editor.moveRoad("old", before, beforeGeometries);
    expect(editor.state.city.roadNodes.find((node) => node.id === "a")).toMatchObject({ x: 40, y: 25 }); expect(editor.state.city.roadNodes.find((node) => node.id === "b")).toMatchObject({ x: 140, y: 25 }); expect(editor.state.city.roadEdges.find((edge) => edge.id === "new-edge")?.startNodeId).toBe("b"); expect(editor.state.city.roadEdges[0]!.geometry).toMatchObject({ controlPoints: [{ x: 90, y: 55 }] });
    editor.undo(); expect(editor.state.city.roadNodes.find((node) => node.id === "b")).toMatchObject({ x: 100, y: 0 }); expect(editor.state.city.roadEdges[0]!.geometry).toMatchObject({ controlPoints: [{ x: 50, y: 30 }] }); editor.redo(); expect(editor.state.city.roadNodes.find((node) => node.id === "b")).toMatchObject({ x: 140, y: 25 });
  });

  it("creates and undoes a closed logical road path as one command", () => {
    const editor = new Editor({ ...city(), roadNodes: [], roads: [], roadEdges: [] });
    editor.createRoadPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }], { category: "normal", subtype: "small", width: 8, name: "Loop", structure: "ground" });
    expect(editor.state.city.roads).toHaveLength(1); expect(editor.state.city.roadEdges).toHaveLength(4);
    editor.undo(); expect(editor.state.city.roads).toHaveLength(0); expect(editor.state.city.roadEdges).toHaveLength(0);
    editor.redo(); expect(editor.state.city.roads[0]?.segmentIds).toHaveLength(4);
  });

  it("keeps a smooth four-bezier loop instead of polygonizing a circle", () => {
    const editor = new Editor({ ...city(), roadNodes: [], roads: [], roadEdges: [] }); const k = 55.228;
    editor.createRoadPath([{ x: 100, y: 0 }, { x: 0, y: 100 }, { x: -100, y: 0 }, { x: 0, y: -100 }, { x: 100, y: 0 }], { category: "normal", subtype: "small", width: 8, name: "Circle", structure: "ground" }, [{ type: "bezier", controlPoints: [{ x: 100, y: k }, { x: k, y: 100 }] }, { type: "bezier", controlPoints: [{ x: -k, y: 100 }, { x: -100, y: k }] }, { type: "bezier", controlPoints: [{ x: -100, y: -k }, { x: -k, y: -100 }] }, { type: "bezier", controlPoints: [{ x: k, y: -100 }, { x: 100, y: -k }] }]);
    expect(editor.state.city.roadEdges).toHaveLength(4); expect(editor.state.city.roadEdges.every((edge) => edge.geometry.type === "bezier")).toBe(true);
  });

  it("adds and safely dissolves a non-junction road node", () => {
    const editor = new Editor({ ...city(), roadNodes: city().roadNodes.slice(0, 2), roads: city().roads.slice(0, 1), roadEdges: city().roadEdges.slice(0, 1) }); const nodeId = editor.splitRoadEdge("old-edge", { x: 50, y: 0 });
    expect(editor.state.city.roadEdges).toHaveLength(2); expect(editor.canDissolveRoadNode(nodeId)).toBe(true); editor.dissolveRoadNode(nodeId);
    expect(editor.state.city.roadEdges).toHaveLength(1); expect(editor.state.city.roadNodes.some((node) => node.id === nodeId)).toBe(false); expect(editor.state.city.roadEdges[0]?.name).toBe("Old");
  });

  it("deletes every edge of the selected logical road", () => {
    const editor = new Editor(city()); editor.select({ kind: "road", id: "old" }); editor.deleteSelected();
    expect(editor.state.city.roads.map((road) => road.id)).toEqual(["new"]); expect(editor.state.city.roadEdges.map((edge) => edge.roadId)).toEqual(["new"]);
    editor.undo(); expect(editor.state.city.roads).toHaveLength(2); expect(editor.state.city.roadEdges).toHaveLength(2);
  });

  it("updates attributes without changing topology segments", () => {
    const editor = new Editor(city()); const segmentIds = [...editor.state.city.roads[0]!.segmentIds];
    editor.updateRoad("old", { name: "Renamed", width: 12, description: "The first road into town" });
    expect(editor.state.city.roads[0]).toMatchObject({ name: "Renamed", width: 12, description: "The first road into town", segmentIds }); expect(editor.state.city.roadEdges[0]?.roadId).toBe("old");
  });

  it("reconciles crossing topology when changing road structure", () => {
    const empty = { ...city(), roadNodes: [], roads: [], roadEdges: [] };
    const horizontal = buildRoadCreation(empty, { start: { x: 0, y: 50 }, end: { x: 100, y: 50 }, category: "normal", subtype: "small", width: 8, name: "Horizontal", structure: "ground", geometry: { type: "line" } });
    const vertical = buildRoadCreation({ ...empty, roadNodes: horizontal.roadNodes, roads: horizontal.roads, roadEdges: horizontal.roadEdges }, { start: { x: 50, y: 0 }, end: { x: 50, y: 100 }, category: "normal", subtype: "small", width: 8, name: "Vertical", structure: "ground", geometry: { type: "line" } });
    const editor = new Editor({ ...empty, roadNodes: vertical.roadNodes, roads: vertical.roads, roadEdges: vertical.roadEdges }); editor.updateRoadStructure(vertical.roadId, "elevated");
    const horizontalNodes = new Set(editor.state.city.roadEdges.filter((edge) => edge.roadId === horizontal.roadId).flatMap((edge) => [edge.startNodeId, edge.endNodeId]));
    const verticalNodes = new Set(editor.state.city.roadEdges.filter((edge) => edge.roadId === vertical.roadId).flatMap((edge) => [edge.startNodeId, edge.endNodeId]));
    expect([...horizontalNodes].some((nodeId) => verticalNodes.has(nodeId))).toBe(false); expect(editor.state.city.roadEdges.filter((edge) => edge.roadId === vertical.roadId).every((edge) => edge.structure === "elevated")).toBe(true);
    editor.undo(); const restoredHorizontal = new Set(editor.state.city.roadEdges.filter((edge) => edge.roadId === horizontal.roadId).flatMap((edge) => [edge.startNodeId, edge.endNodeId])); const restoredVertical = new Set(editor.state.city.roadEdges.filter((edge) => edge.roadId === vertical.roadId).flatMap((edge) => [edge.startNodeId, edge.endNodeId]));
    expect([...restoredHorizontal].filter((nodeId) => restoredVertical.has(nodeId))).toHaveLength(1);
  });

  it("supports the complete zone command lifecycle without binding it to roads", () => {
    const editor = new Editor(city()); const originalRoads = structuredClone(editor.state.city.roadEdges); const id = editor.createZone({ name: "Housing", type: "residential", polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], source: "road-fill", opacity: 0.4, color: "#cfc2a3" })!;
    expect(editor.selection).toEqual({ kind: "zone", id }); editor.updateZone(id, { name: "Campus", type: "education", description: "Students gather under old trees" }); expect(editor.state.city.zones[0]).toMatchObject({ name: "Campus", type: "education", description: "Students gather under old trees", source: "road-fill" });
    const beforeMove = structuredClone(editor.state.city.zones[0]!.polygon); editor.state.city.zones[0]!.polygon.forEach((point) => { point.x += 20; point.y += 10; }); editor.moveZone(id, beforeMove); expect(editor.state.city.zones[0]!.polygon[0]).toEqual({ x: 20, y: 10 }); editor.undo(); expect(editor.state.city.zones[0]!.polygon[0]).toEqual({ x: 0, y: 0 }); editor.redo();
    editor.addZoneVertex(id, 0, { x: 50, y: 10 }); expect(editor.state.city.zones[0]!.polygon).toHaveLength(5); editor.deleteZoneVertex(id, 1); expect(editor.state.city.zones[0]!.polygon).toHaveLength(4); editor.deleteSelected(); expect(editor.state.city.zones).toHaveLength(0); editor.undo(); expect(editor.state.city.zones).toHaveLength(1); expect(editor.state.city.roadEdges).toEqual(originalRoads);
  });

  it("supports the polygon building command lifecycle with undo", () => { const editor = new Editor(city()); const id = editor.createBuilding({ footprint: { outer: [{ x: 30, y: 40 }, { x: 50, y: 40 }, { x: 50, y: 55 }, { x: 30, y: 55 }], holes: [] }, type: "government", subtype: "City Hall", floors: 3, height: 12, style: "classical", name: "Hall" })!; editor.updateBuilding(id, { description: "The clock rings at noon" }); expect(editor.state.city.buildings[0]?.description).toBe("The clock rings at noon"); editor.addBuildingVertex(id, 0, 0, { x: 40, y: 40 }); expect(editor.state.city.buildings[0]?.footprint.outer).toHaveLength(5); editor.deleteBuildingVertex(id, 0, 1); expect(editor.state.city.buildings[0]?.footprint.outer).toHaveLength(4); const duplicate = editor.duplicateBuilding(id)!; expect(editor.state.city.buildings).toHaveLength(2); editor.rotateBuilding(duplicate, Math.PI / 4); editor.scaleBuilding(duplicate, 1.2); editor.mirrorBuilding(duplicate); editor.deleteSelected(); expect(editor.state.city.buildings).toHaveLength(1); editor.undo(); expect(editor.state.city.buildings).toHaveLength(2); });
});
