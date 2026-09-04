import { describe, expect, it } from "vitest";
import { createEmptyUniversityProfile, type City } from "../model/City";
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
    buildings: [], blocks: [], zones: [], parks: [], waters: [], pois: [], facilities: [], universities: [], transitLines: [], transitStations: [], busTerminals: [], busLines: [], busStops: [], labels: [],
  };
}

function loopCity(): City {
  const result = city();
  result.roadNodes = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 100, y: 100 }, { id: "d", x: 0, y: 100 }];
  result.roads = [{ id: "loop-road", category: "normal", subtype: "small", width: 8, name: "Loop Road", segmentIds: ["ab", "bc", "cd", "da"] }];
  result.roadEdges = [
    { id: "ab", roadId: "loop-road", name: "Loop Road", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } },
    { id: "bc", roadId: "loop-road", name: "Loop Road", startNodeId: "b", endNodeId: "c", structure: "ground", level: 0, geometry: { type: "line" } },
    { id: "cd", roadId: "loop-road", name: "Loop Road", startNodeId: "c", endNodeId: "d", structure: "ground", level: 0, geometry: { type: "line" } },
    { id: "da", roadId: "loop-road", name: "Loop Road", startNodeId: "d", endNodeId: "a", structure: "ground", level: 0, geometry: { type: "line" } },
  ];
  return result;
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

  it("isolates segment style changes while retaining logical road identity", () => {
    const data = city(); data.roadNodes.push({ id: "e", x: 200, y: 0 }); data.roads[0]!.segmentIds.push("old-east"); data.roadEdges.push({ id: "old-east", roadId: "old", name: "Old", startNodeId: "b", endNodeId: "e", structure: "ground", level: 0, geometry: { type: "line" } }); const editor = new Editor(data);
    editor.updateRoadSelectionStyle("old-edge", "segment", { width: 18, subtype: "medium" }); const west = editor.state.city.roadEdges.find((edge) => edge.id === "old-edge")!; const east = editor.state.city.roadEdges.find((edge) => edge.id === "old-east")!;
    expect(west.roadId).not.toBe(east.roadId); expect(editor.state.city.roads.find((road) => road.id === west.roadId)).toMatchObject({ width: 18, subtype: "medium", name: "Old" }); expect(west.name).toBe(east.name);
    editor.undo(); expect(editor.state.city.roadEdges.find((edge) => edge.id === "old-edge")?.roadId).toBe("old"); expect(editor.state.city.roads.find((road) => road.id === "old")?.segmentIds).toEqual(["old-edge", "old-east"]);
  });

  it("partitions both sides when styling a middle segment", () => {
    const data = city(); data.roadNodes = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 200, y: 0 }, { id: "d", x: 300, y: 0 }]; data.roads = [{ id: "main", category: "normal", subtype: "small", width: 8, name: "Main", segmentIds: ["ab", "bc", "cd"] }]; data.roadEdges = [{ id: "ab", roadId: "main", name: "Main", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } }, { id: "bc", roadId: "main", name: "Main", startNodeId: "b", endNodeId: "c", structure: "ground", level: 0, geometry: { type: "line" } }, { id: "cd", roadId: "main", name: "Main", startNodeId: "c", endNodeId: "d", structure: "ground", level: 0, geometry: { type: "line" } }]; const editor = new Editor(data);
    editor.updateRoadSelectionStyle("bc", "segment", { width: 16 }); const edgeRoadIds = editor.state.city.roadEdges.map((edge) => edge.roadId); expect(new Set(edgeRoadIds).size).toBe(3); expect(editor.state.city.roads.find((road) => road.id === editor.state.city.roadEdges.find((edge) => edge.id === "bc")?.roadId)?.width).toBe(16); expect(editor.state.city.roadEdges.every((edge) => edge.name === "Main")).toBe(true);
  });

  it("deletes only a segment selection and protects terminal nodes", () => {
    const data = city(); data.roads[1]!.name = "Old"; data.roadEdges[1]!.name = "Old"; const editor = new Editor(data); editor.select({ kind: "road", id: "old", edgeId: "old-edge", scope: "segment" }); editor.deleteSelected();
    expect(editor.state.city.roadEdges.map((edge) => edge.id)).toEqual(["new-edge"]); editor.undo(); editor.select({ kind: "node", id: "a" }); editor.deleteSelected(); expect(editor.state.city.roadEdges).toHaveLength(2); expect(editor.state.city.roadNodes.some((node) => node.id === "a")).toBe(true);
  });

  it("toggles road segments and nodes into one additive selection", () => {
    const editor = new Editor(city()); editor.select({ kind: "road", id: "old", edgeId: "old-edge", scope: "segment" }); editor.toggleRoadElements(["new-edge"]); expect(editor.selection).toEqual({ kind: "road-multi", edgeIds: ["old-edge", "new-edge"], nodeIds: [] }); editor.toggleRoadElements([], ["b"]); expect(editor.selection).toEqual({ kind: "road-multi", edgeIds: ["old-edge", "new-edge"], nodeIds: ["b"] }); editor.toggleRoadElements(["old-edge"]); expect(editor.selection).toEqual({ kind: "road-multi", edgeIds: ["new-edge"], nodeIds: ["b"] });
  });

  it("updates names and styles for multiple selected segments atomically", () => {
    const editor = new Editor(city()); editor.commands.clear(); editor.select({ kind: "road-multi", edgeIds: ["old-edge", "new-edge"], nodeIds: [] }); editor.renameRoadEdges(["old-edge", "new-edge"], "Unified"); expect(editor.state.city.roadEdges.map((edge) => edge.name)).toEqual(["Unified", "Unified"]); editor.undo(); expect(editor.state.city.roadEdges.map((edge) => edge.name)).toEqual(["Old", "New"]); editor.redo();
    editor.updateRoadEdgesStyle(["old-edge", "new-edge"], { width: 16, subtype: "medium" }); expect(editor.state.city.roads.every((road) => road.width === 16 && road.subtype === "medium")).toBe(true); editor.undo(); expect(editor.state.city.roads.map((road) => road.width)).toEqual([8, 8]);
  });

  it("updates structure for multiple selected segments with one undo", () => {
    const editor = new Editor(city()); editor.commands.clear(); editor.select({ kind: "road-multi", edgeIds: ["old-edge", "new-edge"], nodeIds: [] }); editor.updateRoadEdgesStructure(["old-edge", "new-edge"], "elevated"); expect(editor.state.city.roadEdges.every((edge) => edge.structure === "elevated" && edge.level === 1)).toBe(true); expect(editor.selection?.kind).toBe("road-multi"); editor.undo(); expect(editor.state.city.roadEdges.every((edge) => edge.structure === "ground" && edge.level === 0)).toBe(true);
  });

  it("keeps every replacement selected when intersecting segments become ground", () => {
    const empty = { ...city(), roadNodes: [], roads: [], roadEdges: [] }; const horizontal = buildRoadCreation(empty, { start: { x: 0, y: 50 }, end: { x: 100, y: 50 }, category: "normal", subtype: "small", width: 8, name: "Horizontal", structure: "elevated", geometry: { type: "line" } }); const vertical = buildRoadCreation({ ...empty, roadNodes: horizontal.roadNodes, roads: horizontal.roads, roadEdges: horizontal.roadEdges }, { start: { x: 50, y: 0 }, end: { x: 50, y: 100 }, category: "normal", subtype: "small", width: 8, name: "Vertical", structure: "elevated", geometry: { type: "line" } }); const editor = new Editor({ ...empty, roadNodes: vertical.roadNodes, roads: vertical.roads, roadEdges: vertical.roadEdges }); const originalIds = editor.state.city.roadEdges.map((edge) => edge.id); editor.select({ kind: "road-multi", edgeIds: originalIds, nodeIds: [] }); editor.updateRoadEdgesStructure(originalIds, "ground");
    expect(editor.state.city.roadEdges).toHaveLength(4); expect(editor.selection?.kind).toBe("road-multi"); if (editor.selection?.kind === "road-multi") { expect(editor.selection.edgeIds).toHaveLength(4); expect(editor.selection.edgeIds.every((id) => editor.state.city.roadEdges.some((edge) => edge.id === id))).toBe(true); }
    editor.undo(); expect(editor.selection).toEqual({ kind: "road-multi", edgeIds: originalIds, nodeIds: [] }); editor.redo(); expect(editor.selection?.kind).toBe("road-multi"); if (editor.selection?.kind === "road-multi") expect(editor.selection.edgeIds).toHaveLength(4);
  });

  it("restores a mixed ground selection across structure undo and redo", () => {
    const data = city(); data.roadEdges.find((edge) => edge.id === "new-edge")!.structure = "elevated"; data.roadEdges.find((edge) => edge.id === "new-edge")!.level = 1; const editor = new Editor(data); const originalIds = ["old-edge", "new-edge"]; editor.select({ kind: "road-multi", edgeIds: originalIds, nodeIds: [] }); editor.updateRoadEdgesStructure(originalIds, "ground"); expect(editor.selection?.kind).toBe("road-multi"); editor.undo(); expect(editor.selection).toEqual({ kind: "road-multi", edgeIds: originalIds, nodeIds: [] }); editor.redo(); expect(editor.selection?.kind).toBe("road-multi"); if (editor.selection?.kind === "road-multi") expect(editor.selection.edgeIds).toHaveLength(2);
  });

  it("merges colocated endpoints when selected segments move to the same level", () => {
    const data = city(); data.roadNodes.find((node) => node.id === "c")!.x = 100; data.roadNodes.find((node) => node.id === "c")!.y = 0; const editor = new Editor(data); editor.updateRoadEdgesStructure(["old-edge", "new-edge"], "elevated"); const edges = editor.state.city.roadEdges; expect(edges.find((edge) => edge.id === "old-edge")?.endNodeId).toBe(edges.find((edge) => edge.id === "new-edge")?.startNodeId);
  });

  it("edits one segment geometry and control point with undo and redo", () => {
    const editor = new Editor(city()); editor.updateRoadEdgeGeometry("old-edge", "curve"); const edge = editor.state.city.roadEdges.find((candidate) => candidate.id === "old-edge")!; expect(edge.geometry.type).toBe("bezier"); const before = structuredClone(edge.geometry); if (edge.geometry.type === "bezier") edge.geometry.controlPoints[0] = { x: 50, y: 35 }; editor.select({ kind: "road-control", id: "old-edge", pointIndex: 0 }); editor.moveRoadControlPoint("old-edge", before);
    expect(editor.state.city.roadEdges[0]?.geometry).toMatchObject({ controlPoints: [{ x: 50, y: 35 }] }); editor.undo(); expect(editor.state.city.roadEdges[0]?.geometry).toEqual(before); editor.redo(); expect(editor.state.city.roadEdges[0]?.geometry).toMatchObject({ controlPoints: [{ x: 50, y: 35 }] });
  });

  it("disconnects a changed-structure segment from an incompatible junction", () => {
    const data = city(); data.roadEdges[1] = { ...data.roadEdges[1]!, startNodeId: "b" }; data.roadNodes = data.roadNodes.filter((node) => node.id !== "c"); const editor = new Editor(data); editor.updateRoadEdgeStructure("old-edge", "segment", "elevated"); const oldEdge = editor.state.city.roadEdges.find((edge) => edge.id === "old-edge")!; const newEdge = editor.state.city.roadEdges.find((edge) => edge.id === "new-edge")!;
    expect(oldEdge.endNodeId).not.toBe(newEdge.startNodeId); expect(oldEdge).toMatchObject({ structure: "elevated", level: 1 }); editor.undo(); expect(editor.state.city.roadEdges.find((edge) => edge.id === "old-edge")?.endNodeId).toBe("b");
  });

  it("does not allow road nodes on different structure levels to merge", () => {
    const data = city(); data.roadEdges[1]!.structure = "elevated"; data.roadEdges[1]!.level = 1; const editor = new Editor(data); expect(editor.canMergeRoadNodes("a", "b")).toBe(true); expect(editor.canMergeRoadNodes("a", "c")).toBe(false);
  });

  it("partitions a road when one middle segment changes structure", () => {
    const data = city(); data.roadNodes = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 200, y: 0 }, { id: "d", x: 300, y: 0 }]; data.roads = [{ id: "main", category: "normal", subtype: "small", width: 8, name: "Main", segmentIds: ["ab", "bc", "cd"] }]; data.roadEdges = [{ id: "ab", roadId: "main", name: "Main", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } }, { id: "bc", roadId: "main", name: "Main", startNodeId: "b", endNodeId: "c", structure: "ground", level: 0, geometry: { type: "line" } }, { id: "cd", roadId: "main", name: "Main", startNodeId: "c", endNodeId: "d", structure: "ground", level: 0, geometry: { type: "line" } }]; const editor = new Editor(data); editor.updateRoadEdgeStructure("bc", "segment", "elevated");
    expect(new Set(editor.state.city.roadEdges.map((edge) => edge.roadId)).size).toBe(3); expect(editor.state.city.roadEdges.find((edge) => edge.id === "bc")).toMatchObject({ name: "Main", structure: "elevated", level: 1 });
  });

  it("creates ground topology when lowering a segment across a ground road", () => {
    const empty = { ...city(), roadNodes: [], roads: [], roadEdges: [] }; const horizontal = buildRoadCreation(empty, { start: { x: 0, y: 50 }, end: { x: 100, y: 50 }, category: "normal", subtype: "small", width: 8, name: "Horizontal", structure: "ground", geometry: { type: "line" } }); const vertical = buildRoadCreation({ ...empty, roadNodes: horizontal.roadNodes, roads: horizontal.roads, roadEdges: horizontal.roadEdges }, { start: { x: 50, y: 0 }, end: { x: 50, y: 100 }, category: "normal", subtype: "small", width: 8, name: "Vertical", structure: "elevated", geometry: { type: "line" } }); const editor = new Editor({ ...empty, roadNodes: vertical.roadNodes, roads: vertical.roads, roadEdges: vertical.roadEdges }); const verticalEdge = editor.state.city.roadEdges.find((edge) => edge.roadId === vertical.roadId)!;
    editor.updateRoadEdgeStructure(verticalEdge.id, "segment", "ground"); const horizontalNodes = new Set(editor.state.city.roadEdges.filter((edge) => edge.name === "Horizontal").flatMap((edge) => [edge.startNodeId, edge.endNodeId])); const verticalNodes = new Set(editor.state.city.roadEdges.filter((edge) => edge.name === "Vertical").flatMap((edge) => [edge.startNodeId, edge.endNodeId])); expect([...horizontalNodes].filter((id) => verticalNodes.has(id))).toHaveLength(1); expect(editor.state.city.roadEdges.filter((edge) => edge.name === "Vertical").every((edge) => edge.structure === "ground")).toBe(true);
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
    expect(editor.selection).toEqual({ kind: "zone", id }); editor.updateZone(id, { name: "Campus", type: "education", description: "Students gather under old trees", purpose: "university", university: { ...createEmptyUniversityProfile(), englishName: "City University", foundedYear: 1952 } }); expect(editor.state.city.zones[0]).toMatchObject({ name: "Campus", type: "education", description: "Students gather under old trees", source: "road-fill", purpose: "university", university: { englishName: "City University", foundedYear: 1952 } });
    const beforeMove = structuredClone(editor.state.city.zones[0]!.polygon); editor.state.city.zones[0]!.polygon.forEach((point) => { point.x += 20; point.y += 10; }); editor.moveZone(id, beforeMove); expect(editor.state.city.zones[0]!.polygon[0]).toEqual({ x: 20, y: 10 }); editor.undo(); expect(editor.state.city.zones[0]!.polygon[0]).toEqual({ x: 0, y: 0 }); editor.redo();
    editor.addZoneVertex(id, 0, { x: 50, y: 10 }); expect(editor.state.city.zones[0]!.polygon).toHaveLength(5); editor.deleteZoneVertex(id, 1); expect(editor.state.city.zones[0]!.polygon).toHaveLength(4); editor.deleteSelected(); expect(editor.state.city.zones).toHaveLength(0); editor.undo(); expect(editor.state.city.zones).toHaveLength(1); expect(editor.state.city.roadEdges).toEqual(originalRoads);
  });

  it("creates, renames and reshapes water with undo and redo", () => {
    const editor = new Editor(city()); const id = editor.createWater({ name: "Lake One", points: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 70 }, { x: 10, y: 70 }] })!;
    expect(editor.selection).toEqual({ kind: "water", id }); editor.updateWater(id, { name: "Mirror Lake" }); expect(editor.state.city.waters[0]?.name).toBe("Mirror Lake");
    const before = structuredClone(editor.state.city.waters[0]!.points); editor.state.city.waters[0]!.points[0] = { x: 20, y: 20 }; editor.moveWaterVertex(id, before); expect(editor.state.city.waters[0]!.points[0]).toEqual({ x: 20, y: 20 });
    editor.undo(); expect(editor.state.city.waters[0]!.points[0]).toEqual({ x: 10, y: 10 }); editor.redo(); expect(editor.state.city.waters[0]!.points[0]).toEqual({ x: 20, y: 20 }); editor.deleteSelected(); expect(editor.state.city.waters).toEqual([]); editor.undo(); expect(editor.state.city.waters[0]?.name).toBe("Mirror Lake");
  });

  it("supports the polygon building command lifecycle with undo", () => { const editor = new Editor(city()); const id = editor.createBuilding({ footprint: { outer: [{ x: 30, y: 40 }, { x: 50, y: 40 }, { x: 50, y: 55 }, { x: 30, y: 55 }], holes: [] }, type: "government", subtype: "City Hall", floors: 3, height: 12, style: "classical", name: "Hall" })!; editor.updateBuilding(id, { description: "The clock rings at noon" }); expect(editor.state.city.buildings[0]?.description).toBe("The clock rings at noon"); editor.addBuildingVertex(id, 0, 0, { x: 40, y: 40 }); expect(editor.state.city.buildings[0]?.footprint.outer).toHaveLength(5); editor.deleteBuildingVertex(id, 0, 1); expect(editor.state.city.buildings[0]?.footprint.outer).toHaveLength(4); const duplicate = editor.duplicateBuilding(id)!; expect(editor.state.city.buildings).toHaveLength(2); editor.rotateBuilding(duplicate, Math.PI / 4); editor.scaleBuilding(duplicate, 1.2); editor.mirrorBuilding(duplicate); editor.deleteSelected(); expect(editor.state.city.buildings).toHaveLength(1); editor.undo(); expect(editor.state.city.buildings).toHaveLength(2); });

  it("creates a block grid and undoes its roads as one command", () => {
    const editor = new Editor({ ...city(), roadNodes: [], roads: [], roadEdges: [] });
    const ids = editor.createBlockGrid({ first: { x: 100, y: 100 }, opposite: { x: 500, y: 400 }, rows: 2, columns: 3, roadSubtype: "small" });
    expect(ids).toHaveLength(6); expect(editor.state.city.blocks).toHaveLength(6); expect(editor.state.city.roads).toHaveLength(7); expect(editor.state.city.roads.every((road) => road.subtype === "small")).toBe(true);
    editor.undo(); expect(editor.state.city.blocks).toHaveLength(0); expect(editor.state.city.roads).toHaveLength(0); expect(editor.state.city.roadNodes).toHaveLength(0);
    editor.redo(); expect(editor.state.city.blocks).toHaveLength(6); expect(editor.state.city.roads).toHaveLength(7);
  });

  it("supports facility create, move, rename and delete with undo and redo", () => {
    const editor = new Editor(city()); const id = editor.createFacility({ type: "coffee-shop", name: "Coffee Shop", position: { x: 20, y: 30 }, icon: "coffee-shop.svg", color: "#2d9f9b" });
    expect(editor.selection).toEqual({ kind: "facility", id }); editor.updateFacility(id, { name: "Manner Coffee", color: "#b84a62" }); expect(editor.state.city.facilities[0]).toMatchObject({ type: "coffee-shop", name: "Manner Coffee", icon: "coffee-shop.svg", color: "#b84a62" });
    editor.state.city.facilities[0]!.position = { x: 80, y: 90 }; editor.moveFacility(id, { x: 20, y: 30 }); expect(editor.state.city.facilities[0]!.position).toEqual({ x: 80, y: 90 }); editor.undo(); expect(editor.state.city.facilities[0]!.position).toEqual({ x: 20, y: 30 }); editor.redo();
    editor.deleteSelected(); expect(editor.state.city.facilities).toHaveLength(0); editor.undo(); expect(editor.state.city.facilities[0]?.name).toBe("Manner Coffee"); editor.undo(); expect(editor.state.city.facilities[0]?.position).toEqual({ x: 20, y: 30 }); editor.undo(); expect(editor.state.city.facilities[0]).toMatchObject({ name: "Coffee Shop", color: "#2d9f9b" }); editor.undo(); expect(editor.state.city.facilities).toHaveLength(0); editor.redo(); expect(editor.state.city.facilities[0]?.type).toBe("coffee-shop");
  });

  it("restores university facility ownership when a move is undone", () => {
    const editor = new Editor(city()); const id = editor.createFacility({ type: "college", name: "College", position: { x: 20, y: 30 }, icon: "college.svg", color: "#668fa3", universityZoneId: "west-campus" });
    editor.state.city.facilities[0]!.position = { x: 80, y: 90 }; editor.state.city.facilities[0]!.universityZoneId = "east-campus"; editor.moveFacility(id, { x: 20, y: 30 }, "west-campus"); editor.undo();
    expect(editor.state.city.facilities[0]).toMatchObject({ position: { x: 20, y: 30 }, universityZoneId: "west-campus" });
  });

  it("renames the city with undo and redo", () => {
    const editor = new Editor(city());
    editor.renameCity("  New Riverside  ");
    expect(editor.state.city.name).toBe("New Riverside");
    editor.undo(); expect(editor.state.city.name).toBe("City");
    editor.redo(); expect(editor.state.city.name).toBe("New Riverside");
    editor.renameCity("   "); expect(editor.state.city.name).toBe("New Riverside");
  });

  it("switches an active finite map to an unlimited canvas without moving content", () => {
    const editor = new Editor(city()); const originalBounds = structuredClone(editor.state.city.bounds); const originalRoadNodes = structuredClone(editor.state.city.roadNodes);
    expect(editor.enableUnlimitedCanvas()).toBe(true); expect(editor.state.city.mapSize).toBe("unlimited"); expect(editor.state.city.bounds.width).toBe(1_000_000); expect(editor.state.city.bounds.x + editor.state.city.bounds.width / 2).toBe(originalBounds.x + originalBounds.width / 2); expect(editor.state.city.roadNodes).toEqual(originalRoadNodes);
    expect(editor.enableUnlimitedCanvas()).toBe(false); editor.undo(); expect(editor.state.city.mapSize).toBe("small"); expect(editor.state.city.bounds).toEqual(originalBounds); expect(editor.state.city.roadNodes).toEqual(originalRoadNodes); editor.redo(); expect(editor.state.city.mapSize).toBe("unlimited");
  });

  it("creates, moves, renames and deletes bus terminals with undo and redo", () => {
    const editor = new Editor(city()); const id = editor.createBusTerminal({ name: "West Terminal", position: { x: 10, y: 20 } }); expect(editor.selection).toEqual({ kind: "bus-terminal", id });
    editor.state.city.busTerminals![0]!.position = { x: 40, y: 60 }; editor.moveBusTerminal(id, { x: 10, y: 20 }); editor.updateBusTerminal(id, { name: "West Exchange" }); expect(editor.state.city.busTerminals![0]).toMatchObject({ name: "West Exchange", position: { x: 40, y: 60 } });
    editor.deleteSelected(); expect(editor.state.city.busTerminals).toEqual([]); editor.undo(); expect(editor.state.city.busTerminals![0]?.name).toBe("West Exchange"); editor.undo(); expect(editor.state.city.busTerminals![0]?.name).toBe("West Terminal"); editor.undo(); expect(editor.state.city.busTerminals![0]?.position).toEqual({ x: 10, y: 20 }); editor.redo(); expect(editor.state.city.busTerminals![0]?.position).toEqual({ x: 40, y: 60 });
  });

  it("updates bus lines and stops atomically while pruning stops outside a changed path", () => {
    const editor = new Editor(city()); editor.state.city.roadEdges.find((edge) => edge.id === "new-edge")!.startNodeId = "b"; const west = editor.createBusTerminal({ name: "West", position: { x: 0, y: 0 } }); const east = editor.createBusTerminal({ name: "East", position: { x: 220, y: 80 } }); const north = editor.createBusTerminal({ name: "North", position: { x: 100, y: 0 } });
    const lineId = editor.createBusLine({ name: "B1", color: "#3366cc", startTerminalId: west, endTerminalId: east, path: [{ roadEdgeId: "old-edge", forward: true }, { roadEdgeId: "new-edge", forward: true }], direction: "start-to-end" })!; editor.updateBusLine(lineId, { name: "B1 Crosstown", color: "#cc3333" }); expect(editor.state.city.busLines![0]).toMatchObject({ name: "B1 Crosstown", color: "#cc3333" });
    const keptStop = editor.createBusStop({ name: "Market", lineId, roadEdgeId: "old-edge", fraction: 0.25, position: { x: 25, y: 0 }, side: "left" })!; const prunedStop = editor.createBusStop({ name: "Park", lineId, roadEdgeId: "new-edge", fraction: 0.5, position: { x: 165, y: 80 }, side: "right" })!;
    editor.updateBusStop(keptStop, { name: "Central Market", fraction: 0.3, side: "right" }); const beforeMove = { roadEdgeId: "old-edge", fraction: 0.3, position: { x: 25, y: 0 }, side: "right" as const }; const stop = editor.state.city.busStops!.find((candidate) => candidate.id === keptStop)!; stop.fraction = 0.4; stop.position = { x: 40, y: 0 }; editor.moveBusStop(keptStop, beforeMove); expect(stop).toMatchObject({ name: "Central Market", fraction: 0.4, position: { x: 40, y: 0 }, side: "right" });
    editor.select({ kind: "bus-stop", id: prunedStop }); editor.updateBusLinePath(lineId, [{ roadEdgeId: "old-edge", forward: true }], north); expect(editor.state.city.busLines![0]).toMatchObject({ endTerminalId: north, path: [{ roadEdgeId: "old-edge", forward: true }], stopIds: [keptStop] }); expect(editor.state.city.busStops!.map((candidate) => candidate.id)).toEqual([keptStop]); expect(editor.selection).toBeNull();
    editor.undo(); expect(editor.state.city.busLines![0]).toMatchObject({ endTerminalId: east, stopIds: [keptStop, prunedStop] }); expect(editor.state.city.busStops!.map((candidate) => candidate.id)).toEqual([keptStop, prunedStop]); editor.redo(); expect(editor.state.city.busStops).toHaveLength(1);
  });

  it("maintains stop ids and cascades bus line and terminal deletion", () => {
    const editor = new Editor(city()); const start = editor.createBusTerminal({ name: "Start", position: { x: 0, y: 0 } }); const end = editor.createBusTerminal({ name: "End", position: { x: 100, y: 0 } }); const lineId = editor.createBusLine({ name: "B2", color: "#228855", startTerminalId: start, endTerminalId: end, path: [{ roadEdgeId: "old-edge", forward: true }], direction: "start-to-end" })!; const stopId = editor.createBusStop({ name: "First", lineId, roadEdgeId: "old-edge", fraction: 0.5, position: { x: 50, y: 0 }, side: "left" })!;
    editor.deleteSelected(); expect(editor.state.city.busStops).toEqual([]); expect(editor.state.city.busLines![0]?.stopIds).toEqual([]); editor.undo(); expect(editor.state.city.busLines![0]?.stopIds).toEqual([stopId]); editor.redo(); editor.undo();
    editor.select({ kind: "bus-line", id: lineId }); editor.deleteSelected(); expect(editor.state.city.busLines).toEqual([]); expect(editor.state.city.busStops).toEqual([]); editor.undo(); expect(editor.state.city.busLines).toHaveLength(1); expect(editor.state.city.busStops).toHaveLength(1);
    editor.select({ kind: "bus-terminal", id: start }); editor.deleteSelected(); expect(editor.state.city.busTerminals!.map((terminal) => terminal.id)).toEqual([end]); expect(editor.state.city.busLines).toEqual([]); expect(editor.state.city.busStops).toEqual([]); editor.undo(); expect(editor.state.city.busTerminals).toHaveLength(2); expect(editor.state.city.busLines).toHaveLength(1); expect(editor.state.city.busStops).toHaveLength(1); editor.redo(); expect(editor.state.city.busLines).toEqual([]);
  });

  it("rejects missing bus references and skips no-op history entries", () => {
    const editor = new Editor(city()); expect(editor.createBusLine({ name: "Invalid", color: "#000000", startTerminalId: "missing", endTerminalId: "missing", path: [], direction: "start-to-end" })).toBeUndefined(); expect(editor.createBusStop({ name: "Invalid", lineId: "missing", roadEdgeId: "missing", fraction: 0.5, position: { x: 0, y: 0 }, side: "left" })).toBeUndefined(); expect(editor.commands.canUndo).toBe(false);
    const id = editor.createBusTerminal({ name: "Terminal", position: { x: 10, y: 20 } }); const start = editor.createBusTerminal({ name: "Start", position: { x: 0, y: 0 } }); const end = editor.createBusTerminal({ name: "End", position: { x: 220, y: 80 } }); editor.commands.clear(); expect(editor.createBusLine({ name: "Disconnected", color: "#000000", startTerminalId: start, endTerminalId: end, path: [{ roadEdgeId: "old-edge", forward: true }, { roadEdgeId: "new-edge", forward: true }], direction: "start-to-end" })).toBeUndefined(); editor.updateBusTerminal(id, { name: "Terminal" }); editor.moveBusTerminal(id, { x: 10, y: 20 }); expect(editor.commands.canUndo).toBe(false);
  });

  it("orders stops by directed route position rather than creation time", () => {
    const editor = new Editor(city()); const start = editor.createBusTerminal({ name: "Start", position: { x: 0, y: 0 } }); const end = editor.createBusTerminal({ name: "End", position: { x: 100, y: 0 } }); const lineId = editor.createBusLine({ name: "B5", color: "#4488aa", startTerminalId: start, endTerminalId: end, path: [{ roadEdgeId: "old-edge", forward: true }], direction: "start-to-end" })!; const late = editor.createBusStop({ name: "Late", lineId, roadEdgeId: "old-edge", fraction: 0.8, position: { x: 80, y: 0 }, side: "left" })!; const early = editor.createBusStop({ name: "Early", lineId, roadEdgeId: "old-edge", fraction: 0.2, position: { x: 20, y: 0 }, side: "right" })!;
    expect(editor.state.city.busLines[0]?.stopIds).toEqual([early, late]); editor.updateBusStop(late, { fraction: 0.1 }); expect(editor.state.city.busLines[0]?.stopIds).toEqual([late, early]);
  });

  it("migrates bus paths and stops when a referenced road edge is split", () => {
    const editor = new Editor(city()); const start = editor.createBusTerminal({ name: "Start", position: { x: 0, y: 0 } }); const end = editor.createBusTerminal({ name: "End", position: { x: 100, y: 0 } }); const lineId = editor.createBusLine({ name: "B3", color: "#2266aa", startTerminalId: start, endTerminalId: end, path: [{ roadEdgeId: "old-edge", forward: true }], direction: "start-to-end" })!; const stopId = editor.createBusStop({ name: "Middle", lineId, roadEdgeId: "old-edge", fraction: 0.5, position: { x: 50, y: 0 }, side: "left" })!;
    editor.commands.clear(); editor.splitRoadEdge("old-edge", { x: 40, y: 0 }); const line = editor.state.city.busLines[0]!; const stop = editor.state.city.busStops[0]!; expect(line.path).toHaveLength(2); expect(line.path.every((step) => editor.state.city.roadEdges.some((edge) => edge.id === step.roadEdgeId))).toBe(true); expect(line.stopIds).toEqual([stopId]); expect(line.path.some((step) => step.roadEdgeId === stop.roadEdgeId)).toBe(true); expect(stop.position.x).toBeCloseTo(50);
    editor.undo(); expect(editor.state.city.busLines[0]?.path).toEqual([{ roadEdgeId: "old-edge", forward: true }]); expect(editor.state.city.busStops[0]).toMatchObject({ id: stopId, roadEdgeId: "old-edge", fraction: 0.5 }); editor.redo(); expect(editor.state.city.busLines[0]?.path).toHaveLength(2);
  });

  it("prunes invalid bus path steps and restores them with road deletion undo", () => {
    const editor = new Editor(city()); const start = editor.createBusTerminal({ name: "Start", position: { x: 0, y: 0 } }); const end = editor.createBusTerminal({ name: "End", position: { x: 100, y: 0 } }); const lineId = editor.createBusLine({ name: "B4", color: "#aa6622", startTerminalId: start, endTerminalId: end, path: [{ roadEdgeId: "old-edge", forward: true }], direction: "start-to-end" })!; editor.createBusStop({ name: "Middle", lineId, roadEdgeId: "old-edge", fraction: 0.5, position: { x: 50, y: 0 }, side: "right" });
    editor.commands.clear(); editor.select({ kind: "road", id: "old", edgeId: "old-edge" }); editor.deleteSelected(); expect(editor.state.city.busLines).toEqual([]); expect(editor.state.city.busStops).toEqual([]);
    editor.undo(); expect(editor.state.city.busLines[0]?.path).toEqual([{ roadEdgeId: "old-edge", forward: true }]); expect(editor.state.city.busStops).toHaveLength(1);
  });

  it("creates a terminal-free bus loop and its ordered stops as one undoable command", () => {
    const editor = new Editor(loopCity()); const path = ["ab", "bc", "cd", "da"].map((roadEdgeId) => ({ roadEdgeId, forward: true }));
    const id = editor.createBusLoop({ name: "Circle", color: "#7b4fc9", path, stops: [
      { name: "South", roadEdgeId: "ab", fraction: 0.25, position: { x: 25, y: 0 }, side: "right" },
      { name: "North", roadEdgeId: "cd", fraction: 0.75, position: { x: 25, y: 100 }, side: "left" },
    ] })!;
    expect(editor.selection).toEqual({ kind: "bus-line", id });
    expect(editor.state.city.busLines[0]).toMatchObject({ id, name: "Circle", color: "#7b4fc9", loop: true, direction: "start-to-end" });
    expect(editor.state.city.busLines[0]).not.toHaveProperty("startTerminalId"); expect(editor.state.city.busLines[0]).not.toHaveProperty("endTerminalId");
    expect(editor.state.city.busLines[0]?.stopIds).toEqual(editor.state.city.busStops.map((stop) => stop.id)); expect(editor.state.city.busStops.map((stop) => stop.name)).toEqual(["South", "North"]); expect(new Set(editor.state.city.busStops.map((stop) => stop.lineId))).toEqual(new Set([id]));
    editor.undo(); expect(editor.state.city.busLines).toEqual([]); expect(editor.state.city.busStops).toEqual([]); expect(editor.selection).toBeNull();
    editor.redo(); expect(editor.state.city.busLines[0]?.id).toBe(id); expect(editor.state.city.busStops.map((stop) => stop.name)).toEqual(["South", "North"]);
  });

  it("keeps at least two stops on an existing bus loop", () => {
    const editor = new Editor(loopCity()); const id = editor.createBusLoop({ name: "Circle", color: "#228855", path: ["ab", "bc", "cd", "da"].map((roadEdgeId) => ({ roadEdgeId, forward: true })), stops: [
      { name: "South", roadEdgeId: "ab", fraction: 0.25, position: { x: 25, y: 0 }, side: "right" },
      { name: "East", roadEdgeId: "bc", fraction: 0.5, position: { x: 100, y: 50 }, side: "right" },
      { name: "North", roadEdgeId: "cd", fraction: 0.75, position: { x: 25, y: 100 }, side: "left" },
    ] })!;
    editor.select({ kind: "bus-stop", id: editor.state.city.busLines.find((line) => line.id === id)!.stopIds[1]! }); editor.deleteSelected(); expect(editor.state.city.busStops).toHaveLength(2);
    const protectedStopId = editor.state.city.busLines.find((line) => line.id === id)!.stopIds[0]!; editor.select({ kind: "bus-stop", id: protectedStopId }); editor.deleteSelected(); expect(editor.state.city.busStops).toHaveLength(2);
    const otherId = editor.createBusLoop({ name: "Other", color: "#8844aa", path: ["ab", "bc", "cd", "da"].map((roadEdgeId) => ({ roadEdgeId, forward: true })), stops: [
      { name: "One", roadEdgeId: "ab", fraction: 0.5, position: { x: 50, y: 0 }, side: "left" }, { name: "Two", roadEdgeId: "cd", fraction: 0.5, position: { x: 50, y: 100 }, side: "right" },
    ] })!;
    editor.updateBusStop(protectedStopId, { lineId: otherId }); expect(editor.state.city.busStops.find((stop) => stop.id === protectedStopId)?.lineId).toBe(id); expect(editor.state.city.busLines.find((line) => line.id === id)?.stopIds).toHaveLength(2);
  });

  it("rejects invalid bus loops without creating partial state or history", () => {
    const validPath = ["ab", "bc", "cd", "da"].map((roadEdgeId) => ({ roadEdgeId, forward: true })); const stop = (roadEdgeId: string, fraction: number) => ({ name: roadEdgeId, roadEdgeId, fraction, position: { x: 10, y: 10 }, side: "right" as const });
    const inputs = [
      { path: validPath, stops: [stop("ab", 0.2)] },
      { path: validPath, stops: [stop("ab", 1.2), stop("cd", 0.2)] },
      { path: validPath, stops: [stop("missing", 0.2), stop("cd", 0.2)] },
      { path: validPath.slice(0, 3), stops: [stop("ab", 0.2), stop("cd", 0.2)] },
      { path: validPath, stops: [stop("cd", 0.2), stop("ab", 0.2)] },
    ];
    for (const input of inputs) { const editor = new Editor(loopCity()); expect(editor.createBusLoop({ name: "Invalid", color: "#000000", ...input })).toBeUndefined(); expect(editor.state.city.busLines).toEqual([]); expect(editor.state.city.busStops).toEqual([]); expect(editor.commands.canUndo).toBe(false); }
  });

  it("retains a terminal-free fractional loop while reconciling a split road edge", () => {
    const editor = new Editor(loopCity()); const id = editor.createBusLoop({ name: "Circle", color: "#228855", path: [
      { roadEdgeId: "ab", forward: true, startFraction: 0.25 }, { roadEdgeId: "bc", forward: true }, { roadEdgeId: "cd", forward: true }, { roadEdgeId: "da", forward: true }, { roadEdgeId: "ab", forward: true, endFraction: 0.25 },
    ], stops: [
      { name: "East", roadEdgeId: "bc", fraction: 0.5, position: { x: 100, y: 50 }, side: "right" },
      { name: "West", roadEdgeId: "da", fraction: 0.5, position: { x: 0, y: 50 }, side: "left" },
    ] })!;
    editor.commands.clear(); editor.splitRoadEdge("ab", { x: 50, y: 0 });
    expect(editor.state.city.busLines).toHaveLength(1); expect(editor.state.city.busLines[0]).toMatchObject({ id, loop: true }); expect(editor.state.city.busLines[0]?.startTerminalId).toBeUndefined(); expect(editor.state.city.busStops).toHaveLength(2);
    editor.undo(); expect(editor.state.city.busLines[0]?.path[0]).toMatchObject({ roadEdgeId: "ab", startFraction: 0.25 });
  });

  it("creates shared university campuses and restores linked facilities on undo", () => {
    const editor = new Editor(city()); const polygon = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]; const first = editor.createCampusZone({ name: "Main", type: "education", polygon, source: "custom", opacity: 0.4 })!;
    expect(editor.state.city.universities).toHaveLength(1); expect(editor.state.city.zones[0]).toMatchObject({ id: first.zoneId, universityId: first.universityId, name: "Main" });
    editor.updateUniversity(first.universityId, { name: "City University", tags: ["Public"] }); expect(editor.state.city.universities[0]).toMatchObject({ name: "City University", tags: ["Public"] }); editor.undo(); expect(editor.state.city.universities[0]?.name).toBe("University 1"); editor.redo();
    const second = editor.createCampusZone({ name: "North", type: "education", polygon: polygon.map((point) => ({ x: point.x + 200, y: point.y })), source: "custom", opacity: 0.4 }, first.universityId)!; const facilityId = editor.createFacility({ type: "library", name: "North Library", position: { x: 220, y: 20 }, icon: "library.svg", color: "#557799", universityZoneId: second.zoneId });
    expect(editor.state.city.zones.filter((zone) => zone.universityId === first.universityId)).toHaveLength(2); editor.select({ kind: "zone", id: second.zoneId }); editor.deleteSelected(); expect(editor.state.city.zones.some((zone) => zone.id === second.zoneId)).toBe(false); expect(editor.state.city.facilities.some((facility) => facility.id === facilityId)).toBe(false); expect(editor.state.city.universities).toHaveLength(1);
    editor.undo(); expect(editor.state.city.zones.some((zone) => zone.id === second.zoneId)).toBe(true); expect(editor.state.city.facilities.some((facility) => facility.id === facilityId)).toBe(true);
    const otherUniversityId = editor.createUniversity(); expect(editor.state.city.universities.some((university) => university.id === otherUniversityId)).toBe(true); editor.undo(); expect(editor.state.city.universities).toHaveLength(1);
  });

  it("assigns a pending campus to a new or existing university with undo support", () => {
    const editor = new Editor(city()); const polygon = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]; const pendingId = editor.createPendingCampusZone({ name: "", type: "education", polygon, source: "custom", opacity: 0.4 })!;
    expect(editor.state.city.universities).toEqual([]); expect(editor.state.city.zones[0]).toMatchObject({ id: pendingId, purpose: "university" }); expect(editor.state.city.zones[0]?.universityId).toBeUndefined();
    const universityId = editor.assignCampus(pendingId)!; expect(editor.state.city.universities).toHaveLength(1); expect(editor.state.city.zones[0]).toMatchObject({ universityId, campusRole: "main", name: "Main Campus" }); expect(editor.state.city.zones[0]?.purpose).toBeUndefined();
    editor.undo(); expect(editor.state.city.universities).toEqual([]); expect(editor.state.city.zones[0]).toMatchObject({ purpose: "university" }); editor.redo();
    const branchId = editor.createPendingCampusZone({ name: "North", type: "education", polygon: polygon.map((point) => ({ x: point.x + 200, y: point.y })), source: "custom", opacity: 0.4 })!; expect(editor.assignCampus(branchId, universityId)).toBe(universityId); expect(editor.state.city.zones.find((zone) => zone.id === branchId)).toMatchObject({ universityId, campusRole: "branch", name: "North" });
  });

  it("links education zones and facilities to a university with undo support", () => {
    const editor = new Editor(city()); const universityId = editor.createUniversity(); const schoolId = editor.createZone({ name: "Primary School", type: "education", polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], source: "custom", opacity: 0.4 })!; editor.updateZone(schoolId, { educationLevel: "primary", affiliatedUniversityId: universityId });
    expect(editor.state.city.zones[0]).toMatchObject({ educationLevel: "primary", affiliatedUniversityId: universityId }); editor.undo(); expect(editor.state.city.zones[0]?.affiliatedUniversityId).toBeUndefined();
    const facilityId = editor.createFacility({ type: "hospital", name: "Teaching Hospital", position: { x: 20, y: 20 }, icon: "hospital.svg", color: "#c45562" }); editor.updateFacility(facilityId, { affiliatedUniversityId: universityId, universityAffiliationKind: "hospital" });
    expect(editor.state.city.facilities[0]).toMatchObject({ affiliatedUniversityId: universityId, universityAffiliationKind: "hospital" }); editor.undo(); expect(editor.state.city.facilities[0]?.affiliatedUniversityId).toBeUndefined();
  });
});
