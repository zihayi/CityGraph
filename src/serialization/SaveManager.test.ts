import { afterEach, describe, expect, it, vi } from "vitest";
import { createNewCity } from "../model/mapGenerator";
import { SaveManager } from "./SaveManager";
import { Editor } from "../editor/Editor";
import { roadIdentityGroupEdges } from "../editor/RoadIdentity";
import { createEmptyCompany, createEmptyHospital, createEmptyUniversity, createEmptyUniversityProfile, defaultEconomySettings, defaultFacilityColor, defaultLandscapingColor, defaultLandscapingOpacity, facilityDefaultColor } from "../model/City";
import { createBuildingPreset } from "../geometry/BuildingGeometry";
import { importOSM } from "./OSMImporter";
import neighborhood from "./fixtures/neighborhood.osm?raw";

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
      getFileHandle: async (name: string, options?: FileSystemGetFileOptions) => {
        let file = this.files.get(name);
        if (!file && !options?.create) throw new DOMException("File not found", "NotFoundError");
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
  return { root, app };
}

function installSaveFolder(folder: MemoryDirectory, name = "saved") { const saves = new MemoryDirectory(); saves.directories.set(name, folder); installStorage(saves); return saves; }

function createEmptyCity(name: string) { return createNewCity({ name, size: "small", terrain: "flat", lakeCount: 1 }); }

afterEach(() => { Reflect.deleteProperty(globalThis, "window"); Reflect.deleteProperty(globalThis, "navigator"); vi.useRealTimers(); });

