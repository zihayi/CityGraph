import { afterEach, describe, expect, it, vi } from "vitest";
import { createNewCity } from "../model/mapGenerator";
import { SaveManager } from "./SaveManager";
import { roadIdentityGroupEdges } from "../editor/RoadIdentity";
import { createEmptyUniversity, createEmptyUniversityProfile, defaultFacilityColor, facilityDefaultColor } from "../model/City";

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
    city.waters[0]!.name = "Mirror Lake";
    city.roadNodes.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 300, y: 0 }, { id: "d", x: 400, y: 0 });
    city.roads.push({ id: "main", name: "Main", category: "normal", subtype: "small", width: 8, segmentIds: ["edge"] });
    city.roads.push({ id: "main-2", name: "Main", category: "normal", subtype: "small", width: 8, segmentIds: ["edge-2"] });
    city.roadEdges.push({ id: "edge", roadId: "main", name: "Main", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } });
    city.roadEdges.push({ id: "edge-2", roadId: "main-2", name: "Main", startNodeId: "c", endNodeId: "d", structure: "ground", level: 0, geometry: { type: "line" } });
    city.buildings.push({ id: "building", footprint: { outer: [{ x: 20, y: 30 }, { x: 40, y: 30 }, { x: 40, y: 50 }, { x: 20, y: 50 }], holes: [[{ x: 26, y: 36 }, { x: 26, y: 44 }, { x: 34, y: 44 }, { x: 34, y: 36 }]] }, type: "residential", subtype: "Apartment", floors: 4, height: 14, style: "chinese" });
    city.roads[0]!.description = "Old market route"; city.buildings[0]!.description = "A beloved corner shop";
    city.labels.push({ id: "label", x: 20, y: 30, text: "Center", type: "custom" });
    city.facilities.push({ id: "facility", type: "college", name: "College", position: { x: 42, y: 38 }, icon: "college.svg", color: "#b84a62", universityZoneId: "zone" });
    city.universities.push({ ...createEmptyUniversity("university"), name: "城市大学", englishName: "City University", logo: "data:image/png;base64,AA==", motto: "Learn and build", foundedYear: 1952, type: "comprehensive", description: "Founded beside the river", tags: ["Engineering"], alumniCompanies: [{ id: "company", name: "City Labs", logo: "", notes: "Urban systems" }] });
    city.zones.push({ id: "zone", name: "Main Campus", type: "education", polygon: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 40, y: 60 }], source: "custom", opacity: 0.45, color: "#9fbfd0", icon: "graduation-cap", iconColor: "#fff4d0", iconOpacity: 0.65, universityId: "university" });
    city.zones.push({ id: "school", name: "附属小学", type: "education", polygon: [{ x: 100, y: 0 }, { x: 180, y: 0 }, { x: 140, y: 60 }], source: "custom", opacity: 0.45, educationLevel: "primary", affiliatedUniversityId: "university" }); city.facilities[0]!.affiliatedUniversityId = "university"; city.facilities[0]!.universityAffiliationKind = "facility";
    const camera = { x: 10, y: 20, zoom: 0.5, rotation: 0.83 };
    await new SaveManager().saveAs("Lake City", city, camera);
    const folder = saves.directories.get("Lake City");
    expect([...folder!.files.keys()].sort()).toEqual(["buildings.json", "facilities.json", "map.json", "metadata.json", "roads.json", "zones.json"]);
    expect(folder!.directories.has("assets")).toBe(true);

    const loaded = await new SaveManager().load();
    expect(loaded.city.name).toBe("Lake City");
    expect(loaded.city.waters).toEqual(city.waters);
    expect(loaded.city.roads[0]?.segmentIds).toEqual(["edge"]);
    expect(loaded.city.roadEdges[0]?.roadId).toBe("main");
    expect(roadIdentityGroupEdges(loaded.city, loaded.city.roadEdges[0]!)).toHaveLength(2);
    expect(loaded.city.buildings[0]).toEqual(city.buildings[0]); expect(JSON.parse(folder!.files.get("map.json")!.content).buildings).toBeUndefined(); expect(loaded.city.roads[0]?.description).toBe("Old market route"); expect(loaded.city.labels[0]?.text).toBe("Center");
    expect(loaded.city.zones[0]).toEqual(city.zones[0]);
    expect(loaded.city.zones[1]).toEqual(city.zones[1]);
    expect(loaded.city.universities[0]).toEqual(city.universities[0]);
    expect(loaded.city.facilities[0]).toEqual(city.facilities[0]);
    expect(loaded.camera.rotation).toBe(camera.rotation);
  });

  it("migrates version 9 university zone profiles into shared university records", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createNewCity({ name: "Legacy Campus", size: "small", terrain: "flat", lakeCount: 1 });
    city.zones.push({ id: "legacy-campus", name: "旧城大学", description: "Legacy description", type: "education", polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], source: "custom", opacity: 0.4, purpose: "university", university: { ...createEmptyUniversityProfile(), englishName: "Old City University", emblemDataUrl: "data:image/png;base64,AA==", motto: "Knowledge", foundedYear: 1948, universityType: "medical", alumniCompanies: ["Legacy Labs"] } });
    city.facilities.push({ id: "legacy-library", type: "library", name: "Library", position: { x: 20, y: 20 }, icon: "library.svg", color: "#557799", universityZoneId: "legacy-campus" });
    await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 }); const folder = saves.directories.get(city.name)!; const metadata = JSON.parse(folder.files.get("metadata.json")!.content); metadata.formatVersion = 9; folder.files.get("metadata.json")!.content = JSON.stringify(metadata); const zones = JSON.parse(folder.files.get("zones.json")!.content); delete zones.universities; folder.files.get("zones.json")!.content = JSON.stringify(zones);

    const loaded = await new SaveManager().load(); const university = loaded.city.universities[0]!; const campus = loaded.city.zones[0]!;
    expect(university).toMatchObject({ name: "旧城大学", englishName: "Old City University", foundedYear: 1948, type: "medical", motto: "Knowledge", alumniCompanies: [{ name: "Legacy Labs" }] });
    expect(campus).toMatchObject({ id: "legacy-campus", name: "旧城大学", universityId: university.id }); expect(campus.purpose).toBeUndefined(); expect(campus.university).toBeUndefined(); expect(loaded.city.facilities[0]?.universityZoneId).toBe(campus.id);
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
    city.busLines.push({ id: "bus-line", name: "B1", color: "#336699", loop: false, startTerminalId: "west-terminal", endTerminalId: "east-terminal", path: [{ roadEdgeId: "crosstown-edge", forward: true }], direction: "start-to-end", stopIds: ["central-stop"] });
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

  it("migrates version 8 terminal lines and normalizes their stop order", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createNewCity({ name: "Version Eight", size: "small", terrain: "flat", lakeCount: 1 });
    city.roadNodes.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }); city.roads.push({ id: "road", name: "Road", category: "normal", subtype: "small", width: 8, segmentIds: ["edge"] }); city.roadEdges.push({ id: "edge", roadId: "road", name: "Road", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } });
    city.busTerminals.push({ id: "start", name: "Start", position: { x: 0, y: 0 } }, { id: "end", name: "End", position: { x: 100, y: 0 } }); city.busLines.push({ id: "line", name: "Legacy", color: "#336699", loop: false, startTerminalId: "start", endTerminalId: "end", path: [{ roadEdgeId: "edge", forward: true }], direction: "start-to-end", stopIds: ["late", "early"] }); city.busStops.push(
      { id: "late", name: "Late", lineId: "line", roadEdgeId: "edge", fraction: 0.8, position: { x: 80, y: 0 }, side: "right" },
      { id: "early", name: "Early", lineId: "line", roadEdgeId: "edge", fraction: 0.2, position: { x: 20, y: 0 }, side: "left" },
    );
    await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 }); const folder = saves.directories.get(city.name)!; const metadata = JSON.parse(folder.files.get("metadata.json")!.content); metadata.formatVersion = 8; folder.files.get("metadata.json")!.content = JSON.stringify(metadata); const map = JSON.parse(folder.files.get("map.json")!.content); delete map.busLines[0].loop; folder.files.get("map.json")!.content = JSON.stringify(map);
    const loaded = await new SaveManager().load(); expect(loaded.city.busLines[0]).toMatchObject({ id: "line", loop: false, startTerminalId: "start", endTerminalId: "end", path: [{ roadEdgeId: "edge", forward: true }], stopIds: ["early", "late"] }); expect(loaded.city.busTerminals).toEqual(city.busTerminals); expect(loaded.city.busStops).toEqual(city.busStops);
  });

  it("round-trips a terminal-free fractional loop and its ordered stops", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createNewCity({ name: "Loop City", size: "small", terrain: "flat", lakeCount: 1 });
    city.roadNodes.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 100, y: 100 }, { id: "d", x: 0, y: 100 }); city.roads.push({ id: "road", name: "Circle", category: "normal", subtype: "small", width: 8, segmentIds: ["ab", "bc", "cd", "da"] }); city.roadEdges.push(
      { id: "ab", roadId: "road", name: "Circle", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } },
      { id: "bc", roadId: "road", name: "Circle", startNodeId: "b", endNodeId: "c", structure: "ground", level: 0, geometry: { type: "line" } },
      { id: "cd", roadId: "road", name: "Circle", startNodeId: "c", endNodeId: "d", structure: "ground", level: 0, geometry: { type: "line" } },
      { id: "da", roadId: "road", name: "Circle", startNodeId: "d", endNodeId: "a", structure: "ground", level: 0, geometry: { type: "line" } },
    );
    city.busLines.push({ id: "loop", name: "Circle", color: "#7b4fc9", loop: true, path: [{ roadEdgeId: "ab", forward: true, startFraction: 0.25 }, { roadEdgeId: "bc", forward: true }, { roadEdgeId: "cd", forward: true }, { roadEdgeId: "da", forward: true }, { roadEdgeId: "ab", forward: true, endFraction: 0.25 }], direction: "start-to-end", stopIds: ["east", "west"] }); city.busStops.push(
      { id: "east", name: "East", lineId: "loop", roadEdgeId: "bc", fraction: 0.5, position: { x: 100, y: 50 }, side: "right" },
      { id: "west", name: "West", lineId: "loop", roadEdgeId: "da", fraction: 0.5, position: { x: 0, y: 50 }, side: "left" },
    );
    await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 }); const folder = saves.directories.get(city.name)!; expect(JSON.parse(folder.files.get("metadata.json")!.content).formatVersion).toBe(10);
    const loaded = await new SaveManager().load(); expect(loaded.city.busTerminals).toEqual([]); expect(loaded.city.busLines).toEqual(city.busLines); expect(loaded.city.busStops).toEqual(city.busStops);
  });

  it("rejects version 9 loops with an open path or broken stop relations", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createNewCity({ name: "Invalid Loop", size: "small", terrain: "flat", lakeCount: 1 }); city.roadNodes.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 50, y: 100 }); city.roads.push({ id: "road", name: "Triangle", category: "normal", subtype: "small", width: 8, segmentIds: ["ab", "bc", "ca"] }); city.roadEdges.push({ id: "ab", roadId: "road", name: "Triangle", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } }, { id: "bc", roadId: "road", name: "Triangle", startNodeId: "b", endNodeId: "c", structure: "ground", level: 0, geometry: { type: "line" } }, { id: "ca", roadId: "road", name: "Triangle", startNodeId: "c", endNodeId: "a", structure: "ground", level: 0, geometry: { type: "line" } }); city.busLines.push({ id: "loop", name: "Loop", color: "#000000", loop: true, path: ["ab", "bc", "ca"].map((roadEdgeId) => ({ roadEdgeId, forward: true })), direction: "start-to-end", stopIds: ["one", "two"] }); city.busStops.push({ id: "one", name: "One", lineId: "loop", roadEdgeId: "ab", fraction: 0.25, position: { x: 25, y: 0 }, side: "right" }, { id: "two", name: "Two", lineId: "loop", roadEdgeId: "bc", fraction: 0.25, position: { x: 87.5, y: 25 }, side: "right" }); await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 });
    const mapFile = saves.directories.get(city.name)!.files.get("map.json")!; const validMap = JSON.parse(mapFile.content); const openMap = structuredClone(validMap); openMap.busLines[0].path.pop(); mapFile.content = JSON.stringify(openMap); await expect(new SaveManager().load()).rejects.toMatchObject({ code: "invalid" });
    const brokenMap = structuredClone(validMap); brokenMap.busStops.pop(); mapFile.content = JSON.stringify(brokenMap); await expect(new SaveManager().load()).rejects.toMatchObject({ code: "invalid" });
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

  it("rejects malformed university profile data", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createNewCity({ name: "Invalid University", size: "small", terrain: "flat", lakeCount: 1 }); city.zones.push({ id: "campus", type: "education", polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], source: "custom", opacity: 0.4, purpose: "university", university: createEmptyUniversityProfile() }); await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 });
    const file = saves.directories.get(city.name)!.files.get("zones.json")!; const document = JSON.parse(file.content); document.zones[0].university.foundedYear = "old"; file.content = JSON.stringify(document);
    await expect(new SaveManager().load()).rejects.toMatchObject({ code: "invalid" });
  });

  it("adds the default color when loading facilities saved before marker colors", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createNewCity({ name: "Legacy Facility", size: "small", terrain: "flat", lakeCount: 1 }); city.facilities.push({ id: "facility", type: "store", name: "Store", position: { x: 12, y: 18 }, icon: "store.svg", color: defaultFacilityColor }); await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 });
    const file = saves.directories.get(city.name)!.files.get("facilities.json")!; const document = JSON.parse(file.content) as { facilities: Array<Record<string, unknown>> }; delete document.facilities[0]!.color; file.content = JSON.stringify(document);
    const loaded = await new SaveManager().load(); expect(loaded.city.facilities[0]?.color).toBe(facilityDefaultColor("store"));
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
