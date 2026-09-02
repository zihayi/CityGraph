import { afterEach, describe, expect, it, vi } from "vitest";
import { createNewCity } from "../model/mapGenerator";
import { SaveManager } from "./SaveManager";
import { roadIdentityGroupEdges } from "../editor/RoadIdentity";
import { defaultFacilityColor } from "../model/City";

class MemoryFile {
  public content = "";
  public handle(): FileSystemFileHandle {
    return {
      createWritable: async () => ({ write: async (value: string) => { this.content = value; }, close: async () => undefined }),
      getFile: async () => ({ text: async () => this.content }),
    } as unknown as FileSystemFileHandle;
  }
}

class MemoryDirectory {
  public readonly files = new Map<string, MemoryFile>();
  public readonly directories = new Map<string, MemoryDirectory>();
  public handle(): FileSystemDirectoryHandle {
    const directory = this;
    return {
      kind: "directory",
      getDirectoryHandle: async (name: string) => {
        let directory = this.directories.get(name);
        if (!directory) { directory = new MemoryDirectory(); this.directories.set(name, directory); }
        return directory.handle();
      },
      getFileHandle: async (name: string) => {
        let file = this.files.get(name);
        if (!file) { file = new MemoryFile(); this.files.set(name, file); }
        return file.handle();
      },
      entries: async function* () { for (const [name, child] of directory.directories) yield [name, child.handle()] as [string, FileSystemDirectoryHandle]; },
      removeEntry: async (name: string) => { this.directories.delete(name); this.files.delete(name); },
    } as unknown as FileSystemDirectoryHandle;
  }
}

function installStorage(saves: MemoryDirectory) {
  const root = new MemoryDirectory(); const app = new MemoryDirectory(); root.directories.set("CityGraph", app); app.directories.set("saves", saves);
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { storage: { getDirectory: async () => root.handle() } } });
}

function installSaveFolder(folder: MemoryDirectory, name = "saved") { const saves = new MemoryDirectory(); saves.directories.set(name, folder); installStorage(saves); return saves; }

afterEach(() => { Reflect.deleteProperty(globalThis, "window"); Reflect.deleteProperty(globalThis, "navigator"); vi.useRealTimers(); });

