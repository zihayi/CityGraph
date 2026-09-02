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
    buildings: [], blocks: [], zones: [], parks: [], waters: [], pois: [], facilities: [], transitLines: [], transitStations: [], busTerminals: [], busLines: [], busStops: [], labels: [],
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

  it("supports facility create, move, rename and delete with undo and redo", () => {
    const editor = new Editor(city()); const id = editor.createFacility({ type: "coffee-shop", name: "Coffee Shop", position: { x: 20, y: 30 }, icon: "coffee-shop.svg", color: "#2d9f9b" });
    expect(editor.selection).toEqual({ kind: "facility", id }); editor.updateFacility(id, { name: "Manner Coffee", color: "#b84a62" }); expect(editor.state.city.facilities[0]).toMatchObject({ type: "coffee-shop", name: "Manner Coffee", icon: "coffee-shop.svg", color: "#b84a62" });
    editor.state.city.facilities[0]!.position = { x: 80, y: 90 }; editor.moveFacility(id, { x: 20, y: 30 }); expect(editor.state.city.facilities[0]!.position).toEqual({ x: 80, y: 90 }); editor.undo(); expect(editor.state.city.facilities[0]!.position).toEqual({ x: 20, y: 30 }); editor.redo();
    editor.deleteSelected(); expect(editor.state.city.facilities).toHaveLength(0); editor.undo(); expect(editor.state.city.facilities[0]?.name).toBe("Manner Coffee"); editor.undo(); expect(editor.state.city.facilities[0]?.position).toEqual({ x: 20, y: 30 }); editor.undo(); expect(editor.state.city.facilities[0]).toMatchObject({ name: "Coffee Shop", color: "#2d9f9b" }); editor.undo(); expect(editor.state.city.facilities).toHaveLength(0); editor.redo(); expect(editor.state.city.facilities[0]?.type).toBe("coffee-shop");
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
});
