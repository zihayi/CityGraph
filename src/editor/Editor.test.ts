import { describe, expect, it } from "vitest";
import { createEmptyCompany, createEmptyUniversity, createEmptyUniversityProfile, defaultEconomySettings, type BusStop, type City } from "../model/City";
import { createBuildingPreset, ringFootprintRadii } from "../geometry/BuildingGeometry";
import { Editor } from "./Editor";
import { buildRoadCreation } from "./RoadGraph";

function city(): City {
  return {
    id: "city", name: "City", bounds: { x: 0, y: 0, width: 1000, height: 1000 }, mapSize: "small", terrain: "flat", economy: { ...defaultEconomySettings },
    roadNodes: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 110, y: 80 }, { id: "d", x: 220, y: 80 }],
    roads: [
      { id: "old", category: "normal", subtype: "small", width: 8, name: "Old", segmentIds: ["old-edge"] },
      { id: "new", category: "normal", subtype: "small", width: 8, name: "New", segmentIds: ["new-edge"] },
    ],
    roadEdges: [{ id: "old-edge", roadId: "old", name: "Old", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } }, { id: "new-edge", roadId: "new", name: "New", startNodeId: "c", endNodeId: "d", structure: "ground", level: 0, geometry: { type: "line" } }],
    buildings: [], blocks: [], zones: [], parks: [], districts: [], waters: [], pois: [], facilities: [], universities: [], hospitals: [], companies: [], transitLines: [], transitStations: [], busTerminals: [], busLines: [], busStops: [], labels: [],
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

