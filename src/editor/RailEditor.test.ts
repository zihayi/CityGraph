import { describe, expect, it } from "vitest";
import { sampleRailTrack } from "../geometry/RailGeometry";
import { createNewCity } from "../model/mapGenerator";
import { Editor } from "./Editor";

describe("Editor railways", () => {
  it("creates a snapped connected path and atomically undoes a station track split", () => {
    const editor = new Editor(createNewCity({ name: "Rail City", size: "small", terrain: "flat", lakeCount: 1 })); const tracks = editor.createRailTrackPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }], "ground", 1)!;
    const extension = editor.createRailTrackPath([{ x: 200.5, y: 0 }, { x: 300, y: 0 }], "elevated", 1)!; const city = editor.state.city; expect(city.railTracks!.find((track) => track.id === extension[0])?.startNodeId).toBe(city.railTracks!.find((track) => track.id === tracks[1])?.endNodeId);
    const west = editor.createRailStation("West", { nodeId: city.railTracks![0]!.startNodeId })!; const east = editor.createRailStation("East", { nodeId: city.railTracks![1]!.endNodeId })!; const lineId = editor.createRailLine({ name: "Main Line", color: "#336699", stationIds: [west, east], loop: false })!; expect(city.railLines![0]?.path.map((step) => step.trackId)).toEqual(tracks);
    editor.commands.clear(); const before = structuredClone(city); const stationId = editor.createRailStation("Central", { trackId: tracks[0]!, point: { x: 40, y: 25 } })!; expect(city.railNodes).toHaveLength(before.railNodes!.length + 1); expect(city.railTracks).toHaveLength(before.railTracks!.length + 1); expect(city.railStations!.find((station) => station.id === stationId)?.nodeId).toBe(city.railTracks!.find((track) => track.id === tracks[0])?.endNodeId); expect(city.railLines!.find((line) => line.id === lineId)?.path).toHaveLength(3);
    const after = structuredClone(city); editor.undo(); expect(city).toEqual(before); expect(editor.commands.canUndo).toBe(false); editor.redo(); expect(city).toEqual(after);
  });

  it("reroutes or removes dependent lines when railway entities are deleted", () => {
    const editor = new Editor(createNewCity({ name: "Cleanup", size: "small", terrain: "flat", lakeCount: 1 })); editor.createRailTrackPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }]); const city = editor.state.city; const west = editor.createRailStation("West", { nodeId: city.railNodes![0]!.id })!; const east = editor.createRailStation("East", { nodeId: city.railNodes![2]!.id })!; editor.createRailLine({ name: "Main", color: "#112233", stationIds: [west, east], loop: false }); editor.commands.clear(); editor.select({ kind: "rail-track", id: city.railTracks![0]!.id }); editor.deleteSelected(); expect(city.railLines).toEqual([]); editor.undo(); expect(city.railLines).toHaveLength(1);
  });

  it("keeps train and metro topology isolated even at identical coordinates", () => {
    const editor = new Editor(createNewCity({ name: "Dual Rail", size: "small", terrain: "flat", lakeCount: 1 }));
    const trainTracks = editor.createRailTrackPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], "ground", 12, "train")!;
    const metroTracks = editor.createRailTrackPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], "tunnel", 12, "metro")!;
    const city = editor.state.city; expect(city.railNodes).toHaveLength(4); expect(city.railTracks!.find((track) => track.id === trainTracks[0])?.system).toBe("train"); expect(city.railTracks!.find((track) => track.id === metroTracks[0])?.system).toBe("metro");
    expect(city.railTracks!.find((track) => track.id === metroTracks[0])?.structure).toBe("ground");
    const trainStation = editor.createRailStation("Train", { nodeId: city.railTracks!.find((track) => track.id === trainTracks[0])!.startNodeId }, "train")!;
    const metroStation = editor.createRailStation("Metro", { nodeId: city.railTracks!.find((track) => track.id === metroTracks[0])!.startNodeId }, "metro")!;
    expect(editor.createRailLine({ system: "metro", name: "Invalid", color: "#334455", stationIds: [trainStation, metroStation], loop: false })).toBeUndefined();
  });

  it("creates curved high-speed track and preserves its shape when adding a station", () => {
    const editor = new Editor(createNewCity({ name: "Curved Rail", size: "small", terrain: "flat", lakeCount: 1 })); const control = { x: 50, y: 100 };
    const trackId = editor.createRailTrackPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], "elevated", 1, "train", [{ type: "bezier", controlPoints: [control] }])![0]!; const city = editor.state.city; expect(city.railTracks?.find((track) => track.id === trackId)?.geometry).toEqual({ type: "bezier", controlPoints: [control] }); editor.commands.clear();
    const before = structuredClone(city); expect(editor.createRailStation("Curve Station", { trackId, point: { x: 50, y: 50 } })).toBeDefined(); const tracks = city.railTracks!; expect(tracks).toHaveLength(2); expect(tracks.map((track) => track.geometry)).toEqual([{ type: "bezier", controlPoints: [{ x: 25, y: 50 }] }, { type: "bezier", controlPoints: [{ x: 75, y: 50 }] }]); const nodes = new Map(city.railNodes!.map((node) => [node.id, node])); const first = sampleRailTrack(tracks[0]!, nodes); const second = sampleRailTrack(tracks[1]!, nodes); expect(first.at(-1)).toEqual({ x: 50, y: 50 }); expect(second[0]).toEqual({ x: 50, y: 50 });
    editor.undo(); expect(city).toEqual(before); editor.redo(); expect(city.railTracks).toHaveLength(2);
  });

  it("rejects curved metro track geometry", () => {
    const editor = new Editor(createNewCity({ name: "Straight Metro", size: "small", terrain: "flat", lakeCount: 1 })); expect(editor.createRailTrackPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], "ground", 1, "metro", [{ type: "bezier", controlPoints: [{ x: 50, y: 50 }] }])).toBeUndefined(); expect(editor.state.city.railTracks).toEqual([]);
  });

  it("creates metro tracks, auto-named stations, and a line as one undoable operation", () => {
    const editor = new Editor(createNewCity({ name: "Metro City", size: "small", terrain: "flat", lakeCount: 1 }));
    const lineId = editor.createMetroLinePath({ name: "1号线", color: "#d9485f", points: [{ x: 0, y: 0 }, { x: 100, y: 20 }, { x: 200, y: 0 }], loop: false, stationNamePrefix: "地铁站" })!; const city = editor.state.city;
    expect(city.railNodes).toHaveLength(3); expect(city.railTracks).toHaveLength(2); expect(city.railTracks?.every((track) => track.system === "metro" && track.structure === "ground")).toBe(true);
    expect(city.railStations?.map((station) => station.name)).toEqual(["地铁站 1", "地铁站 2", "地铁站 3"]); expect(city.railLines?.find((line) => line.id === lineId)).toMatchObject({ system: "metro", name: "1号线", color: "#d9485f", stationIds: city.railStations?.map((station) => station.id), loop: false });
    editor.undo(); expect(city.railNodes).toEqual([]); expect(city.railTracks).toEqual([]); expect(city.railStations).toEqual([]); expect(city.railLines).toEqual([]);
    editor.redo(); expect(city.railLines).toHaveLength(1); expect(city.railStations).toHaveLength(3);
  });

  it("creates, extends, and inserts stations on a high-speed rail line atomically", () => {
    const editor = new Editor(createNewCity({ name: "High-Speed Rail City", size: "small", terrain: "flat", lakeCount: 1 }));
    const lineId = editor.createRailLinePath({ system: "train", structure: "elevated", name: "京海高铁", color: "#526c82", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }], loop: false, stationNamePrefix: "高铁站" })!; const city = editor.state.city;
    expect(city.railStations?.map((station) => station.name)).toEqual(["高铁站 1", "高铁站 2", "高铁站 3"]); expect(city.railTracks?.every((track) => track.system === "train" && track.structure === "elevated")).toBe(true); expect(city.railLines?.find((line) => line.id === lineId)).toMatchObject({ system: "train", name: "京海高铁" });
    expect(editor.extendRailLinePath(lineId, "end", [{ x: 300, y: 0 }], "高铁站", "tunnel")).toBe(true); expect(city.railTracks?.at(-1)?.structure).toBe("tunnel");
    const stationId = editor.addRailStationToLine(lineId, { x: 50, y: 2 }, "高铁站", 10)!; const splitTracks = city.railTracks!.filter((track) => track.startNodeId === city.railStations!.find((station) => station.id === stationId)?.nodeId || track.endNodeId === city.railStations!.find((station) => station.id === stationId)?.nodeId); expect(splitTracks).toHaveLength(2); expect(splitTracks.every((track) => track.structure === "elevated")).toBe(true);
    const after = structuredClone(city); editor.undo(); expect(city.railStations?.some((station) => station.id === stationId)).toBe(false); editor.redo(); expect(city).toEqual(after);
  });

  it("snaps a new metro line to an existing station for transfers", () => {
    const editor = new Editor(createNewCity({ name: "Transfer City", size: "small", terrain: "flat", lakeCount: 1 }));
    editor.createMetroLinePath({ name: "1号线", color: "#cc3344", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], loop: false, stationNamePrefix: "地铁站" }); const city = editor.state.city; const transfer = city.railStations![1]!;
    editor.createMetroLinePath({ name: "2号线", color: "#2277cc", points: [{ x: 104, y: 3 }, { x: 100, y: 100 }], loop: false, stationNamePrefix: "地铁站" }, 10);
    expect(city.railStations).toHaveLength(3); expect(city.railLines).toHaveLength(2); expect(city.railLines![1]?.stationIds[0]).toBe(transfer.id); expect(city.railLines?.filter((line) => line.stationIds.includes(transfer.id)).map((line) => line.name)).toEqual(["1号线", "2号线"]);
    expect(city.railTracks![1]?.startNodeId).toBe(transfer.nodeId);
  });

  it("extends either end of an existing metro line as one undoable operation", () => {
    const editor = new Editor(createNewCity({ name: "Metro Extension", size: "small", terrain: "flat", lakeCount: 1 }));
    const lineId = editor.createMetroLinePath({ name: "1号线", color: "#cc3344", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], loop: false, stationNamePrefix: "地铁站" })!; const city = editor.state.city; editor.commands.clear(); const before = structuredClone(city);
    expect(editor.extendMetroLinePath(lineId, "end", [{ x: 200, y: 0 }, { x: 300, y: 0 }], "地铁站")).toBe(true); const line = city.railLines!.find((candidate) => candidate.id === lineId)!;
    expect(line.stationIds.map((id) => city.railStations!.find((station) => station.id === id)?.name)).toEqual(["地铁站 1", "地铁站 2", "地铁站 3", "地铁站 4"]); expect(line.path).toHaveLength(3);
    const afterEnd = structuredClone(city); editor.undo(); expect(city).toEqual(before); editor.redo(); expect(city).toEqual(afterEnd);
    expect(editor.extendMetroLinePath(lineId, "start", [{ x: -100, y: 0 }], "地铁站")).toBe(true); expect(city.railLines![0]?.stationIds.map((id) => city.railStations!.find((station) => station.id === id)?.name)).toEqual(["地铁站 5", "地铁站 1", "地铁站 2", "地铁站 3", "地铁站 4"]);
  });

  it("inserts a new metro station into the clicked line segment and restores the split on undo", () => {
    const editor = new Editor(createNewCity({ name: "Metro Infill", size: "small", terrain: "flat", lakeCount: 1 }));
    const lineId = editor.createMetroLinePath({ name: "1号线", color: "#cc3344", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }], loop: false, stationNamePrefix: "地铁站" })!; const city = editor.state.city; editor.commands.clear(); const before = structuredClone(city);
    const stationId = editor.addMetroStationToLine(lineId, { x: 50, y: 4 }, "地铁站", 10)!; const line = city.railLines!.find((candidate) => candidate.id === lineId)!;
    expect(city.railTracks).toHaveLength(3); expect(city.railStations!.find((station) => station.id === stationId)).toMatchObject({ name: "地铁站 4", system: "metro" }); expect(line.stationIds[1]).toBe(stationId); expect(line.path).toHaveLength(3);
    const after = structuredClone(city); editor.undo(); expect(city).toEqual(before); editor.redo(); expect(city).toEqual(after);
  });
});