describe("SaveManager", () => {
  it("writes a managed save and loads map, roads and camera", async () => {
    const saves = new MemoryDirectory(); installStorage(saves);
    const city = createNewCity({ name: "Lake City", size: "small", terrain: "lakes", lakeCount: 2 });
    city.roadNodes.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 300, y: 0 }, { id: "d", x: 400, y: 0 });
    city.roads.push({ id: "main", name: "Main", category: "normal", subtype: "small", width: 8, segmentIds: ["edge"] });
    city.roads.push({ id: "main-2", name: "Main", category: "normal", subtype: "small", width: 8, segmentIds: ["edge-2"] });
    city.roadEdges.push({ id: "edge", roadId: "main", name: "Main", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } });
    city.roadEdges.push({ id: "edge-2", roadId: "main-2", name: "Main", startNodeId: "c", endNodeId: "d", structure: "ground", level: 0, geometry: { type: "line" } });
    city.buildings.push({ id: "building", footprint: { outer: [{ x: 20, y: 30 }, { x: 40, y: 30 }, { x: 40, y: 50 }, { x: 20, y: 50 }], holes: [[{ x: 26, y: 36 }, { x: 26, y: 44 }, { x: 34, y: 44 }, { x: 34, y: 36 }]] }, type: "residential", subtype: "Apartment", floors: 4, height: 14, style: "chinese" });
    city.roads[0]!.description = "Old market route"; city.buildings[0]!.description = "A beloved corner shop";
    city.labels.push({ id: "label", x: 20, y: 30, text: "Center", type: "custom" });
    city.facilities.push({ id: "facility", type: "coffee-shop", name: "Manner Coffee", position: { x: 42, y: 38 }, icon: "coffee-shop.svg", color: "#b84a62" });
    city.zones.push({ id: "zone", name: "Campus", description: "Founded beside the river", type: "education", polygon: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 40, y: 60 }], source: "custom", opacity: 0.45, color: "#9fbfd0", icon: "graduation-cap", iconColor: "#fff4d0", iconOpacity: 0.65 });
    const camera = { x: 10, y: 20, zoom: 0.5, rotation: 0.83 };
    await new SaveManager().saveAs("Lake City", city, camera);
    const folder = saves.directories.get("Lake City");
    expect([...folder!.files.keys()].sort()).toEqual(["buildings.json", "facilities.json", "map.json", "metadata.json", "roads.json", "zones.json"]);
    expect(folder!.directories.has("assets")).toBe(true);

    const loaded = await new SaveManager().load();
    expect(loaded.city.name).toBe("Lake City");
    expect(loaded.city.waters).toHaveLength(2);
    expect(loaded.city.roads[0]?.segmentIds).toEqual(["edge"]);
    expect(loaded.city.roadEdges[0]?.roadId).toBe("main");
    expect(roadIdentityGroupEdges(loaded.city, loaded.city.roadEdges[0]!)).toHaveLength(2);
    expect(loaded.city.buildings[0]).toEqual(city.buildings[0]); expect(JSON.parse(folder!.files.get("map.json")!.content).buildings).toBeUndefined(); expect(loaded.city.roads[0]?.description).toBe("Old market route"); expect(loaded.city.labels[0]?.text).toBe("Center");
    expect(loaded.city.zones[0]).toEqual(city.zones[0]);
    expect(loaded.city.facilities[0]).toEqual(city.facilities[0]);
    expect(loaded.camera.rotation).toBe(camera.rotation);
  });

  it("round-trips bus relationships alongside legacy transit data", async () => {
    const saves = new MemoryDirectory(); installStorage(saves);
    const city = createNewCity({ name: "Connected Buses", size: "small", terrain: "flat", lakeCount: 1 });
    city.roadNodes.push({ id: "west-node", x: 100, y: 200 }, { id: "east-node", x: 500, y: 200 });
    city.roads.push({ id: "crosstown-road", name: "Crosstown Road", category: "normal", subtype: "medium", width: 14, segmentIds: ["crosstown-edge"] });
    city.roadEdges.push({ id: "crosstown-edge", roadId: "crosstown-road", name: "Crosstown Road", startNodeId: "west-node", endNodeId: "east-node", structure: "ground", level: 0, geometry: { type: "line" } });
    city.transitStations.push({ id: "legacy-station", x: 300, y: 100, type: "metro", name: "Central" });
    city.transitLines.push({ id: "legacy-line", name: "Metro One", color: 0x336699, stationIds: ["legacy-station"] });
    city.busTerminals.push({ id: "west-terminal", name: "West", position: { x: 100, y: 200 } }, { id: "east-terminal", name: "East", position: { x: 500, y: 200 } });
    city.busLines.push({ id: "bus-line", name: "B1", color: "#336699", startTerminalId: "west-terminal", endTerminalId: "east-terminal", path: [{ roadEdgeId: "crosstown-edge", forward: true }], direction: "start-to-end", stopIds: ["central-stop"] });
    city.busStops.push({ id: "central-stop", name: "Central", lineId: "bus-line", roadEdgeId: "crosstown-edge", fraction: 0.5, position: { x: 300, y: 200 }, side: "right" });

    await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 });

    const folder = saves.directories.get(city.name)!;
    const map = JSON.parse(folder.files.get("map.json")!.content);
    expect(map).toMatchObject({ busTerminals: city.busTerminals, busLines: city.busLines, busStops: city.busStops });
    const loaded = await new SaveManager().load();
    expect(loaded.city.busTerminals).toEqual(city.busTerminals);
    expect(loaded.city.busLines).toEqual(city.busLines);
    expect(loaded.city.busStops).toEqual(city.busStops);
    expect(loaded.city.busLines[0]?.startTerminalId).toBe(loaded.city.busTerminals[0]?.id);
    expect(loaded.city.busLines[0]?.endTerminalId).toBe(loaded.city.busTerminals[1]?.id);
    expect(loaded.city.busLines[0]?.stopIds).toEqual(loaded.city.busStops.map((stop) => stop.id));
    expect(loaded.city.busStops[0]?.lineId).toBe(loaded.city.busLines[0]?.id);
    expect(loaded.city.transitStations).toEqual(city.transitStations);
    expect(loaded.city.transitLines).toEqual(city.transitLines);
  });

  it("initializes missing bus fields without dropping transit or facilities", async () => {
    const saves = new MemoryDirectory(); installStorage(saves);
    const city = createNewCity({ name: "Pre-Bus Save", size: "small", terrain: "flat", lakeCount: 1 });
    city.transitStations.push({ id: "station", x: 20, y: 30, type: "train", name: "Old Station" });
    city.transitLines.push({ id: "line", name: "Old Line", color: 0x445566, stationIds: ["station"] });
    city.facilities.push({ id: "facility", type: "store", name: "Old Store", position: { x: 12, y: 18 }, icon: "store.svg", color: defaultFacilityColor });
    await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 });
    const mapFile = saves.directories.get(city.name)!.files.get("map.json")!;
    const map = JSON.parse(mapFile.content) as Record<string, unknown>;
    delete map.busTerminals; delete map.busLines; delete map.busStops; mapFile.content = JSON.stringify(map);

    const loaded = await new SaveManager().load();
    expect(loaded.city.busTerminals).toEqual([]);
    expect(loaded.city.busLines).toEqual([]);
    expect(loaded.city.busStops).toEqual([]);
    expect(loaded.city.transitStations).toEqual(city.transitStations);
    expect(loaded.city.transitLines).toEqual(city.transitLines);
    expect(loaded.city.facilities).toEqual(city.facilities);
  });

  it("rejects incompatible format versions without crashing", async () => {
    const folder = new MemoryDirectory();
    folder.files.set("metadata.json", Object.assign(new MemoryFile(), { content: JSON.stringify({ formatVersion: 99, saveName: "Future", updatedAt: "2026-01-01T00:00:00Z" }) }));
    folder.files.set("map.json", Object.assign(new MemoryFile(), { content: "{}" }));
    folder.files.set("roads.json", Object.assign(new MemoryFile(), { content: "{}" }));
    installSaveFolder(folder);
    await expect(new SaveManager().load()).rejects.toMatchObject({ code: "version", version: 99 });
  });

  it("rejects a malformed facilities document in the current format", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createNewCity({ name: "Invalid Facilities", size: "small", terrain: "flat", lakeCount: 1 }); await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 });
    saves.directories.get(city.name)!.files.get("facilities.json")!.content = "{}";
    await expect(new SaveManager().load()).rejects.toMatchObject({ code: "invalid" });
  });

  it("adds the default color when loading facilities saved before marker colors", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createNewCity({ name: "Legacy Facility", size: "small", terrain: "flat", lakeCount: 1 }); city.facilities.push({ id: "facility", type: "store", name: "Store", position: { x: 12, y: 18 }, icon: "store.svg", color: defaultFacilityColor }); await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 });
    const file = saves.directories.get(city.name)!.files.get("facilities.json")!; const document = JSON.parse(file.content) as { facilities: Array<Record<string, unknown>> }; delete document.facilities[0]!.color; file.content = JSON.stringify(document);
    const loaded = await new SaveManager().load(); expect(loaded.city.facilities[0]?.color).toBe(defaultFacilityColor);
  });

  it("migrates version 2 edge-based road saves", async () => {
    const folder = new MemoryDirectory();
    folder.files.set("metadata.json", Object.assign(new MemoryFile(), { content: JSON.stringify({ formatVersion: 2, saveName: "Legacy", mapName: "Legacy", updatedAt: "2026-01-01T00:00:00Z" }) }));
    folder.files.set("map.json", Object.assign(new MemoryFile(), { content: JSON.stringify({ mapSize: "small", worldBounds: { x: 0, y: 0, width: 100, height: 100 }, terrain: "flat", water: [], camera: { x: 0, y: 0, zoom: 1, rotation: 0 } }) }));
    folder.files.set("roads.json", Object.assign(new MemoryFile(), { content: JSON.stringify({ roadNodes: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }], roads: [{ id: "legacy", startNodeId: "a", endNodeId: "b", category: "normal", subtype: "small", width: 8, name: "Old Road", structure: "ground", level: 0, geometry: { type: "line" } }] }) }));
    installSaveFolder(folder);
    const loaded = await new SaveManager().load();
    expect(loaded.city.roads[0]).toMatchObject({ id: "road-legacy", name: "Old Road", segmentIds: ["legacy"] });
    expect(loaded.city.roadEdges[0]).toMatchObject({ id: "legacy", roadId: "road-legacy" });
    expect(loaded.city.roadEdges[0]?.name).toBe("Old Road");
  });

  it("restores missing edge names from version 3 logical roads", async () => {
    const folder = new MemoryDirectory();
    folder.files.set("metadata.json", Object.assign(new MemoryFile(), { content: JSON.stringify({ formatVersion: 3, saveName: "V3", mapName: "V3", updatedAt: "2026-01-01T00:00:00Z" }) }));
    folder.files.set("map.json", Object.assign(new MemoryFile(), { content: JSON.stringify({ mapSize: "small", worldBounds: { x: 0, y: 0, width: 100, height: 100 }, terrain: "flat", water: [], camera: { x: 0, y: 0, zoom: 1, rotation: 0 } }) }));
    folder.files.set("roads.json", Object.assign(new MemoryFile(), { content: JSON.stringify({ roadNodes: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }], roads: [{ id: "road", name: "Legacy Avenue", category: "normal", subtype: "small", width: 8, segmentIds: ["edge"] }], roadEdges: [{ id: "edge", roadId: "road", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } }] }) }));
    installSaveFolder(folder);
    const loaded = await new SaveManager().load(); expect(loaded.city.roadEdges[0]?.name).toBe("Legacy Avenue");
  });

  it("migrates rotated rectangle buildings from version 5", async () => { const folder = new MemoryDirectory(); folder.files.set("metadata.json", Object.assign(new MemoryFile(), { content: JSON.stringify({ formatVersion: 5, saveName: "Legacy Building", mapName: "Legacy Building", updatedAt: "2026-01-01T00:00:00Z" }) })); folder.files.set("map.json", Object.assign(new MemoryFile(), { content: JSON.stringify({ mapSize: "small", worldBounds: { x: 0, y: 0, width: 100, height: 100 }, terrain: "flat", water: [], camera: { x: 0, y: 0, zoom: 1, rotation: 0 }, buildings: [{ id: "old", x: 10, y: 20, width: 30, height: 10, rotation: Math.PI / 2, type: "office", name: "Tower" }] }) })); folder.files.set("roads.json", Object.assign(new MemoryFile(), { content: JSON.stringify({ roadNodes: [], roads: [], roadEdges: [] }) })); installSaveFolder(folder); const loaded = await new SaveManager().load(); expect(loaded.city.buildings[0]).toMatchObject({ id: "old", type: "office", floors: 1, height: 3, style: "modern" }); expect(loaded.city.buildings[0]!.footprint.outer[1]!.x).toBeCloseTo(10); expect(loaded.city.buildings[0]!.footprint.outer[1]!.y).toBeCloseTo(50); });

  it("uses a valid independent building document while an older metadata commit marker remains", async () => { const folder = new MemoryDirectory(); folder.files.set("metadata.json", Object.assign(new MemoryFile(), { content: JSON.stringify({ formatVersion: 5, saveName: "Interrupted", mapName: "Interrupted", updatedAt: "2026-01-01T00:00:00Z" }) })); folder.files.set("map.json", Object.assign(new MemoryFile(), { content: JSON.stringify({ mapSize: "small", worldBounds: { x: 0, y: 0, width: 100, height: 100 }, terrain: "flat", water: [], camera: { x: 0, y: 0, zoom: 1, rotation: 0 } }) })); folder.files.set("roads.json", Object.assign(new MemoryFile(), { content: JSON.stringify({ roadNodes: [], roads: [], roadEdges: [] }) })); folder.files.set("buildings.json", Object.assign(new MemoryFile(), { content: JSON.stringify({ buildings: [{ id: "safe", footprint: { outer: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], holes: [] }, type: "custom", subtype: "", floors: 1, height: 3, style: "custom" }] }) })); installSaveFolder(folder); const loaded = await new SaveManager().load(); expect(loaded.city.buildings.map((building) => building.id)).toEqual(["safe"]); });

  it("keeps automatic saves separate and prunes them by slot count", async () => {
    vi.useFakeTimers(); const saves = new MemoryDirectory(); installStorage(saves); const manager = new SaveManager(); const city = createNewCity({ name: "Rolling City", size: "small", terrain: "flat", lakeCount: 1 }); const camera = { x: 0, y: 0, zoom: 1, rotation: 0 };
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z")); await manager.saveAs("Rolling City", city, camera);
    for (let hour = 1; hour <= 3; hour += 1) { vi.setSystemTime(new Date(`2026-01-01T1${hour}:00:00Z`)); await manager.autoSave(city, camera, { maxSlots: 2, retentionDays: 30 }); }
    const metadata = await Promise.all([...saves.directories.values()].map(async (folder) => JSON.parse(folder.files.get("metadata.json")!.content)));
    expect(metadata.filter((value) => value.autosave)).toHaveLength(2); expect(metadata.filter((value) => !value.autosave)).toHaveLength(1); expect(saves.directories.has("Rolling City")).toBe(true);
  });
});
