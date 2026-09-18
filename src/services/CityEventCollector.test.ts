import { describe, expect, it } from "vitest";
import { defaultAIConfig, type CityEvent } from "../model/AI";
import { createEmptyCompany, createEmptyHospital, createEmptyUniversity, type City } from "../model/City";
import { createNewCity } from "../model/mapGenerator";
import { CityEventCollector, createCitySnapshot, diffCitySnapshots, mergeCityEvents, prepareTopCityEvents } from "./CityEventCollector";
import { SnapshotDiff } from "./SnapshotDiff";

function city(): City {
  const result = createNewCity({ name: "澄江市", size: "small", terrain: "flat", lakeCount: 1 });
  result.id = "city";
  return result;
}

describe("CityEventCollector", () => {
  it("calculates road centers from unique referenced endpoints and refreshes moved nodes", () => {
    const model = city();
    model.roadNodes = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 30, y: 0 }, { id: "c", x: 30, y: 30 }, { id: "unrelated", x: 1000, y: 1000 }];
    model.roads = [{ id: "road", name: "Main", category: "normal", subtype: "small", width: 6, segmentIds: ["ab", "bc", "missing"] }];
    model.roadEdges = [{ id: "ab", roadId: "road", name: "Main", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } }, { id: "bc", roadId: "road", name: "Main", startNodeId: "b", endNodeId: "c", structure: "ground", level: 0, geometry: { type: "line" } }];
    const before = createCitySnapshot(model); expect(before.roads[0]!.position).toEqual({ x: 20, y: 10 });
    model.roadNodes[0]!.x = 30; expect(createCitySnapshot(model).roads[0]!.position).toEqual({ x: 30, y: 10 });
    expect(before.roads[0]!.position).toEqual({ x: 20, y: 10 });
  });
  it("stores an immutable, explicit baseline and emits no initial events", () => {
    const model = city();
    model.universities.push({ ...createEmptyUniversity("university"), name: "澄江大学", ranking: 8 });
    model.hospitals.push({ ...createEmptyHospital("hospital"), name: "市立医院", ranking: 5, specialties: ["心内科"] });
    model.companies.push({ ...createEmptyCompany("company"), name: "远帆科技", marketValue: 100, marketValueRank: 2 });
    model.districts.push({ id: "district", name: "滨江区", points: [], gdp: 500, gdpYear: 2026 });
    const snapshot = createCitySnapshot(model, 1_000);
    model.companies[0]!.marketValue = 200;

    expect(snapshot).toMatchObject({
      capturedAt: 1_000,
      universities: [{ ranking: 8 }],
      hospitals: [{ ranking: 5, specialtySignature: "心内科" }],
      companies: [{ marketValue: 100, marketValueRank: 2 }],
      districts: [{ gdp: 500, gdpYear: 2026, districtRank: 1 }],
    });
    expect(diffCitySnapshots(snapshot)).toEqual([]);
    expect(defaultAIConfig).toEqual({ worldMode: "fictional", eventImportanceThreshold: 25 });
    expect(defaultAIConfig).not.toHaveProperty("apiKey");
  });

  it("detects required entity, campus, facility, transit, station, and road creations", () => {
    const model = city();
    const previous = createCitySnapshot(model, 1_000);
    model.universities.push({ ...createEmptyUniversity("university"), name: "澄江大学" });
    model.hospitals.push({ ...createEmptyHospital("hospital"), name: "市立医院" });
    model.companies.push({ ...createEmptyCompany("company"), name: "远帆科技" });
    model.districts.push({ id: "district", name: "滨江区", points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }] });
    model.zones.push(
      { id: "campus", name: "主校区", type: "education", polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], source: "custom", opacity: 0.4, universityId: "university" },
      { id: "hospital-campus", name: "主院区", type: "medical", polygon: [{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }], source: "custom", opacity: 0.4, hospitalId: "hospital" },
      { id: "hsr", name: "澄江站", type: "high-speed-rail-station", polygon: [{ x: 40, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 10 }], source: "custom", opacity: 0.4 },
      { id: "train-zone", name: "澄江火车站", type: "train-station", polygon: [{ x: 60, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 10 }], source: "custom", opacity: 0.4 },
      { id: "airport-zone", name: "澄江机场", type: "airport", polygon: [{ x: 80, y: 0 }, { x: 90, y: 0 }, { x: 90, y: 10 }], source: "custom", opacity: 0.4 },
    );
    for (const [id, type] of [["parking", "parking"], ["lab", "laboratory"], ["airport", "airport"]] as const) model.facilities.push({ id, type, name: id, position: { x: 5, y: 5 }, icon: type, color: "#000" });
    model.busLines.push({ id: "bus", name: "一号线", color: "#000", loop: false, path: [], direction: "start-to-end", stopIds: [] });
    model.railNodes = [{ id: "rail-node", system: "train", x: 30, y: 30 }];
    model.railStations = [{ id: "station", system: "train", name: "中央站", nodeId: "rail-node" }];
    model.railLines = [{ id: "rail", system: "train", name: "轨道一号线", color: "#000", stationIds: ["station"], path: [], loop: false }];
    model.roadNodes.push({ id: "a", x: 0, y: 50 }, { id: "b", x: 50, y: 50 });
    model.roadEdges.push({ id: "edge", roadId: "highway", name: "城际高速", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } });
    model.roads.push({ id: "highway", name: "城际高速", category: "highway", subtype: "highway", width: 18, segmentIds: ["edge"] });

    const events = SnapshotDiff.compare(createCitySnapshot(model, 2_000), previous);
    expect(events.map((item) => item.type)).toEqual(expect.arrayContaining(["university-created", "hospital-created", "company-created", "district-created", "campus-created", "hospital-campus-created", "facility-created", "bus-line-opened", "rail-line-opened", "rail-station-enabled", "road-completed"]));
    const facilityImportance = Object.fromEntries(events.filter((item) => item.type === "facility-created").map((item) => [item.payload.facilityType, item.importance]));
    expect(facilityImportance).toMatchObject({ parking: 10, laboratory: 60, airport: 95, "high-speed-rail-station": 85, "train-station": 75 });
    expect(events.filter((item) => ["train-zone", "airport-zone"].includes(String(item.payload.entityId))).every((item) => item.category === "transport")).toBe(true);
    expect(events.find((item) => item.type === "road-completed")).toMatchObject({ importance: 70, location: { x: 25, y: 50 } });
    expect(events.every((item) => Object.keys(item).every((key) => ["id", "timestamp", "gameDate", "type", "category", "importance", "relatedEntityIds", "payload", "location"].includes(key)))).toBe(true);
  });

  it("detects ranks, meaningful values, GDP, and specialty set changes without tiny spam", () => {
    const model = city();
    model.universities.push({ ...createEmptyUniversity("university"), name: "澄江大学", ranking: 12 });
    model.hospitals.push({ ...createEmptyHospital("hospital"), name: "市立医院", ranking: 20, specialties: ["心内科"] });
    model.companies.push({ ...createEmptyCompany("company"), name: "远帆科技", marketValue: 100, marketValueRank: 12 });
    model.districts.push({ id: "district-a", name: "滨江区", points: [], gdp: 500, gdpYear: 2025 }, { id: "district-b", name: "北城区", points: [], gdp: 400, gdpYear: 2025 });
    const previous = createCitySnapshot(model, 1_000);
    model.universities[0]!.ranking = 8;
    model.hospitals[0]!.ranking = 19;
    model.hospitals[0]!.specialties = ["心内科", "神经内科"];
    model.companies[0]!.marketValue = 104.9;
    model.companies[0]!.marketValueRank = 7;
    model.districts[0]!.gdp = 560;
    model.districts[0]!.gdpYear = 2026;
    const events = diffCitySnapshots(createCitySnapshot(model, 2_000), previous);

    expect(events.filter((item) => item.type === "ranking-changed")).toHaveLength(3);
    expect(events.find((item) => item.payload.metric === "ranking" && item.category === "university")!.importance).toBeGreaterThan(60);
    expect(events.some((item) => item.type === "market-value-changed")).toBe(false);
    expect(events.find((item) => item.type === "gdp-changed")?.payload).toMatchObject({ oldValue: 500, newValue: 560, oldYear: 2025, year: 2026 });
    expect(events.find((item) => item.type === "specialties-changed")?.payload).toMatchObject({ added: ["神经内科"], removed: [] });

    model.companies[0]!.marketValue = 105;
    expect(diffCitySnapshots(createCitySnapshot(model, 3_000), previous).some((item) => item.type === "market-value-changed")).toBe(true);
  });

  it("merges bus stops by line and preserves every original source id", () => {
    const model = city();
    model.busLines.push({ id: "line", name: "环城一线", color: "#123456", loop: false, path: [], direction: "start-to-end", stopIds: [] });
    const previous = createCitySnapshot(model, 1_000);
    for (let index = 1; index <= 3; index += 1) {
      const id = `stop-${index}`;
      model.busStops.push({ id, name: `第${index}站`, lineId: "line", roadEdgeId: "road", fraction: index / 4, position: { x: index, y: index }, side: "left" });
      model.busLines[0]!.stopIds.push(id);
    }
    const raw = diffCitySnapshots(createCitySnapshot(model, 2_000), previous).filter((item) => item.type === "bus-stop-created");
    const merged = mergeCityEvents(raw)[0]!;
    expect(merged).toMatchObject({ importance: 31, relatedEntityIds: ["line", "stop-1", "stop-2", "stop-3"], payload: { count: 3, stopIds: ["stop-1", "stop-2", "stop-3"] } });
    expect(merged.payload.sourceEventIds).toEqual(raw.map((item) => item.id));
    expect(prepareTopCityEvents(raw)).toHaveLength(1);
  });

  it("uses unique IDs for repeated occurrences and filters malformed events", () => {
    const model = city();
    const previous = createCitySnapshot(model, 1_000);
    model.companies.push({ ...createEmptyCompany("company"), name: "企业" });
    const current = createCitySnapshot(model, 2_000);
    const first = diffCitySnapshots(current, previous)[0]!;
    const second = diffCitySnapshots(current, previous)[0]!;
    expect(first.id).not.toBe(second.id);
    expect(first.id.startsWith("event-2000-")).toBe(true);
    expect(mergeCityEvents([{ id: "bad" } as unknown as CityEvent])).toEqual([]);
    expect(new CityEventCollector().collect(current)).toEqual([]);
  });

  it("marks metro openings with metro entity types", () => {
    const model = city(); const previous = createCitySnapshot(model, 1_000); model.railNodes = [{ id: "a", system: "metro", x: 0, y: 0 }, { id: "b", system: "metro", x: 50, y: 0 }]; model.railTracks = [{ id: "track", system: "metro", startNodeId: "a", endNodeId: "b", structure: "tunnel" }]; model.railStations = [{ id: "west", system: "metro", name: "西站", nodeId: "a" }, { id: "east", system: "metro", name: "东站", nodeId: "b" }]; model.railLines = [{ id: "m1", system: "metro", name: "地铁一号线", color: "#336699", stationIds: ["west", "east"], path: [{ trackId: "track", forward: true }], loop: false }];
    const events = diffCitySnapshots(createCitySnapshot(model, 2_000), previous); expect(events.find((event) => event.payload.entityId === "m1")).toMatchObject({ importance: 60, payload: { entityType: "metro-line", transportSystem: "metro" } }); expect(events.find((event) => event.payload.entityId === "west")).toMatchObject({ importance: 55, payload: { entityType: "metro-station", transportSystem: "metro" } });
  });

  it("rejects snapshots from different cities", () => {
    const first = city();
    const second = city();
    second.id = "other";
    expect(() => diffCitySnapshots(createCitySnapshot(first), createCitySnapshot(second))).toThrow("different cities");
  });
});
