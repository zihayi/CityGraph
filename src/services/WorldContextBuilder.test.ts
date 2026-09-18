import { describe, expect, it } from "vitest";
import type { NewsArticle } from "../model/AI";
import { createEmptyCompany, createEmptyHospital, createEmptyUniversity, type City, type Zone } from "../model/City";
import { createNewCity } from "../model/mapGenerator";
import { buildWorldContext, MAX_RELATION_DEPTH, WorldContextBuilder } from "./WorldContextBuilder";

function city(): City {
  const result = createNewCity({ name: "Fictional Paris", size: "small", terrain: "flat", lakeCount: 1 });
  result.id = "city";
  return result;
}

function zone(id: string, x: number, universityId?: string): Zone {
  return { id, name: id, type: "education", polygon: [{ x, y: 0 }, { x: x + 40, y: 0 }, { x: x + 40, y: 40 }, { x, y: 40 }], source: "custom", opacity: 0.4, universityId };
}

function article(id: string, date: string, entityId: string): NewsArticle {
  return { id, date, category: "city", headline: id, summary: `${id} summary`, body: `${id} body`, importance: 40, sourceEventIds: [], relatedEntityIds: [entityId] };
}

describe("WorldContextBuilder", () => {
  it("resolves requested IDs while keeping city context compact", () => {
    const model = city();
    model.universities.push({ ...createEmptyUniversity("university"), name: "Harvard University", description: "An authored fictional institution." });
    model.zones.push(zone("campus", 0, "university"), zone("unrequested-zone", 100));
    const context = buildWorldContext(model, { entityIds: ["university"] });
    expect(context).toMatchObject({ worldMode: "fictional", city: { id: "city", kind: "city" }, relations: [], recentNews: [] });
    expect(context.entities.map((item) => [item.kind, item.id])).toEqual([["university", "university"]]);
    expect(context.entities[0]!.facts).toMatchObject({ name: "Harvard University", description: "An authored fictional institution.", campusIds: ["campus"] });
    expect(context.entities[0]!.facts).not.toHaveProperty("logo");
  });

  it("uses depth and caps relation traversal at one layer", () => {
    const model = city();
    model.facilities.push({ id: "root", type: "library", name: "Root Library", position: { x: 10, y: 10 }, icon: "library", color: "#000" });
    model.companies.push({ ...createEmptyCompany("related"), name: "Related Company" });
    model.hospitals.push({ ...createEmptyHospital("second-layer"), name: "Second Layer Hospital" });
    model.districts.push({ id: "district", name: "Authored District", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    model.entityRelations = [
      { id: "relation-1", type: "owned_by", fromEntityId: "root", toEntityId: "related" },
      { id: "relation-2", type: "affiliated_with", fromEntityId: "related", toEntityId: "second-layer" },
    ];
    model.newsArticles = [article("new", "2026-09-13", "root"), article("old", "2026-09-12", "root"), article("unrelated", "2026-09-14", "elsewhere")];
    const context = new WorldContextBuilder(model).build({ entityIds: ["root"], includeRelations: true, depth: 99, includeDistrict: true, includeNearbyEntities: true, includeRecentNews: true, recentNewsLimit: 1 });
    expect(MAX_RELATION_DEPTH).toBe(1);
    expect(context.entities.map((item) => item.id)).toEqual(expect.arrayContaining(["root", "related", "district"]));
    expect(context.entities.map((item) => item.id)).not.toContain("second-layer");
    expect(context.relations.map((item) => item.id)).toEqual(["relation-1"]);
    expect(context.recentNews.map((item) => item.id)).toEqual(["new"]);
  });

  it("uses only the exact context request controls", () => {
    const keys: (keyof Parameters<typeof buildWorldContext>[1])[] = ["entityIds", "includeRelations", "includeDistrict", "includeNearbyEntities", "depth", "includeRecentNews", "recentNewsLimit"];
    expect(keys).not.toContain("relationDepth" as never);
  });

  it("does not enrich real-looking names with outside facts", () => {
    const model = city();
    model.aiConfig = { worldMode: "fictional", eventImportanceThreshold: 25 };
    model.universities.push({ ...createEmptyUniversity("real-looking"), name: "Harvard University", ranking: null, description: "" });
    const serialized = JSON.stringify(buildWorldContext(model, { entityIds: ["real-looking"] }));
    expect(serialized).not.toContain("United States");
    expect(serialized).not.toContain("Massachusetts");
  });

  it("identifies metro entities separately from passenger rail", () => {
    const model = city(); model.railNodes = [{ id: "metro-a", system: "metro", x: 0, y: 0 }, { id: "metro-b", system: "metro", x: 50, y: 0 }]; model.railTracks = [{ id: "metro-track", system: "metro", startNodeId: "metro-a", endNodeId: "metro-b", structure: "tunnel" }]; model.railStations = [{ id: "metro-west", system: "metro", name: "West", nodeId: "metro-a" }, { id: "metro-east", system: "metro", name: "East", nodeId: "metro-b" }]; model.railLines = [{ id: "metro-line", system: "metro", name: "M1", color: "#336699", stationIds: ["metro-west", "metro-east"], path: [{ trackId: "metro-track", forward: true }], loop: false }];
    const context = buildWorldContext(model, { entityIds: ["metro-line", "metro-west"] }); expect(context.city.facts.counts).toMatchObject({ railLines: 0, railStations: 0, metroLines: 1, metroStations: 2 }); expect(context.entities.find((item) => item.id === "metro-line")?.facts).toMatchObject({ system: "metro" }); expect(context.entities.find((item) => item.id === "metro-west")?.facts).toMatchObject({ system: "metro" });
  });
});