describe("Editor bus route extension", () => {
  function routeEditor(forward = true): Editor {
    const editor = new Editor(city()); const fractions = forward ? [0.25, 0.5, 0.75] : [0.75, 0.5, 0.25];
    editor.createBusRoute({ name: "Cross Town", color: "#2877bb", loop: false, path: [{ roadEdgeId: "old-edge", forward, startFraction: fractions[0], endFraction: fractions[2] }], stops: fractions.map((fraction, index) => ({ name: `Stop ${index + 1}`, roadEdgeId: "old-edge", fraction, position: { x: fraction * 100, y: 0 }, side: index === 1 ? "left" : "right" })) });
    editor.commands.clear(); return editor;
  }

  it.each([
    { endpoint: "start" as const, forward: true, fraction: 0.1, boundary: 0.25 },
    { endpoint: "end" as const, forward: true, fraction: 0.9, boundary: 0.75 },
    { endpoint: "start" as const, forward: false, fraction: 0.9, boundary: 0.75 },
    { endpoint: "end" as const, forward: false, fraction: 0.1, boundary: 0.25 },
  ])("extends $endpoint on a partial edge (forward=$forward) from the path boundary with one undo/redo", ({ endpoint, forward, fraction, boundary }) => {
    const editor = routeEditor(forward); const lineId = editor.state.city.busLines[0]!.id;
    for (const index of [0, 2]) {
      const stop = editor.state.city.busStops[index]!;
      const before = structuredClone(stop); stop.fraction += stop.fraction < 0.5 ? 0.1 : -0.1; stop.position.x = stop.fraction * 100; editor.moveBusStop(stop.id, before);
    }
    expect(editor.state.city.busStops.map((stop) => stop.fraction)).toEqual(forward ? [0.35, 0.5, 0.65] : [0.65, 0.5, 0.35]);
    editor.commands.clear(); const before = structuredClone(editor.state.city); const original = before.busLines[0]!; const stateId = editor.commands.stateId; const changes: string[] = []; const notifications: City["busLines"][] = [];
    const unsubscribe = editor.subscribe((change) => { changes.push(change); if (change === "buses") { notifications.push(structuredClone(editor.state.city.busLines)); expect(editor.state.city.busStops).toHaveLength(before.busStops.length + 1); } });
    const input: Omit<BusStop, "id" | "lineId"> = { name: "New Endpoint", roadEdgeId: "old-edge", fraction, position: { x: fraction * 100, y: 0 }, side: "left" }; const inputBefore = structuredClone(input);
    const id = editor.extendBusRoute(lineId, endpoint, input); expect(id).toEqual(expect.any(String));
    const section = { roadEdgeId: "old-edge", forward, startFraction: endpoint === "start" ? fraction : boundary, endFraction: endpoint === "start" ? boundary : fraction };
    const expected = { ...original, path: endpoint === "start" ? [section, ...original.path] : [...original.path, section], stopIds: endpoint === "start" ? [id, ...original.stopIds] : [...original.stopIds, id] };
    expect(editor.state.city.busLines).toEqual([expected]); expect(editor.state.city.busStops).toEqual([...before.busStops, { ...input, id, lineId }]); expect(input).toEqual(inputBefore);
    expect(editor.selection).toEqual({ kind: "bus-line", id: lineId }); expect(changes).toEqual(["buses", "selection", "history"]); expect(notifications).toEqual([[expected]]); unsubscribe();
    const after = structuredClone(editor.state.city); editor.undo(); expect(editor.state.city).toEqual(before); expect(editor.commands.stateId).toBe(stateId); expect(editor.commands.canUndo).toBe(false); expect(editor.commands.canRedo).toBe(true);
    editor.redo(); expect(editor.state.city).toEqual(after); expect(editor.commands.canRedo).toBe(false); expect(editor.selection).toEqual({ kind: "bus-line", id: lineId });
    const nextFraction = fraction < 0.5 ? 0 : 1; const nextId = editor.extendBusRoute(lineId, endpoint, { ...input, fraction: nextFraction, position: { x: nextFraction * 100, y: 0 } });
    expect(nextId).toEqual(expect.any(String)); expect(nextId).not.toBe(id); expect(editor.state.city.busLines[0]!.stopIds).toEqual(endpoint === "start" ? [nextId, ...expected.stopIds] : [...expected.stopIds, nextId]); editor.undo(); expect(editor.state.city).toEqual(after);
  });

  it.each([
    { endpoint: "start" as const, forward: true }, { endpoint: "end" as const, forward: true },
    { endpoint: "start" as const, forward: false }, { endpoint: "end" as const, forward: false },
  ])("auto-connects multiple edges at $endpoint with default boundary fractions (forward=$forward)", ({ endpoint, forward }) => {
    const editor = routeEditor(forward); const data = editor.state.city; const original = data.busLines[0]!; original.path = [{ roadEdgeId: "old-edge", forward }]; data.busStops.splice(1, 1); original.stopIds.splice(1, 1);
    const boundaryNode = (endpoint === "start") === forward ? "a" : "b";
    data.roadEdges.push({ ...data.roadEdges[1]!, id: "bridge", startNodeId: boundaryNode, endNodeId: "c" }); data.roads[1]!.segmentIds.unshift("bridge");
    const before = structuredClone(data); const id = editor.extendBusRoute(original.id, endpoint, { name: "Beyond", roadEdgeId: "new-edge", fraction: 0.5, position: { x: 165, y: 80 }, side: "right" });
    expect(id).toEqual(expect.any(String)); const section = endpoint === "start" ? [{ roadEdgeId: "new-edge", forward: false, startFraction: 0.5, endFraction: 0 }, { roadEdgeId: "bridge", forward: false, startFraction: 1, endFraction: 0 }] : [{ roadEdgeId: "bridge", forward: true, startFraction: 0, endFraction: 1 }, { roadEdgeId: "new-edge", forward: true, startFraction: 0, endFraction: 0.5 }];
    expect(data.busLines[0]!.path).toEqual(endpoint === "start" ? [...section, ...original.path] : [...original.path, ...section]); expect(data.busStops.slice(0, -1)).toEqual(before.busStops); editor.undo(); expect(data).toEqual(before); expect(editor.commands.canUndo).toBe(false);
  });

  it.each(["start", "end"] as const)("preserves repeated-edge geometry and old stop order when extending %s", (endpoint) => {
    const data = loopCity(); data.roadNodes.push({ id: "e", x: 200, y: 0 }); data.roadEdges.push({ ...data.roadEdges[0]!, id: "be", startNodeId: "b", endNodeId: "e" }); data.roads[0]!.segmentIds.push("be"); const editor = new Editor(data);
    const lineId = editor.createBusRoute({ name: "Scenic", color: "#8844aa", loop: false, path: [{ roadEdgeId: "ab", forward: true, startFraction: 0.25 }, ...["bc", "cd", "da"].map((roadEdgeId) => ({ roadEdgeId, forward: true })), { roadEdgeId: "ab", forward: true, endFraction: 0.75 }], stops: [
      { name: "First", roadEdgeId: "ab", fraction: 0.25, position: { x: 25, y: 0 }, side: "right" },
      { name: "Middle", roadEdgeId: "cd", fraction: 0.5, position: { x: 50, y: 100 }, side: "left" },
      { name: "Last", roadEdgeId: "ab", fraction: 0.75, position: { x: 75, y: 0 }, side: "right" },
    ] })!;
    editor.commands.clear(); const before = structuredClone(data); const original = before.busLines[0]!;
    expect(editor.extendBusRoute(lineId, endpoint, { name: "Already Traversed", roadEdgeId: "ab", fraction: 0.9, position: { x: 90, y: 0 }, side: "left" })).toBeUndefined(); expect(data).toEqual(before); expect(editor.commands.canUndo).toBe(false);
    const id = editor.extendBusRoute(lineId, endpoint, { name: "Beyond", roadEdgeId: "be", fraction: 0.5, position: { x: 150, y: 0 }, side: "right" }); expect(id).toEqual(expect.any(String));
    const section = endpoint === "start" ? [{ roadEdgeId: "be", forward: false, startFraction: 0.5, endFraction: 0 }, { roadEdgeId: "ab", forward: false, startFraction: 1, endFraction: 0.25 }] : [{ roadEdgeId: "ab", forward: true, startFraction: 0.75, endFraction: 1 }, { roadEdgeId: "be", forward: true, startFraction: 0, endFraction: 0.5 }];
    expect(data.busLines[0]).toEqual({ ...original, path: endpoint === "start" ? [...section, ...original.path] : [...original.path, ...section], stopIds: endpoint === "start" ? [id, ...original.stopIds] : [...original.stopIds, id] }); expect(data.busStops.slice(0, -1)).toEqual(before.busStops);
    const after = structuredClone(data); editor.undo(); expect(data).toEqual(before); expect(editor.commands.canUndo).toBe(false); editor.redo(); expect(data).toEqual(after);
  });

  it.each(["left", "right"] as const)("reuses another line's station name only on the same side (%s)", (side) => {
    const editor = routeEditor(); const lineId = editor.state.city.busLines[0]!.id;
    editor.createBusRoute({ name: "Other", color: "#228855", loop: false, path: [{ roadEdgeId: "old-edge", forward: true, startFraction: 0.9 }], stops: [0.9, 1].map((fraction) => ({ name: "Interchange", roadEdgeId: "old-edge", fraction, position: { x: fraction * 100, y: 0 }, side: "right" })) });
    editor.commands.clear(); const before = structuredClone(editor.state.city); const id = editor.extendBusRoute(lineId, "end", { name: "Caller Name", roadEdgeId: "old-edge", fraction: 0.9, position: { x: 90, y: 0 }, side });
    expect(id).toEqual(expect.any(String)); expect(editor.state.city.busStops.at(-1)).toMatchObject({ id, lineId, name: side === "right" ? "Interchange" : "Caller Name" }); expect(editor.state.city.busStops.slice(0, -1)).toEqual(before.busStops); expect(editor.state.city.busLines[1]).toEqual(before.busLines[1]); expect(editor.selection).toEqual({ kind: "bus-line", id: lineId }); editor.undo(); expect(editor.state.city).toEqual(before);
  });

  it.each(["start", "end"] as const)("rejects invalid candidates at %s without changing state, selection, or history", (endpoint) => {
    const inputs: Partial<Omit<BusStop, "id" | "lineId">>[] = [
      { fraction: NaN }, { fraction: Infinity }, { fraction: -0.1 }, { fraction: 1.1 },
      { position: { x: NaN, y: 0 } }, { position: { x: 0, y: Infinity } }, { side: "middle" as BusStop["side"] },
      { roadEdgeId: "missing" }, { roadEdgeId: "new-edge", fraction: 0.5, position: { x: 165, y: 80 } },
      { fraction: 0.25 }, { fraction: 0.5 }, { fraction: 0.75, side: "left" }, { fraction: 0.75 + 1e-12 },
    ];
    for (const changes of inputs) {
      const editor = routeEditor(); const lineId = editor.state.city.busLines[0]!.id; editor.renameCity("Saved"); editor.renameCity("Pending"); editor.undo(); editor.select({ kind: "bus-stop", id: editor.state.city.busStops[0]!.id });
      const before = structuredClone(editor.state.city); const selection = structuredClone(editor.selection); const stateId = editor.commands.stateId; const events: string[] = []; editor.subscribe((change) => events.push(change));
      expect(editor.extendBusRoute(lineId, endpoint, { name: "Invalid", roadEdgeId: "old-edge", fraction: endpoint === "start" ? 0.1 : 0.9, position: { x: endpoint === "start" ? 10 : 90, y: 0 }, side: "right", ...changes })).toBeUndefined();
      expect(editor.state.city).toEqual(before); expect(editor.selection).toEqual(selection); expect(editor.commands.stateId).toBe(stateId); expect(editor.commands.canUndo).toBe(true); expect(editor.commands.canRedo).toBe(true); expect(events).toEqual([]);
    }
  });

  it.each<[string, (data: City) => void]>([
    ["missing line", (data) => { data.busLines = []; }],
    ["loop", (data) => { data.busLines[0]!.loop = true; }],
    ["legacy start terminal", (data) => { data.busLines[0]!.startTerminalId = "legacy"; data.busTerminals.push({ id: "legacy", name: "Legacy", position: { x: 25, y: 0 } }); }],
    ["legacy end terminal", (data) => { data.busLines[0]!.endTerminalId = "legacy"; data.busTerminals.push({ id: "legacy", name: "Legacy", position: { x: 75, y: 0 } }); }],
    ["too few stops", (data) => { data.busLines[0]!.stopIds = data.busLines[0]!.stopIds.slice(0, 1); }],
    ["missing stop", (data) => { data.busStops.pop(); }],
    ["wrong stop owner", (data) => { data.busStops[0]!.lineId = "other"; }],
    ["duplicate stop id", (data) => { data.busLines[0]!.stopIds[1] = data.busLines[0]!.stopIds[0]!; }],
    ["unordered stops", (data) => { data.busLines[0]!.stopIds.reverse(); }],
    ["empty path", (data) => { data.busLines[0]!.path = []; }],
    ["missing path edge", (data) => { data.busLines[0]!.path[0]!.roadEdgeId = "missing"; }],
    ["invalid path fraction", (data) => { data.busLines[0]!.path[0]!.endFraction = NaN; }],
    ["invalid path direction", (data) => { data.busLines[0]!.path[0]!.forward = false; }],
    ["disconnected path edges", (data) => { data.busLines[0]!.path.push({ roadEdgeId: "new-edge", forward: true }); }],
    ["disconnected fractions", (data) => { data.busLines[0]!.path.push({ roadEdgeId: "old-edge", forward: true, startFraction: 0.8 }); }],
    ["pedestrian path", (data) => { data.roads[0]!.category = "pedestrian"; }],
    ["missing road node", (data) => { data.roadNodes = data.roadNodes.filter((node) => node.id !== "a"); }],
  ])("rejects a %s without mutation or history", (_name, mutate) => {
    const editor = routeEditor(); const lineId = editor.state.city.busLines[0]!.id; mutate(editor.state.city); const before = structuredClone(editor.state.city); const selection = structuredClone(editor.selection); const stateId = editor.commands.stateId; const events: string[] = []; editor.subscribe((change) => events.push(change));
    for (const endpoint of ["start", "end"] as const) expect(editor.extendBusRoute(lineId, endpoint, { name: "Beyond", roadEdgeId: "old-edge", fraction: endpoint === "start" ? 0.1 : 0.9, position: { x: endpoint === "start" ? 10 : 90, y: 0 }, side: "right" })).toBeUndefined();
    expect(editor.state.city).toEqual(before); expect(editor.selection).toEqual(selection); expect(editor.commands.stateId).toBe(stateId); expect(editor.commands.canUndo).toBe(false); expect(editor.commands.canRedo).toBe(false); expect(events).toEqual([]);
  });

  it.each(["category", "subtype"] as const)("rejects pedestrian candidates and pedestrian-only connections (%s)", (property) => {
    const editor = routeEditor(); const data = editor.state.city; const lineId = data.busLines[0]!.id;
    data.roads.push({ ...data.roads[1]!, id: "walk", segmentIds: ["bridge"], [property]: "pedestrian" }); data.roadEdges.push({ ...data.roadEdges[1]!, id: "bridge", roadId: "walk", startNodeId: "b", endNodeId: "c" }); const before = structuredClone(data);
    for (const roadEdgeId of ["bridge", "new-edge"]) expect(editor.extendBusRoute(lineId, "end", { name: "Invalid", roadEdgeId, fraction: 0.5, position: { x: 165, y: 80 }, side: "right" })).toBeUndefined();
    expect(data).toEqual(before); expect(editor.commands.canUndo).toBe(false);
  });

  it.each(["start", "end"] as const)("rejects an existing path node represented on another edge at %s", (endpoint) => {
    const editor = routeEditor(); const data = editor.state.city; const line = data.busLines[0]!; line.path = [{ roadEdgeId: "old-edge", forward: true }];
    data.roadEdges[1]!.startNodeId = endpoint === "start" ? "a" : "b"; const before = structuredClone(data);
    expect(editor.extendBusRoute(line.id, endpoint, { name: "Same Node", roadEdgeId: "new-edge", fraction: 0, position: { x: endpoint === "start" ? 0 : 100, y: 0 }, side: "left" })).toBeUndefined();
    expect(data).toEqual(before); expect(editor.commands.canUndo).toBe(false);
  });
});