describe("SaveManager", () => {
  it("saves a merged region into the existing slot and retains source tags and undo history", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createEmptyCity("Existing city"); const editor = new Editor(city); const manager = new SaveManager(); const camera = { x: 0, y: 0, zoom: 1, rotation: 0 };
    await manager.saveAs("Existing slot", city, camera);
    const source = importOSM(neighborhood).city; editor.importMapRegion(source, { x: 3000, y: 3000 });
    await manager.save(city, camera);
    expect(saves.directories.size).toBe(1); const loaded = await manager.load("Existing slot");
    expect(loaded.city.name).toBe("Existing city"); expect(loaded.city.osmAttribution).toBe(true);
    expect(loaded.city.buildings[0]!.osm).toEqual(source.buildings[0]!.osm);
    expect(loaded.city.roads).toEqual(city.roads); expect(loaded.city.roadEdges).toEqual(city.roadEdges);
    editor.undo(); expect(city.roads).toHaveLength(0); expect(city.osmAttribution).toBeUndefined();
  });
  it("round-trips an imported OSM map, its graph, polygons and geographic source", async () => {
    const saves = new MemoryDirectory(); installStorage(saves);
    const { city } = importOSM(neighborhood, "Imported neighborhood"); const manager = new SaveManager();
    await manager.saveAs("OSM", city, { x: 0, y: 0, zoom: 1, rotation: 0 });
    const loaded = await manager.load("OSM");
    expect(loaded.city.mapSource).toEqual(city.mapSource);
    expect(loaded.city.bounds).toEqual(city.bounds);
    for (const key of ["roads", "roadNodes", "roadEdges", "buildings", "waters", "parks", "facilities"] as const) expect(loaded.city[key]).toEqual(city[key]);
    const folder = saves.directories.get("OSM")!; const mapFile = folder.files.get("map.json")!;
    const invalid = JSON.parse(mapFile.content); invalid.mapSource.latitude = "bad"; mapFile.content = JSON.stringify(invalid);
    await expect(manager.load("OSM")).rejects.toMatchObject({ code: "invalid" });
  });

  it("writes a managed save and loads map, roads and camera", async () => {
    const saves = new MemoryDirectory(); installStorage(saves);
    const city = createNewCity({ name: "Lake City", size: "small", terrain: "lakes", lakeCount: 2 });
    city.waters[0]!.name = "Mirror Lake";
    city.roadNodes.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 300, y: 0 }, { id: "d", x: 400, y: 0 });
    city.roads.push({ id: "main", name: "Main", category: "normal", subtype: "small", width: 8, segmentIds: ["edge"] });
    city.roads.push({ id: "main-2", name: "Main", category: "normal", subtype: "small", width: 8, segmentIds: ["edge-2"] });
    city.roadEdges.push({ id: "edge", roadId: "main", name: "Main", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } });
    city.roadEdges.push({ id: "edge-2", roadId: "main-2", name: "Main", startNodeId: "c", endNodeId: "d", structure: "ground", level: 0, geometry: { type: "line" } });
    city.buildings.push({ id: "building", footprint: createBuildingPreset("ring", { x: 30, y: 40 }, 40, 20), type: "residential", subtype: "Apartment", floors: 4, height: 14, style: "chinese" });
    city.roads[0]!.description = "Old market route"; city.buildings[0]!.description = "A beloved corner shop";
    city.labels.push({ id: "label", x: 20, y: 30, text: "Center", type: "custom" });
    city.facilities.push({ id: "facility", type: "college", name: "College", position: { x: 42, y: 38 }, icon: "college.svg", color: "#b84a62", universityZoneId: "zone" });
    city.universities.push({ ...createEmptyUniversity("university"), name: "城市大学", englishName: "City University", logo: "data:image/png;base64,AA==", motto: "Learn and build", foundedYear: 1952, type: "comprehensive", description: "Founded beside the river", tags: ["Engineering"], operatingBudget: 128.5, alumniCompanies: [{ id: "company", name: "City Labs", logo: "", notes: "Urban systems" }] });
    city.universities[0]!.alumniCompanies[0]!.logo = `custom-logo:${"a".repeat(64)}.png`;
    city.companies.push({ ...createEmptyCompany("company"), name: "City Technologies", logo: "asset:enterprise/company.png", description: "Shared company introduction", marketValue: 528.6, marketValueRank: 12, alumniUniversityId: "university", tags: ["Technology", "Public"] }); city.facilities.push({ id: "company-facility", type: "company", name: "总部", description: "Headquarters office", position: { x: 300, y: 240 }, icon: "company.svg", color: "#4776a8", companyId: "company", isCompanyHeadquarters: true });
    city.zones.push({ id: "zone", name: "Main Campus", type: "education", polygon: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 40, y: 60 }], source: "custom", opacity: 0.45, color: "#9fbfd0", icon: "graduation-cap", iconColor: "#fff4d0", iconOpacity: 0.65, universityId: "university" });
    city.hospitals.push({ ...createEmptyHospital("hospital-profile"), name: "附属医院", englishName: "Affiliated Hospital", ranking: 6, foundedYear: 1918, grade: "三级甲等", hospitalType: "综合医院", beds: 4200, landArea: 740000, specialties: ["心血管内科"], description: "区域医疗中心", affiliatedUniversityId: "university" }); city.zones.push({ id: "school", name: "附属小学", type: "education", polygon: [{ x: 100, y: 0 }, { x: 180, y: 0 }, { x: 140, y: 60 }], source: "custom", opacity: 0.45, educationLevel: "primary", affiliatedUniversityId: "university" }); city.zones.push({ id: "hospital", name: "本部", type: "medical", polygon: [{ x: 200, y: 0 }, { x: 280, y: 0 }, { x: 240, y: 60 }], source: "custom", opacity: 0.45, affiliatedUniversityId: "university", hospitalId: "hospital-profile", hospitalCampusRole: "main", address: "中心路 1 号" }); city.facilities[0]!.affiliatedUniversityId = "university"; city.facilities[0]!.universityAffiliationKind = "facility";
    city.zones.push({ id: "tourism", name: "Lake Scenic Area", type: "tourism", polygon: [{ x: 300, y: 0 }, { x: 380, y: 0 }, { x: 340, y: 60 }], source: "custom", opacity: 0.45, color: "#d7bd8a", icon: "tourism", iconColor: "#9c743c" });
    city.parks.push({ id: "greenway", name: "River Greenway", points: [{ x: 10, y: 10 }, { x: 80, y: 10 }, { x: 80, y: 60 }, { x: 10, y: 60 }], source: "road-fill", color: "#4f8f55", opacity: 0.7 });
    city.parks.push({ id: "lake-island", name: "Lake Island", points: [{ x: 20, y: 20 }, { x: 60, y: 20 }, { x: 40, y: 50 }], source: "custom", waterId: city.waters[0]!.id, color: "#6a9b62", opacity: 0.8 });
    city.districts.push({ id: "central-district", name: "Central District", points: [{ x: 500, y: 100 }, { x: 700, y: 100 }, { x: 700, y: 300 }, { x: 500, y: 300 }] });
    const camera = { x: 10, y: 20, zoom: 0.5, rotation: 0.83 };
    const manager = new SaveManager(); const thumbnail = "data:image/webp;base64,AA==";
    await manager.saveAs("Lake City", city, camera, thumbnail);
    const folder = saves.directories.get("Lake City");
    expect([...folder!.files.keys()].sort()).toEqual(["ai.json", "buildings.json", "facilities.json", "map.json", "metadata.json", "roads.json", "zones.json"]);
    expect(folder!.directories.has("assets")).toBe(true);
    expect(JSON.parse(folder!.files.get("metadata.json")!.content).thumbnail).toBe(thumbnail);
    expect(await manager.listSaves()).toEqual([expect.objectContaining({ folderName: "Lake City", mapName: "Lake City", thumbnail })]);

    const loaded = await new SaveManager().load();
    expect(loaded.city.name).toBe("Lake City");
    expect(loaded.city.waters).toEqual(city.waters);
    expect(loaded.city.roads[0]?.segmentIds).toEqual(["edge"]);
    expect(loaded.city.roadEdges[0]?.roadId).toBe("main");
    expect(roadIdentityGroupEdges(loaded.city, loaded.city.roadEdges[0]!)).toHaveLength(2);
    expect(loaded.city.buildings[0]).toEqual(city.buildings[0]); expect(JSON.parse(folder!.files.get("map.json")!.content).buildings).toBeUndefined(); expect(loaded.city.roads[0]?.description).toBe("Old market route"); expect(loaded.city.labels[0]?.text).toBe("Center");
    expect(loaded.city.zones[0]).toEqual(city.zones[0]);
    expect(loaded.city.zones[1]).toEqual(city.zones[1]);
    expect(loaded.city.zones[2]).toEqual(city.zones[2]);
    expect(loaded.city.zones[3]).toEqual(city.zones[3]);
    expect(loaded.city.universities[0]).toEqual(city.universities[0]);
    expect(loaded.city.hospitals[0]).toEqual(city.hospitals[0]);
    expect(loaded.city.companies[0]).toEqual({ ...city.companies[0], marketValueRank: 1 }); expect(JSON.parse(folder!.files.get("facilities.json")!.content).companies[0].marketValueRank).toBe(1);
    expect(loaded.city.facilities[0]).toEqual(city.facilities[0]);
    expect(loaded.city.facilities[1]).toEqual(city.facilities[1]);
    expect(loaded.city.parks).toEqual(city.parks);
    expect(loaded.city.districts).toEqual(city.districts);
    expect(loaded.camera.rotation).toBe(camera.rotation);
  });

  it("round-trips AI history and defaults saves without ai.json", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createEmptyCity("AI City");
    city.aiConfig = { worldMode: "fictional", eventImportanceThreshold: 40 };
    city.cityEvents = [{ id: "event", timestamp: 1_000, gameDate: "2026-09-13", type: "company-created", category: "business", importance: 70, relatedEntityIds: ["company"], payload: { entityId: "company", name: "City Works" }, location: { x: 10, y: 20 } }];
    city.newsArticles = [{ id: "article", date: "2026-09-13", category: "business", headline: "City Works opens", summary: "A new company was registered.", body: "City Works was added to the city record.", importance: 70, sourceEventIds: ["event"], relatedEntityIds: ["company"], location: { x: 10, y: 20 } }];
    city.dailyNewsIssues = [{ id: "issue", date: "2026-09-13", createdAt: 2_000, articleIds: ["article"], sourceEventIds: ["event"], generator: "template" }];
    city.entityRelations = [{ id: "relation", fromEntityId: "company", toEntityId: "district", type: "located_in", description: "Registered in the central district" }];
    city.aiSnapshot = { cityId: city.id, capturedAt: 3_000, universities: [], campuses: [], hospitals: [], hospitalCampuses: [], companies: [], facilities: [], districts: [], roads: [], busLines: [], busStops: [], railLines: [], railStations: [] };

    await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 });
    const folder = saves.directories.get(city.name)!;
    expect(JSON.parse(folder.files.get("ai.json")!.content)).toMatchObject({ cityId: city.id, config: city.aiConfig, events: city.cityEvents, articles: city.newsArticles, issues: city.dailyNewsIssues, relations: city.entityRelations, snapshot: city.aiSnapshot });
    const loaded = (await new SaveManager().load()).city;
    expect(loaded).toMatchObject({ id: city.id, aiConfig: city.aiConfig, cityEvents: city.cityEvents, newsArticles: city.newsArticles, dailyNewsIssues: city.dailyNewsIssues, entityRelations: city.entityRelations, aiSnapshot: city.aiSnapshot });

    const aiFile = folder.files.get("ai.json")!; const validAI = aiFile.content;
    aiFile.content = JSON.stringify({ ...JSON.parse(validAI), config: { worldMode: "real", eventImportanceThreshold: 40 } });
    await expect(new SaveManager().load()).rejects.toMatchObject({ code: "invalid" });
    aiFile.content = validAI;
    folder.files.delete("ai.json");
    const legacy = (await new SaveManager().load()).city;
    expect(legacy).toMatchObject({ aiConfig: { worldMode: "fictional", eventImportanceThreshold: 25 }, cityEvents: [], newsArticles: [], dailyNewsIssues: [], entityRelations: [] });
    expect(legacy.aiSnapshot).toBeUndefined();
  });

  it("round-trips transport and recreation zones without changing the format version", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createEmptyCity("Rail City");
    city.zones.push({ id: "central-hsr", name: "Central Station", type: "high-speed-rail-station", polygon: [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 80 }, { x: 0, y: 80 }], source: "custom", opacity: 0.45, color: "#a7c2cb", icon: "high-speed-rail-station", iconColor: "#2f7580", iconOpacity: 1 });
    city.zones.push({ id: "central-train", name: "Central Train Station", type: "train-station", polygon: [{ x: 130, y: 0 }, { x: 230, y: 0 }, { x: 230, y: 80 }], source: "custom", opacity: 0.45, icon: "train-station" }, { id: "city-airport", name: "City Airport", type: "airport", polygon: [{ x: 240, y: 0 }, { x: 360, y: 0 }, { x: 360, y: 90 }], source: "custom", opacity: 0.45, icon: "airport" });
    for (const [index, type] of (["zoo", "amusement-park", "golf-course", "resort"] as const).entries()) city.zones.push({ id: type, name: type, type, polygon: [{ x: index * 20, y: 100 }, { x: index * 20 + 10, y: 100 }, { x: index * 20, y: 110 }], source: "custom", opacity: 0.45, icon: type });

    await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 });

    const folder = saves.directories.get(city.name)!;
    expect(JSON.parse(folder.files.get("metadata.json")!.content).formatVersion).toBe(14);
    expect(JSON.parse(folder.files.get("zones.json")!.content).zones).toEqual(city.zones);
    expect((await new SaveManager().load()).city.zones).toEqual(city.zones);
  });

  it("round-trips a custom finite canvas boundary", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createEmptyCity("Custom Canvas"); city.mapSize = "custom"; city.bounds = { x: -2500, y: -1500, width: 8000, height: 5000 };
    await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 });
    expect((await new SaveManager().load()).city).toMatchObject({ mapSize: "custom", bounds: city.bounds });
  });

  it("normalizes stale company ranks on save and load", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createEmptyCity("Ranked Companies"); city.companies = [
      { ...createEmptyCompany("a"), name: "A", marketValue: 100, marketValueRank: 8 },
      { ...createEmptyCompany("b"), name: "B", marketValue: 100, marketValueRank: 4 },
      { ...createEmptyCompany("c"), name: "C", marketValue: 50, marketValueRank: 1 },
      { ...createEmptyCompany("d"), name: "D", marketValue: null, marketValueRank: 2 },
    ];
    await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 }); const folder = saves.directories.get(city.name)!;
    expect(JSON.parse(folder.files.get("facilities.json")!.content).companies.map((company: { marketValueRank: number | null }) => company.marketValueRank)).toEqual([1, 1, 3, null]);
    expect((await new SaveManager().load()).city.companies.map((company) => company.marketValueRank)).toEqual([1, 1, 3, null]);
  });

  it("round-trips economy and GDP while defaulting old saves without inventing GDP", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createEmptyCity("Economy City"); city.economy = { currency: "EUR", monetaryUnit: "billion" }; city.districts.push({ id: "central", name: "Central", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], gdp: 42.5, gdpYear: 2025 });
    await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 }); const mapFile = saves.directories.get(city.name)!.files.get("map.json")!; const savedMap = JSON.parse(mapFile.content); expect(savedMap.economy).toEqual(city.economy);
    const loaded = await new SaveManager().load(); expect(loaded.city.economy).toEqual(city.economy); expect(loaded.city.districts[0]).toMatchObject({ gdp: 42.5, gdpYear: 2025 });
    delete savedMap.economy; delete savedMap.districts[0].gdp; delete savedMap.districts[0].gdpYear; mapFile.content = JSON.stringify(savedMap); const legacy = await new SaveManager().load(); expect(legacy.city.economy).toEqual(defaultEconomySettings); expect(legacy.city.districts[0]?.gdp).toBeUndefined(); expect(legacy.city.districts[0]?.gdpYear).toBeUndefined();
  });

  it("normalizes legacy parks without landscaping style fields", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createNewCity({ name: "Legacy Green", size: "small", terrain: "flat", lakeCount: 1 });
    city.parks.push({ id: "legacy-park", name: "Old Park", points: [{ x: 10, y: 10 }, { x: 80, y: 10 }, { x: 80, y: 60 }, { x: 10, y: 60 }], source: "custom", color: "#4f8f55", opacity: 0.7 });
    await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 }); const folder = saves.directories.get(city.name)!; const map = JSON.parse(folder.files.get("map.json")!.content); delete map.parks[0].source; delete map.parks[0].color; delete map.parks[0].opacity; folder.files.get("map.json")!.content = JSON.stringify(map);
    const loaded = await new SaveManager().load(); expect(loaded.city.parks[0]).toMatchObject({ id: "legacy-park", source: "custom", color: defaultLandscapingColor, opacity: defaultLandscapingOpacity });
  });

  it("migrates a legacy company facility into a shared company", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createNewCity({ name: "Legacy Company", size: "small", terrain: "flat", lakeCount: 1 });
    city.facilities.push({ id: "legacy-company", type: "company", name: "Old Company", position: { x: 20, y: 30 }, icon: "company.svg", color: "#4776a8" });
    await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 });
    const folder = saves.directories.get(city.name)!; const metadata = JSON.parse(folder.files.get("metadata.json")!.content); metadata.formatVersion = 11; folder.files.get("metadata.json")!.content = JSON.stringify(metadata); const file = folder.files.get("facilities.json")!; const facilities = JSON.parse(file.content); delete facilities.companies; facilities.facilities[0].company = { logo: "", marketValue: null, marketValueRank: null, tags: [] }; file.content = JSON.stringify(facilities);
    const loaded = await new SaveManager().load(); expect(loaded.city.companies[0]).toMatchObject({ name: "Old Company", logo: "", description: "", marketValue: null, marketValueRank: null, tags: [] }); expect(loaded.city.facilities[0]).toMatchObject({ companyId: "company-legacy-company", isCompanyHeadquarters: false, name: "Location" });
  });

  it("loads shared companies saved before introductions without inventing a headquarters", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createNewCity({ name: "Earlier Shared Company", size: "small", terrain: "flat", lakeCount: 1 }); city.companies.push({ ...createEmptyCompany("company"), name: "City Works" }); city.facilities.push({ id: "office", type: "company", name: "North Office", position: { x: 20, y: 30 }, icon: "company.svg", color: "#4776a8", companyId: "company", isCompanyHeadquarters: false }); await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 });
    const file = saves.directories.get(city.name)!.files.get("facilities.json")!; const document = JSON.parse(file.content); delete document.companies[0].description; file.content = JSON.stringify(document); const loaded = await new SaveManager().load(); expect(loaded.city.companies[0]?.description).toBe(""); expect(loaded.city.facilities[0]?.isCompanyHeadquarters).toBe(false);
  });

  it("migrates an embedded hospital profile into a shared hospital", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createNewCity({ name: "Legacy Hospital", size: "small", terrain: "flat", lakeCount: 1 }); city.zones.push({ id: "medical", name: "Old Hospital", type: "medical", polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], source: "custom", opacity: 0.4 }); await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 });
    const folder = saves.directories.get(city.name)!; const metadata = JSON.parse(folder.files.get("metadata.json")!.content); metadata.formatVersion = 11; folder.files.get("metadata.json")!.content = JSON.stringify(metadata); const file = folder.files.get("zones.json")!; const zones = JSON.parse(file.content); delete zones.hospitals; zones.zones[0].hospital = { englishName: "Old Hospital", ranking: 8, foundedYear: 1920, grade: "三级甲等", hospitalType: "综合医院", beds: 1200, landArea: 80000, specialties: ["心内科"], campuses: [{ id: "main", name: "东院区", address: "东路 1 号" }], description: "Legacy" }; file.content = JSON.stringify(zones);
    const loaded = await new SaveManager().load(); expect(loaded.city.hospitals[0]).toMatchObject({ id: "hospital-medical", name: "Old Hospital", ranking: 8 }); expect(loaded.city.zones[0]).toMatchObject({ hospitalId: "hospital-medical", hospitalCampusRole: "main", name: "东院区", address: "东路 1 号" }); expect(loaded.city.zones[0]?.hospital).toBeUndefined();
  });

  it("loads a selected save instead of always choosing the newest", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    const saves = new MemoryDirectory(); installStorage(saves); const manager = new SaveManager();
    await manager.saveAs("First", createNewCity({ name: "First City", size: "small", terrain: "flat", lakeCount: 1 }), { x: 0, y: 0, zoom: 1, rotation: 0 });
    vi.setSystemTime(new Date("2026-01-02T10:00:00Z"));
    await manager.saveAs("Second", createNewCity({ name: "Second City", size: "small", terrain: "flat", lakeCount: 1 }), { x: 0, y: 0, zoom: 1, rotation: 0 });
    expect((await manager.listSaves()).map((slot) => slot.folderName)).toEqual(["Second", "First"]);
    expect((await manager.load("First")).city.name).toBe("First City");
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
    city.busLines.push({ id: "open", name: "Cross Town", color: "#2877bb", loop: false, path: [{ roadEdgeId: "ab", forward: true, startFraction: 0.2 }, { roadEdgeId: "bc", forward: true, endFraction: 0.5 }], direction: "start-to-end", stopIds: ["south", "north-east"] }); city.busStops.push({ id: "south", name: "South", lineId: "open", roadEdgeId: "ab", fraction: 0.2, position: { x: 20, y: 0 }, side: "right" }, { id: "north-east", name: "North East", lineId: "open", roadEdgeId: "bc", fraction: 0.5, position: { x: 100, y: 50 }, side: "right" });
    await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 }); const folder = saves.directories.get(city.name)!; expect(JSON.parse(folder.files.get("metadata.json")!.content).formatVersion).toBe(14);
    const loaded = await new SaveManager().load(); expect(loaded.city.busTerminals).toEqual([]); expect(loaded.city.busLines).toEqual(city.busLines); expect(loaded.city.busStops).toEqual(city.busStops);
    const metadata = JSON.parse(folder.files.get("metadata.json")!.content); metadata.formatVersion = 10; folder.files.get("metadata.json")!.content = JSON.stringify(metadata); const loadedV10 = await new SaveManager().load(); expect(loadedV10.city.busLines).toEqual(city.busLines);
  });

  it("round-trips a terminal-free reverse partial route extended at both ends", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createEmptyCity("Extended Buses");
    city.roadNodes.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 });
    city.roads.push({ id: "road", name: "Main", category: "normal", subtype: "small", width: 8, segmentIds: ["ab"] });
    city.roadEdges.push({ id: "ab", roadId: "road", name: "Main", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } });
    const editor = new Editor(city);
    const lineId = editor.createBusRoute({ name: "Cross Town", color: "#2877bb", loop: false, path: [{ roadEdgeId: "ab", forward: false, startFraction: 0.75, endFraction: 0.25 }], stops: [0.75, 0.5, 0.25].map((fraction, index) => ({ name: `Stop ${index + 1}`, roadEdgeId: "ab", fraction, position: { x: fraction * 100, y: 0 }, side: index === 1 ? "left" : "right" })) })!;
    expect(lineId).toEqual(expect.any(String));
    const original = structuredClone(city.busLines[0]!); const originalStops = structuredClone(city.busStops);
    const start = { name: "East", roadEdgeId: "ab", fraction: 0.9, position: { x: 90, y: 0 }, side: "left" as const };
    const end = { name: "West", roadEdgeId: "ab", fraction: 0.1, position: { x: 10, y: 0 }, side: "right" as const };
    const startId = editor.extendBusRoute(lineId, "start", start); const endId = editor.extendBusRoute(lineId, "end", end);
    expect(startId).toEqual(expect.any(String)); expect(endId).toEqual(expect.any(String));
    const startStop = { ...start, id: startId, lineId }; const endStop = { ...end, id: endId, lineId };

    await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 });
    const loaded = await new SaveManager().load();
    expect(loaded.city.busTerminals).toEqual([]);
    expect(loaded.city.busLines).toEqual([{ ...original, path: [
      { roadEdgeId: "ab", forward: false, startFraction: 0.9, endFraction: 0.75 },
      { roadEdgeId: "ab", forward: false, startFraction: 0.75, endFraction: 0.25 },
      { roadEdgeId: "ab", forward: false, startFraction: 0.25, endFraction: 0.1 },
    ], stopIds: [startId, ...original.stopIds, endId] }]);
    expect(loaded.city.busStops).toEqual([...originalStops, startStop, endStop]);
    expect(loaded.city.busLines[0]!.stopIds.map((id) => loaded.city.busStops.find((stop) => stop.id === id))).toEqual([startStop, ...originalStops, endStop]);
  });

  it("rejects loops with an open path or broken stop relations", async () => {
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

  it("rejects malformed hospital profile data", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createNewCity({ name: "Invalid Hospital", size: "small", terrain: "flat", lakeCount: 1 }); city.hospitals.push({ ...createEmptyHospital("hospital"), name: "Hospital" }); city.zones.push({ id: "hospital-zone", name: "Main", type: "medical", polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], source: "custom", opacity: 0.4, hospitalId: "hospital", hospitalCampusRole: "main" }); await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 });
    const file = saves.directories.get(city.name)!.files.get("zones.json")!; const document = JSON.parse(file.content); document.hospitals[0].beds = "many"; file.content = JSON.stringify(document);
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

  it("round-trips version 14 passenger railway systems and the metro logo in map.json", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createEmptyCity("Passenger Rail"); city.metroLogo = "data:image/png;base64,AA=="; city.railNodes = [{ id: "a", system: "metro", x: 0, y: 0 }, { id: "b", system: "metro", x: 100, y: 0 }, { id: "c", system: "metro", x: 200, y: 0 }, { id: "train-a", system: "train", x: 0, y: 100 }, { id: "train-b", system: "train", x: 100, y: 100 }]; city.railTracks = [{ id: "ab", system: "metro", startNodeId: "a", endNodeId: "b", structure: "ground" }, { id: "bc", system: "metro", startNodeId: "b", endNodeId: "c", structure: "tunnel" }, { id: "train-curve", system: "train", startNodeId: "train-a", endNodeId: "train-b", structure: "elevated", geometry: { type: "bezier", controlPoints: [{ x: 50, y: 40 }] } }]; city.railStations = [{ id: "west", system: "metro", name: "West", nodeId: "a" }, { id: "central", system: "metro", name: "Central", nodeId: "b" }, { id: "east", system: "metro", name: "East", nodeId: "c" }]; city.railLines = [{ id: "red", system: "metro", name: "Red Line", color: "#cc3344", stationIds: ["west", "central", "east"], path: [{ trackId: "ab", forward: true }, { trackId: "bc", forward: true }], loop: false }];
    await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 }); const folder = saves.directories.get(city.name)!; const metadata = JSON.parse(folder.files.get("metadata.json")!.content); const map = JSON.parse(folder.files.get("map.json")!.content); expect(metadata.formatVersion).toBe(14); expect(map).toMatchObject({ metroLogo: city.metroLogo, railNodes: city.railNodes, railTracks: city.railTracks, railStations: city.railStations, railLines: city.railLines }); const loaded = await new SaveManager().load(); expect(loaded.city.metroLogo).toBe(city.metroLogo); expect(loaded.city.railNodes).toEqual(city.railNodes); expect(loaded.city.railTracks).toEqual(city.railTracks); expect(loaded.city.railStations).toEqual(city.railStations); expect(loaded.city.railLines).toEqual(city.railLines);
  });

  it("migrates version 13 passenger railway data to the train system", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createEmptyCity("Legacy Passenger Rail"); city.railNodes = [{ id: "a", system: "train", x: 0, y: 0 }, { id: "b", system: "train", x: 100, y: 0 }]; city.railTracks = [{ id: "ab", system: "train", startNodeId: "a", endNodeId: "b", structure: "ground" }]; city.railStations = [{ id: "west", system: "train", name: "West", nodeId: "a" }, { id: "east", system: "train", name: "East", nodeId: "b" }]; city.railLines = [{ id: "red", system: "train", name: "Red", color: "#cc3344", stationIds: ["west", "east"], path: [{ trackId: "ab", forward: true }], loop: false }]; await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 }); const folder = saves.directories.get(city.name)!; const metadata = JSON.parse(folder.files.get("metadata.json")!.content); metadata.formatVersion = 13; folder.files.get("metadata.json")!.content = JSON.stringify(metadata); const mapFile = folder.files.get("map.json")!; const map = JSON.parse(mapFile.content); delete map.metroLogo; for (const collection of [map.railNodes, map.railTracks, map.railStations, map.railLines]) for (const item of collection) delete item.system; mapFile.content = JSON.stringify(map); const loaded = await new SaveManager().load(); expect(loaded.city.metroLogo).toBe(""); expect(loaded.city.railNodes?.every((item) => item.system === "train")).toBe(true); expect(loaded.city.railTracks?.every((item) => item.system === "train")).toBe(true); expect(loaded.city.railStations?.every((item) => item.system === "train")).toBe(true); expect(loaded.city.railLines?.every((item) => item.system === "train")).toBe(true);
  });

  it("migrates version 12 and earlier saves with empty railway collections", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createEmptyCity("Legacy Rail"); city.railNodes = [{ id: "ignored", system: "train", x: 0, y: 0 }]; await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 }); const folder = saves.directories.get(city.name)!; const metadata = JSON.parse(folder.files.get("metadata.json")!.content); metadata.formatVersion = 12; folder.files.get("metadata.json")!.content = JSON.stringify(metadata); const loaded = await new SaveManager().load(); expect(loaded.city.railNodes).toEqual([]); expect(loaded.city.railTracks).toEqual([]); expect(loaded.city.railStations).toEqual([]); expect(loaded.city.railLines).toEqual([]);
  });

  it("rejects invalid version 13 railway IDs, references, colors, continuity, and station order", async () => {
    const saves = new MemoryDirectory(); installStorage(saves); const city = createEmptyCity("Invalid Rail"); city.railNodes = [{ id: "a", system: "train", x: 0, y: 0 }, { id: "b", system: "train", x: 100, y: 0 }, { id: "c", system: "train", x: 200, y: 0 }]; city.railTracks = [{ id: "ab", system: "train", startNodeId: "a", endNodeId: "b", structure: "ground" }, { id: "bc", system: "train", startNodeId: "b", endNodeId: "c", structure: "ground" }]; city.railStations = [{ id: "west", system: "train", name: "West", nodeId: "a" }, { id: "central", system: "train", name: "Central", nodeId: "b" }, { id: "east", system: "train", name: "East", nodeId: "c" }]; city.railLines = [{ id: "line", system: "train", name: "Line", color: "#336699", stationIds: ["west", "central", "east"], path: [{ trackId: "ab", forward: true }, { trackId: "bc", forward: true }], loop: false }]; await new SaveManager().saveAs(city.name, city, { x: 0, y: 0, zoom: 1, rotation: 0 }); const mapFile = saves.directories.get(city.name)!.files.get("map.json")!; const valid = JSON.parse(mapFile.content);
    const mutations: Array<(map: typeof valid) => void> = [
      (map) => { map.railLines[0].id = ""; },
      (map) => { map.railNodes[1].id = "a"; },
      (map) => { map.railTracks[0].startNodeId = "missing"; },
      (map) => { map.railStations[0].nodeId = "missing"; },
      (map) => { map.railLines[0].stationIds[1] = "missing"; },
      (map) => { map.railLines[0].path[1].trackId = "missing"; },
      (map) => { map.railLines[0].path[1].forward = false; },
      (map) => { map.railLines[0].stationIds = ["west", "east", "central"]; },
      (map) => { map.railLines[0].color = "red"; },
      (map) => { map.railTracks[0].system = "metro"; },
      (map) => { map.railTracks[0].geometry = { type: "bezier", controlPoints: [{ x: 50, y: 50 }] }; map.railTracks[0].system = "metro"; },
      (map) => { map.railTracks[0].geometry = { type: "bezier", controlPoints: [] }; },
    ];
    for (const mutate of mutations) { const invalid = structuredClone(valid); mutate(invalid); mapFile.content = JSON.stringify(invalid); await expect(new SaveManager().load()).rejects.toMatchObject({ code: "invalid" }); }
  });

  it("keeps automatic saves separate and prunes them by slot count", async () => {
    vi.useFakeTimers(); const saves = new MemoryDirectory(); installStorage(saves); const manager = new SaveManager(); const city = createNewCity({ name: "Rolling City", size: "small", terrain: "flat", lakeCount: 1 }); const camera = { x: 0, y: 0, zoom: 1, rotation: 0 };
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z")); await manager.saveAs("Rolling City", city, camera);
    for (let hour = 1; hour <= 3; hour += 1) { vi.setSystemTime(new Date(`2026-01-01T1${hour}:00:00Z`)); await manager.autoSave(city, camera, { maxSlots: 2 }); }
    const metadata = await Promise.all([...saves.directories.values()].map(async (folder) => JSON.parse(folder.files.get("metadata.json")!.content)));
    expect(metadata.filter((value) => value.autosave)).toHaveLength(2); expect(metadata.filter((value) => !value.autosave)).toHaveLength(1); expect(saves.directories.has("Rolling City")).toBe(true);
  });

  it("keeps two recovery snapshots separate from managed saves", async () => {
    vi.useFakeTimers(); const saves = new MemoryDirectory(); const { app } = installStorage(saves); const manager = new SaveManager(); const camera = { x: 10, y: 20, zoom: 0.8, rotation: 0.2 };
    for (let hour = 0; hour < 3; hour += 1) { vi.setSystemTime(new Date(`2026-01-01T1${hour}:00:00Z`)); await manager.saveRecovery(createEmptyCity(`Recovery ${hour}`), camera); }
    const recovery = app.directories.get("recovery")!; expect(recovery.directories.size).toBe(2); expect(saves.directories.size).toBe(0);
    const metadata = [...recovery.directories.values()].map((folder) => JSON.parse(folder.files.get("metadata.json")!.content)); expect(metadata.every((value) => value.autosave && value.recovery)).toBe(true);
    const loaded = await manager.loadRecovery(); expect(loaded).toMatchObject({ city: { name: "Recovery 2" }, camera });
  });

  it("falls back to the previous complete recovery snapshot and clears all snapshots", async () => {
    vi.useFakeTimers(); const saves = new MemoryDirectory(); const { app } = installStorage(saves); const manager = new SaveManager(); const camera = { x: 0, y: 0, zoom: 1, rotation: 0 };
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z")); await manager.saveRecovery(createEmptyCity("Safe Recovery"), camera);
    vi.setSystemTime(new Date("2026-01-01T11:00:00Z")); await manager.saveRecovery(createEmptyCity("Broken Recovery"), camera);
    const recovery = app.directories.get("recovery")!; recovery.directories.get("snapshot-1767265200000")!.files.get("map.json")!.content = "{}";
    expect((await manager.loadRecovery())?.city.name).toBe("Safe Recovery");
    await manager.clearRecovery(); expect(app.directories.has("recovery")).toBe(false); expect(await manager.loadRecovery()).toBeUndefined();
  });
});