describe("Editor spatial groups", () => {
  it("moves roads and attached stops as one undoable sparse command", () => {
    const data = city(); data.busStops = [{ id: "stop", name: "Stop", lineId: "line", roadEdgeId: "old-edge", fraction: 0.5, position: { x: 50, y: 0 }, side: "right" }];
    const editor = new Editor(data); editor.selectSpatialItems([{ kind: "road-edge", id: "old-edge" }]); const before = editor.captureSpatialSelection(); const changes: string[] = []; editor.subscribe((change) => changes.push(change));
    editor.translateSpatialSelection({ x: 10, y: 5 }); editor.commitSpatialSelectionMove(before);
    expect(data.roadNodes.find((node) => node.id === "a")).toMatchObject({ x: 10, y: 5 }); expect(data.busStops[0]?.position).toEqual({ x: 60, y: 5 }); expect(changes).toEqual(["roads", "buses", "history"]);
    editor.undo(); expect(data.roadNodes.find((node) => node.id === "a")).toMatchObject({ x: 0, y: 0 }); expect(data.busStops[0]?.position).toEqual({ x: 50, y: 0 }); editor.redo(); expect(data.busStops[0]?.position).toEqual({ x: 60, y: 5 });
  });

  it("duplicates related campuses and facilities without cloning the university", () => {
    const data = city(); data.universities = [{ ...createEmptyUniversity("university"), name: "University", logo: "data:image/png;base64,large" }]; data.zones = [{ id: "campus", name: "Main", type: "education", polygon: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 30 }], source: "custom", opacity: 0.5, universityId: "university", campusRole: "main" }]; data.facilities = [{ id: "library", type: "library", name: "Library", position: { x: 10, y: 10 }, icon: "", color: "#123456", universityZoneId: "campus" }];
    const editor = new Editor(data); editor.selectSpatialItems([{ kind: "zone", id: "campus" }, { kind: "facility", id: "library" }]); editor.duplicateSpatialSelection({ x: 40, y: 10 });
    expect(data.universities).toHaveLength(1); expect(data.zones).toHaveLength(2); expect(data.facilities).toHaveLength(2); const copiedZone = data.zones.find((zone) => zone.id !== "campus")!; const copiedFacility = data.facilities.find((facility) => facility.id !== "library")!; expect(copiedZone).toMatchObject({ universityId: "university", campusRole: "branch" }); expect(copiedFacility).toMatchObject({ universityZoneId: copiedZone.id, position: { x: 50, y: 20 } });
    editor.undo(); expect(data.zones).toHaveLength(1); expect(data.facilities).toHaveLength(1); editor.redo(); expect(data.zones).toHaveLength(2);
  });

  it("copies a spatial group as a snapshot and offsets each paste", () => {
    const data = city(); data.universities = [{ ...createEmptyUniversity("university"), name: "University" }]; data.zones = [{ id: "campus", name: "Main", type: "education", polygon: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 30 }], source: "custom", opacity: 0.5, universityId: "university", campusRole: "main" }]; data.facilities = [{ id: "library", type: "library", name: "Library", position: { x: 10, y: 10 }, icon: "", color: "#123456", universityZoneId: "campus" }];
    const editor = new Editor(data); editor.selectSpatialItems([{ kind: "zone", id: "campus" }, { kind: "facility", id: "library" }]); expect(editor.copySpatialSelection()).toBe(true);
    data.zones[0]!.polygon[0]!.x = 500; data.facilities[0]!.position.x = 500; editor.select(null);
    expect(editor.pasteSpatialSelection()).toBe(true); expect(editor.pasteSpatialSelection()).toBe(true);
    expect(data.zones).toHaveLength(3); expect(data.facilities).toHaveLength(3); const pastedZones = data.zones.slice(1); const pastedFacilities = data.facilities.slice(1);
    expect(pastedZones.map((zone) => zone.polygon[0])).toEqual([{ x: 20, y: 20 }, { x: 40, y: 40 }]); expect(pastedZones.every((zone) => zone.universityId === "university" && zone.campusRole === "branch")).toBe(true);
    expect(pastedFacilities.map((facility) => facility.position)).toEqual([{ x: 30, y: 30 }, { x: 50, y: 50 }]); expect(pastedFacilities.map((facility) => facility.universityZoneId)).toEqual(pastedZones.map((zone) => zone.id));
    expect(editor.selection).toEqual({ kind: "spatial-group", items: [{ kind: "zone", id: pastedZones[1]!.id }, { kind: "facility", id: pastedFacilities[1]!.id }] });
    editor.undo(); expect(data.zones).toHaveLength(2); expect(data.facilities).toHaveLength(2); editor.redo(); expect(data.zones).toHaveLength(3); expect(data.facilities).toHaveLength(3);
  });

  it("does not replace the spatial clipboard when copying without a group selection", () => {
    const data = city(); data.buildings = [{ id: "building", footprint: { outer: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], holes: [] }, type: "office", subtype: "", style: "modern", floors: 2, height: 8 }]; const editor = new Editor(data);
    editor.selectSpatialItems([{ kind: "building", id: "building" }]); expect(editor.copySpatialSelection()).toBe(true); editor.select(null); expect(editor.copySpatialSelection()).toBe(false); expect(editor.pasteSpatialSelection()).toBe(true);
    expect(data.buildings).toHaveLength(2); expect(data.buildings[1]!.footprint.outer[0]).toEqual({ x: 20, y: 20 });
  });

  it("pastes selected road segments with independent topology", () => {
    const data = city(); const editor = new Editor(data); editor.selectSpatialItems([{ kind: "road-edge", id: "old-edge" }, { kind: "road-edge", id: "new-edge" }]); expect(editor.copySpatialSelection()).toBe(true); expect(editor.pasteSpatialSelection()).toBe(true);
    const copiedEdges = data.roadEdges.slice(2); const copiedRoads = data.roads.slice(2); const copiedNodes = data.roadNodes.slice(4); expect(copiedEdges).toHaveLength(2); expect(copiedRoads).toHaveLength(2); expect(copiedNodes).toHaveLength(4);
    expect(copiedEdges.every((edge) => copiedRoads.some((road) => road.id === edge.roadId && road.segmentIds.includes(edge.id)))).toBe(true); expect(copiedEdges.every((edge) => copiedNodes.some((node) => node.id === edge.startNodeId) && copiedNodes.some((node) => node.id === edge.endNodeId))).toBe(true);
    expect(copiedNodes.map(({ x, y }) => ({ x, y }))).toEqual([{ x: 20, y: 20 }, { x: 120, y: 20 }, { x: 130, y: 100 }, { x: 240, y: 100 }]); expect(new Set([...copiedNodes.map((node) => node.id), ...copiedRoads.map((road) => road.id), ...copiedEdges.map((edge) => edge.id)]).size).toBe(8);
  });

  it("repairs shared-entity relationships when deleting a campus", () => {
    const data = city(); data.universities = [{ ...createEmptyUniversity("university"), name: "University" }]; data.zones = [
      { id: "main", name: "Main", type: "education", polygon: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 30 }], source: "custom", opacity: 0.5, universityId: "university", campusRole: "main" },
      { id: "branch", name: "Branch", type: "education", polygon: [{ x: 40, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 30 }, { x: 40, y: 30 }], source: "custom", opacity: 0.5, universityId: "university", campusRole: "branch" },
    ]; data.facilities = [{ id: "library", type: "library", name: "Library", position: { x: 10, y: 10 }, icon: "", color: "#123456", universityZoneId: "main" }];
    const editor = new Editor(data); editor.selectSpatialItems([{ kind: "zone", id: "main" }]); editor.deleteSpatialSelection();
    expect(data.zones).toEqual([expect.objectContaining({ id: "branch", campusRole: "main" })]); expect(data.universities).toHaveLength(1); expect(data.facilities).toEqual([]);
    editor.undo(); expect(data.zones.map((zone) => zone.id)).toEqual(["main", "branch"]); expect(data.facilities).toHaveLength(1);
  });
});

describe("Editor districts", () => {
  it("creates, edits, and rejects overlapping districts", () => {
    const editor = new Editor(city()); const first = editor.createDistrict({ name: "North", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    expect(first).toBeTruthy(); expect(editor.createDistrict({ name: "Overlap", points: [{ x: 50, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 100 }, { x: 50, y: 100 }] })).toBeUndefined();
    const second = editor.createDistrict({ name: "East", points: [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }] })!; editor.updateDistrict(second, { name: "Eastern" }); expect(editor.state.city.districts[1]?.name).toBe("Eastern");
    const before = structuredClone(editor.state.city.districts[1]!.points); editor.state.city.districts[1]!.points = editor.state.city.districts[1]!.points.map((point) => ({ x: point.x - 80, y: point.y })); editor.moveDistrict(second, before); expect(editor.state.city.districts[1]!.points).toEqual(before);
    editor.deleteSelected(); expect(editor.state.city.districts).toHaveLength(1); editor.undo(); expect(editor.state.city.districts).toHaveLength(2);
  });

  it("updates district name, GDP, and year in one undoable snapshot", () => {
    const editor = new Editor(city()); const id = editor.createDistrict({ name: "Central", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] })!; editor.commands.clear();
    editor.updateDistrict(id, { name: " Downtown ", gdp: 1250.5, gdpYear: 2025 }); expect(editor.state.city.districts[0]).toMatchObject({ name: "Downtown", gdp: 1250.5, gdpYear: 2025 });
    editor.undo(); expect(editor.state.city.districts[0]).toEqual(expect.objectContaining({ name: "Central" })); expect(editor.state.city.districts[0]?.gdp).toBeUndefined(); expect(editor.state.city.districts[0]?.gdpYear).toBeUndefined();
    editor.redo(); expect(editor.state.city.districts[0]).toMatchObject({ name: "Downtown", gdp: 1250.5, gdpYear: 2025 }); editor.updateDistrict(id, { gdp: -1, gdpYear: 2025.5 }); expect(editor.state.city.districts[0]?.gdp).toBeUndefined(); expect(editor.state.city.districts[0]?.gdpYear).toBeUndefined();
  });
});

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

  it("supports the complete landscaping lifecycle independently from zoning", () => {
    const editor = new Editor(city()); editor.state.city.zones.push({ id: "zone", name: "Housing", type: "residential", polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], source: "custom", opacity: 0.4 }); const zones = structuredClone(editor.state.city.zones);
    const id = editor.createPark({ name: "Greenway", points: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 70 }, { x: 10, y: 70 }], source: "road-fill", color: "#4f8f55", opacity: 0.7 })!;
    expect(editor.selection).toEqual({ kind: "park", id }); editor.updatePark(id, { name: "Central Greenway", color: "#2f713f", opacity: 0.8 }); expect(editor.state.city.parks[0]).toMatchObject({ name: "Central Greenway", source: "road-fill", color: "#2f713f", opacity: 0.8 });
    const beforeMove = structuredClone(editor.state.city.parks[0]!.points); editor.state.city.parks[0]!.points.forEach((point) => { point.x += 20; point.y += 10; }); editor.movePark(id, beforeMove); expect(editor.state.city.parks[0]!.points[0]).toEqual({ x: 30, y: 20 }); editor.undo(); expect(editor.state.city.parks[0]!.points[0]).toEqual({ x: 10, y: 10 }); editor.redo();
    editor.addParkVertex(id, 0, { x: 70, y: 20 }); expect(editor.state.city.parks[0]!.points).toHaveLength(5); editor.deleteParkVertex(id, 1); expect(editor.state.city.parks[0]!.points).toHaveLength(4); editor.deleteSelected(); expect(editor.state.city.parks).toEqual([]); expect(editor.state.city.zones).toEqual(zones); editor.undo(); expect(editor.state.city.parks[0]?.name).toBe("Central Greenway");
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
    expect(ids).toHaveLength(6); expect(editor.state.city.blocks).toHaveLength(6); expect(editor.state.city.roads).toHaveLength(7); expect(editor.state.city.roads.every((road) => road.subtype === "small")).toBe(true); expect(editor.state.city.roads.every((road) => road.name === "")).toBe(true);
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
    editor.updateFacility(id, { name: "School of Engineering" }); expect(editor.state.city.facilities[0]).toMatchObject({ name: "School of Engineering", universityZoneId: "west-campus" }); editor.undo(); expect(editor.state.city.facilities[0]?.name).toBe("College"); editor.redo();
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

  it("changes economy labels with dirty undo and redo history", () => {
    const editor = new Editor(city()); const stateId = editor.commands.stateId; editor.updateEconomySettings({ currency: "USD", monetaryUnit: "million" });
    expect(editor.state.city.economy).toEqual({ currency: "USD", monetaryUnit: "million" }); expect(editor.commands.stateId).not.toBe(stateId);
    editor.undo(); expect(editor.state.city.economy).toEqual(defaultEconomySettings); expect(editor.commands.stateId).toBe(stateId);
    editor.redo(); expect(editor.state.city.economy).toEqual({ currency: "USD", monetaryUnit: "million" });
  });

  it("switches between finite and unlimited canvases and resizes around the center without moving content", () => {
    const editor = new Editor(city()); const originalBounds = structuredClone(editor.state.city.bounds); const originalRoadNodes = structuredClone(editor.state.city.roadNodes);
    expect(editor.enableUnlimitedCanvas()).toBe(true); expect(editor.state.city.mapSize).toBe("unlimited"); expect(editor.state.city.bounds).toEqual(originalBounds); expect(editor.state.city.roadNodes).toEqual(originalRoadNodes);
    expect(editor.enableUnlimitedCanvas()).toBe(false); expect(editor.setCanvasBoundary("finite", 8000, 4000)).toBe(true); expect(editor.state.city).toMatchObject({ mapSize: "custom", bounds: { x: -3500, y: -1500, width: 8000, height: 4000 } }); expect(editor.state.city.roadNodes).toEqual(originalRoadNodes); editor.undo(); expect(editor.state.city.mapSize).toBe("unlimited"); editor.undo(); expect(editor.state.city.bounds).toEqual(originalBounds); editor.redo(); expect(editor.state.city.mapSize).toBe("unlimited");
  });
  it("moves and directly resizes finite canvas bounds as one undoable change", () => {
    const editor = new Editor(city()); const content = structuredClone({ roadNodes: editor.state.city.roadNodes, roads: editor.state.city.roads, roadEdges: editor.state.city.roadEdges }); const before = structuredClone(editor.state.city.bounds);
    expect(editor.setCanvasBounds({ x: -800, y: 250, width: 7500, height: 4300 })).toBe(true); expect(editor.state.city).toMatchObject({ mapSize: "custom", bounds: { x: -800, y: 250, width: 7500, height: 4300 } }); expect({ roadNodes: editor.state.city.roadNodes, roads: editor.state.city.roads, roadEdges: editor.state.city.roadEdges }).toEqual(content);
    editor.undo(); expect(editor.state.city.bounds).toEqual(before); editor.redo(); expect(editor.state.city.bounds).toEqual({ x: -800, y: 250, width: 7500, height: 4300 }); expect(editor.setCanvasBounds(editor.state.city.bounds)).toBe(false); expect(editor.setCanvasBounds({ x: Number.NaN, y: 0, width: 1000, height: 1000 })).toBe(false);
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

  it("keeps names synchronized across bus lines that share a station", () => {
    const editor = new Editor(city()); const start = editor.createBusTerminal({ name: "Start", position: { x: 0, y: 0 } }); const end = editor.createBusTerminal({ name: "End", position: { x: 100, y: 0 } });
    const firstLine = editor.createBusLine({ name: "B1", color: "#3366cc", startTerminalId: start, endTerminalId: end, path: [{ roadEdgeId: "old-edge", forward: true }], direction: "start-to-end" })!;
    const secondLine = editor.createBusLine({ name: "B2", color: "#dd6633", startTerminalId: start, endTerminalId: end, path: [{ roadEdgeId: "old-edge", forward: true }], direction: "start-to-end" })!;
    const first = editor.createBusStop({ name: "Market", lineId: firstLine, roadEdgeId: "old-edge", fraction: 0.5, position: { x: 50, y: 0 }, side: "left" })!;
    const second = editor.createBusStop({ name: "Different", lineId: secondLine, roadEdgeId: "old-edge", fraction: 0.5, position: { x: 50, y: 0 }, side: "left" })!;
    expect(editor.state.city.busStops.find((stop) => stop.id === second)?.name).toBe("Market");
    editor.updateBusStop(first, { name: "Central Market" }); expect(editor.state.city.busStops.filter((stop) => stop.fraction === 0.5).map((stop) => stop.name)).toEqual(["Central Market", "Central Market"]);
    editor.undo(); expect(editor.state.city.busStops.filter((stop) => stop.fraction === 0.5).map((stop) => stop.name)).toEqual(["Market", "Market"]);
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

  it("creates a terminal-free open bus route with two stops", () => {
    const editor = new Editor(loopCity()); const id = editor.createBusRoute({ name: "Cross Town", color: "#2877bb", loop: false, path: [{ roadEdgeId: "ab", forward: true, startFraction: 0.25 }, { roadEdgeId: "bc", forward: true, endFraction: 0.5 }], stops: [
      { name: "South", roadEdgeId: "ab", fraction: 0.25, position: { x: 25, y: 0 }, side: "right" }, { name: "East", roadEdgeId: "bc", fraction: 0.5, position: { x: 100, y: 50 }, side: "right" },
    ] })!;
    expect(editor.state.city.busLines[0]).toMatchObject({ id, loop: false, stopIds: [expect.any(String), expect.any(String)] }); expect(editor.state.city.busLines[0]?.startTerminalId).toBeUndefined(); expect(editor.state.city.busLines[0]?.endTerminalId).toBeUndefined(); editor.select({ kind: "bus-stop", id: editor.state.city.busLines[0]!.stopIds[0]! }); editor.deleteSelected(); expect(editor.state.city.busStops).toHaveLength(2); editor.undo(); expect(editor.state.city.busLines).toEqual([]);
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
    editor.updateUniversity(first.universityId, { name: "City University", tags: ["Public"], operatingBudget: 123.456 }); expect(editor.state.city.universities[0]).toMatchObject({ name: "City University", tags: ["Public"], operatingBudget: 123.46 }); editor.undo(); expect(editor.state.city.universities[0]?.name).toBe("University 1"); expect(editor.state.city.universities[0]?.operatingBudget).toBeUndefined(); editor.redo();
    const second = editor.createCampusZone({ name: "North", type: "education", polygon: polygon.map((point) => ({ x: point.x + 200, y: point.y })), source: "custom", opacity: 0.4 }, first.universityId)!; const facilityId = editor.createFacility({ type: "library", name: "North Library", position: { x: 220, y: 20 }, icon: "library.svg", color: "#557799", universityZoneId: second.zoneId });
    expect(editor.state.city.zones.filter((zone) => zone.universityId === first.universityId)).toHaveLength(2); editor.select({ kind: "zone", id: second.zoneId }); editor.deleteSelected(); expect(editor.state.city.zones.some((zone) => zone.id === second.zoneId)).toBe(false); expect(editor.state.city.facilities.some((facility) => facility.id === facilityId)).toBe(false); expect(editor.state.city.universities).toHaveLength(1);
    editor.undo(); expect(editor.state.city.zones.some((zone) => zone.id === second.zoneId)).toBe(true); expect(editor.state.city.facilities.some((facility) => facility.id === facilityId)).toBe(true);
    const otherUniversityId = editor.createUniversity(); expect(editor.state.city.universities.some((university) => university.id === otherUniversityId)).toBe(true); editor.undo(); expect(editor.state.city.universities).toHaveLength(1);
    editor.select({ kind: "zone", id: second.zoneId }); editor.deleteSelected(); editor.select({ kind: "zone", id: first.zoneId }); editor.deleteSelected(); expect(editor.state.city.universities).toEqual([]); editor.undo(); expect(editor.state.city.universities).toHaveLength(1); expect(editor.state.city.zones.some((zone) => zone.id === first.zoneId)).toBe(true);
  });

  it("renames one of multiple universities without emitting a selection refresh", () => {
    const editor = new Editor(city());
    const firstId = editor.createUniversity();
    const secondId = editor.createUniversity();
    const thirdId = editor.createUniversity();
    editor.select({ kind: "university", id: secondId });
    const changes: string[] = [];
    const unsubscribe = editor.subscribe((change) => changes.push(change));

    const untouched = editor.state.city.universities.filter((university) => university.id !== secondId);
    editor.updateUniversity(secondId, { name: "海州大学" });
    unsubscribe();

    expect(editor.state.city.universities.map((university) => university.id)).toEqual([firstId, secondId, thirdId]);
    expect(editor.state.city.universities.find((university) => university.id === secondId)?.name).toBe("海州大学");
    expect(editor.selection).toEqual({ kind: "university", id: secondId });
    expect(changes).toEqual(["universities", "history"]);
    expect(editor.state.city.universities.filter((university) => university.id !== secondId)).toEqual(untouched);
    editor.undo(); expect(editor.state.city.universities.find((university) => university.id === secondId)?.name).toBe("University 2");
    editor.redo(); expect(editor.state.city.universities.find((university) => university.id === secondId)?.name).toBe("海州大学");
  });

  it("reorders university rankings as one undoable change", () => {
    const editor = new Editor(city()); const firstId = editor.createUniversity(); const secondId = editor.createUniversity(); const thirdId = editor.createUniversity(); editor.commands.clear(); const changes: string[] = []; editor.subscribe((change) => changes.push(change));
    editor.updateUniversityRankings([thirdId, firstId, secondId]);
    expect(editor.state.city.universities.map(({ id, ranking }) => ({ id, ranking }))).toEqual([{ id: firstId, ranking: 2 }, { id: secondId, ranking: 3 }, { id: thirdId, ranking: 1 }]); expect(changes).toEqual(["universities", "history"]);
    editor.undo(); expect(editor.state.city.universities.map((university) => university.ranking)).toEqual([null, null, null]);
    editor.redo(); expect(editor.state.city.universities.map((university) => university.ranking)).toEqual([2, 3, 1]);
  });

  it("assigns a pending campus to a new or existing university with undo support", () => {
    const editor = new Editor(city()); const polygon = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]; const pendingId = editor.createPendingCampusZone({ name: "", type: "education", polygon, source: "custom", opacity: 0.4 })!;
    expect(editor.state.city.universities).toEqual([]); expect(editor.state.city.zones[0]).toMatchObject({ id: pendingId, purpose: "university" }); expect(editor.state.city.zones[0]?.universityId).toBeUndefined();
    const universityId = editor.assignCampus(pendingId)!; expect(editor.state.city.universities).toHaveLength(1); expect(editor.state.city.zones[0]).toMatchObject({ universityId, campusRole: "main", name: "Main Campus" }); expect(editor.state.city.zones[0]?.purpose).toBeUndefined();
    editor.undo(); expect(editor.state.city.universities).toEqual([]); expect(editor.state.city.zones[0]).toMatchObject({ purpose: "university" }); editor.redo();
    const branchId = editor.createPendingCampusZone({ name: "North", type: "education", polygon: polygon.map((point) => ({ x: point.x + 200, y: point.y })), source: "custom", opacity: 0.4 })!; expect(editor.assignCampus(branchId, universityId)).toBe(universityId); expect(editor.state.city.zones.find((zone) => zone.id === branchId)).toMatchObject({ universityId, campusRole: "branch", name: "North" });
  });

  it("merges same-name universities and preserves their references", () => {
    const data = city(); data.universities = [
      { ...createEmptyUniversity("university-main"), name: "帝都大学", tags: ["Public"], alumniCompanies: [{ id: "alumni", name: "North Labs", logo: "", notes: "" }] },
      { ...createEmptyUniversity("university-duplicate"), name: " 帝都大学 ", englishName: "Imperial University", tags: ["Research"], alumniCompanies: [{ id: "alumni", name: "South Works", logo: "", notes: "" }] },
    ];
    const polygon = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]; data.zones = [
      { id: "campus-main", name: "Main", type: "education", polygon, source: "custom", opacity: 0.4, universityId: "university-main", campusRole: "main" },
      { id: "campus-branch", name: "Branch", type: "education", polygon, source: "custom", opacity: 0.4, universityId: "university-duplicate", campusRole: "main" },
      { id: "school", name: "School", type: "education", polygon, source: "custom", opacity: 0.4, affiliatedUniversityId: "university-duplicate" },
    ];
    data.facilities = [{ id: "company", type: "company", name: "Company", position: { x: 10, y: 10 }, icon: "", color: "#000000", affiliatedUniversityId: "university-duplicate", company: { logo: "", description: "", isHeadquarters: false, marketValue: null, marketValueRank: null, alumniUniversityId: "university-duplicate", tags: [] } }];
    const editor = new Editor(data); expect(editor.state.city.universities).toHaveLength(1); expect(editor.state.city.universities[0]).toMatchObject({ id: "university-main", englishName: "Imperial University", tags: ["Public", "Research"] }); expect(editor.state.city.universities[0]?.alumniCompanies.map((company) => company.name)).toEqual(["North Labs", "South Works"]);
    expect(editor.state.city.zones.filter((zone) => zone.universityId).map((zone) => [zone.universityId, zone.campusRole])).toEqual([["university-main", "main"], ["university-main", "branch"]]); expect(editor.state.city.zones[2]?.affiliatedUniversityId).toBe("university-main"); expect(editor.state.city.facilities[0]).toMatchObject({ affiliatedUniversityId: "university-main", company: { alumniUniversityId: "university-main" } });
  });

  it("links school and hospital zones to a university with undo support", () => {
    const editor = new Editor(city()); const universityId = editor.createUniversity(); const schoolId = editor.createZone({ name: "Primary School", type: "education", polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], source: "custom", opacity: 0.4 })!; editor.updateZone(schoolId, { educationLevel: "primary", affiliatedUniversityId: universityId });
    expect(editor.state.city.zones[0]).toMatchObject({ educationLevel: "primary", affiliatedUniversityId: universityId }); editor.undo(); expect(editor.state.city.zones[0]?.affiliatedUniversityId).toBeUndefined();
    const hospitalId = editor.createZone({ name: "Teaching Hospital", type: "medical", polygon: [{ x: 120, y: 0 }, { x: 220, y: 0 }, { x: 120, y: 100 }], source: "custom", opacity: 0.4 })!; editor.updateZone(hospitalId, { affiliatedUniversityId: universityId });
    expect(editor.state.city.zones[1]).toMatchObject({ type: "medical", affiliatedUniversityId: universityId }); editor.undo(); expect(editor.state.city.zones[1]?.affiliatedUniversityId).toBeUndefined();
  });

  it("assigns and updates shared hospital campuses with undo support", () => {
    const editor = new Editor(city()); const universityId = editor.createUniversity(); const firstZoneId = editor.createZone({ name: "City Hospital", type: "medical", polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], source: "custom", opacity: 0.4 })!; const hospitalId = editor.assignHospitalCampus(firstZoneId)!;
    editor.updateHospital(hospitalId, { englishName: "City Hospital", ranking: 6.4, foundedYear: 1918.2, grade: "三级甲等", hospitalType: "综合医院", beds: 4200.4, landArea: 740000, specialties: [" 心血管内科 ", "心血管内科", "肿瘤科"], description: "区域医疗中心" });
    expect(editor.state.city.hospitals[0]).toMatchObject({ name: "City Hospital", englishName: "City Hospital", ranking: 6, foundedYear: 1918, beds: 4200, specialties: ["心血管内科", "肿瘤科"] }); expect(editor.state.city.zones[0]).toMatchObject({ name: "", hospitalId, hospitalCampusRole: "main" });
    const secondZoneId = editor.createZone({ name: "", type: "medical", polygon: [{ x: 120, y: 0 }, { x: 220, y: 0 }, { x: 120, y: 100 }], source: "custom", opacity: 0.4 })!; editor.assignHospitalCampus(secondZoneId, hospitalId); editor.updateHospitalCampus(secondZoneId, { name: " North Campus ", address: " North Road ", hospitalCampusRole: "main", areaOverride: 120000 });
    expect(editor.state.city.zones.find((zone) => zone.id === secondZoneId)).toMatchObject({ name: "North Campus", address: "North Road", hospitalCampusRole: "main", areaOverride: 120000 }); expect(editor.state.city.zones.find((zone) => zone.id === firstZoneId)?.hospitalCampusRole).toBe("branch"); editor.undo(); expect(editor.state.city.zones.find((zone) => zone.id === secondZoneId)?.name).toBe(""); editor.redo(); editor.updateHospital(hospitalId, { affiliatedUniversityId: universityId }); expect(editor.state.city.zones.find((zone) => zone.id === secondZoneId)?.affiliatedUniversityId).toBe(universityId); expect(editor.state.city.zones.find((zone) => zone.id === firstZoneId)?.affiliatedUniversityId).toBeUndefined(); editor.select({ kind: "zone", id: secondZoneId }); editor.deleteSelected(); expect(editor.state.city.zones.find((zone) => zone.id === firstZoneId)).toMatchObject({ hospitalCampusRole: "main", affiliatedUniversityId: universityId }); editor.undo(); expect(editor.state.city.zones.find((zone) => zone.id === secondZoneId)?.hospitalCampusRole).toBe("main");
  });

  it("assigns existing companies and enforces one headquarters with undo support", () => {
    const editor = new Editor(city()); const universityId = editor.createUniversity(); const firstId = editor.createFacility({ type: "company", name: "City Labs", position: { x: 40, y: 50 }, icon: "company.svg", color: "#4776a8" }); expect(editor.state.city.facilities[0]?.companyId).toBeUndefined(); const companyId = editor.assignCompanyFacility(firstId)!;
    editor.updateCompany(companyId, { logo: "asset:enterprise/city-labs.png", description: "Shared company introduction", marketValue: 128.5, marketValueRank: 7.4, alumniUniversityId: universityId, tags: [" Technology ", "Technology", "Public"] }); expect(editor.state.city.companies[0]).toEqual({ id: companyId, name: "City Labs", logo: "asset:enterprise/city-labs.png", description: "Shared company introduction", marketValue: 128.5, marketValueRank: 1, alumniUniversityId: universityId, tags: ["Technology", "Public"] }); expect(editor.state.city.facilities[0]).toMatchObject({ name: "", companyId, isCompanyHeadquarters: true });
    const secondId = editor.createFacility({ type: "company", name: "", position: { x: 80, y: 50 }, icon: "company.svg", color: "#4776a8" }); editor.assignCompanyFacility(secondId, companyId); editor.updateFacility(secondId, { description: "North office" }); expect(editor.state.city.companies).toHaveLength(1); expect(editor.state.city.facilities.find((facility) => facility.id === secondId)).toMatchObject({ name: "", description: "North office", companyId, isCompanyHeadquarters: false }); editor.setCompanyHeadquarters(secondId, true); expect(editor.state.city.facilities.filter((facility) => facility.companyId === companyId && facility.isCompanyHeadquarters).map((facility) => facility.id)).toEqual([secondId]); editor.setCompanyHeadquarters(secondId, false); expect(editor.state.city.facilities.filter((facility) => facility.companyId === companyId && facility.isCompanyHeadquarters)).toHaveLength(0); editor.undo(); expect(editor.state.city.facilities.find((facility) => facility.id === secondId)?.isCompanyHeadquarters).toBe(true); editor.undo(); expect(editor.state.city.facilities.find((facility) => facility.id === firstId)?.isCompanyHeadquarters).toBe(true); editor.redo(); editor.select({ kind: "facility", id: secondId }); editor.deleteSelected(); expect(editor.state.city.facilities.find((facility) => facility.id === firstId)?.isCompanyHeadquarters).toBe(false); editor.undo();
    editor.updateCompany(companyId, { alumniUniversityId: "missing-university" }); expect(editor.state.city.companies[0]?.alumniUniversityId).toBe(universityId);
  });

  it("re-ranks all companies and representative profiles through update undo and redo", () => {
    const data = city(); data.companies = [
      { ...createEmptyCompany("a"), name: "A", marketValue: 100, marketValueRank: 9 },
      { ...createEmptyCompany("b"), name: "B", marketValue: 50, marketValueRank: 1 },
      { ...createEmptyCompany("c"), name: "C", marketValue: null, marketValueRank: 3 },
    ];
    data.facilities = data.companies.map((company, index) => ({ id: `location-${company.id}`, type: "company", name: company.name, position: { x: index, y: 0 }, icon: "", color: "#000000", companyId: company.id }));
    const editor = new Editor(data); expect(data.companies.map((company) => company.marketValueRank)).toEqual([1, 2, null]); expect(data.facilities.map((facility) => facility.company?.marketValueRank)).toEqual([1, 2, null]); editor.commands.clear();
    editor.updateCompany("c", { marketValue: 200, marketValueRank: 99 }); expect(data.companies.map((company) => company.marketValueRank)).toEqual([2, 3, 1]); expect(data.facilities.map((facility) => facility.company?.marketValueRank)).toEqual([2, 3, 1]);
    editor.undo(); expect(data.companies.map((company) => company.marketValueRank)).toEqual([1, 2, null]); editor.redo(); expect(data.companies.map((company) => company.marketValueRank)).toEqual([2, 3, 1]);
  });

  it("creates and edits generated buildings as one multi-selection", () => {
    const editor = new Editor(city()); const footprint = (x: number) => ({ outer: [{ x, y: 0 }, { x: x + 20, y: 0 }, { x: x + 20, y: 12 }, { x, y: 12 }], holes: [] }); const input = (x: number) => ({ footprint: footprint(x), type: "residential" as const, subtype: "", floors: 3, height: 10, style: "modern" as const, name: "" }); const ids = editor.createBuildings([input(0), input(30), input(60)])!;
    expect(editor.selection).toEqual({ kind: "building-multi", ids }); expect(editor.state.city.buildings).toHaveLength(3);
    editor.updateBuildings(ids, { type: "commercial", floors: 8, height: 27.5, style: "classical", subtype: "Arcade" }); expect(editor.state.city.buildings.every((building) => building.type === "commercial" && building.floors === 8 && building.height === 27.5 && building.style === "classical" && building.subtype === "Arcade")).toBe(true);
    editor.undo(); expect(editor.state.city.buildings.every((building) => building.type === "residential")).toBe(true); editor.redo();
    editor.deleteSelected(); expect(editor.state.city.buildings).toEqual([]); editor.undo(); expect(editor.state.city.buildings).toHaveLength(3); expect(editor.selection).toBeNull();
  });

  it("resizes both radii of a ring building with undo support", () => {
    const editor = new Editor(city()); const id = editor.createBuilding({ footprint: createBuildingPreset("ring", { x: 100, y: 100 }, 80, 40), type: "office", subtype: "Campus", floors: 4, height: 18, style: "modern" })!;
    editor.resizeRingBuilding(id, 50, 28); expect(ringFootprintRadii(editor.state.city.buildings[0]!.footprint)).toMatchObject({ outerRadius: 50, innerRadius: 28 }); editor.undo(); expect(ringFootprintRadii(editor.state.city.buildings[0]!.footprint)).toMatchObject({ outerRadius: 40, innerRadius: 20 });
  });
});
