import { describe, expect, it } from "vitest";
import { Editor } from "../editor/Editor";
import { createNewCity } from "../model/mapGenerator";
import { importOSM } from "../serialization/OSMImporter";
import { importedCollections } from "./MapImportCommand";
import neighborhood from "../serialization/fixtures/neighborhood.osm?raw";

describe("merge map import", () => {
  it("preserves the current city and history, remaps IDs and undoes the entire import", () => {
    const city = createNewCity({ name: "Existing", size: "small", terrain: "lakes", lakeCount: 1 });
    const editor = new Editor(city); editor.renameCity("My saved city");
    const before = structuredClone(city); const source = importOSM(neighborhood).city; const originalSource = structuredClone(source);
    const bounds = editor.importMapRegion(source, { x: 12000, y: 10000 })!;
    expect(city.id).toBe(before.id); expect(city.name).toBe(before.name); expect(city.osmAttribution).toBe(true);
    expect(bounds.x + bounds.width / 2).toBeCloseTo(12000); expect(bounds.y + bounds.height / 2).toBeCloseTo(10000);
    expect(city.waters[0]).toEqual(before.waters[0]); expect(city.bounds.width).toBeGreaterThan(before.bounds.width);
    const nodeIds = new Set(city.roadNodes.map((node) => node.id)); const roads = new Map(city.roads.map((road) => [road.id, road]));
    expect(city.roadEdges.every((edge) => nodeIds.has(edge.startNodeId) && nodeIds.has(edge.endNodeId) && roads.get(edge.roadId)?.segmentIds.includes(edge.id))).toBe(true);
    const imported = structuredClone(city);
    editor.undo(); expect(city).toEqual(before); editor.redo(); expect(city).toEqual(imported);
    expect(source).toEqual(originalSource);
    editor.undo(); editor.undo(); expect(city.name).toBe("Existing");
  });
  it("supports repeated imports and redo after edits without ID collisions or stale mutations", () => {
    const city = createNewCity({ name: "Map", size: "unlimited", terrain: "flat", lakeCount: 1 }); const editor = new Editor(city); const source = importOSM(neighborhood).city;
    editor.importMapRegion(source, { x: 0, y: 0 }); const firstBuilding = city.buildings[0]!.id;
    editor.updateBuilding(firstBuilding, { floors: 99 }); editor.undo(); editor.undo(); editor.redo();
    expect(city.buildings[0]!.floors).toBe(6);
    editor.importMapRegion(source, { x: 1000, y: 1000 });
    for (const key of importedCollections) expect(new Set(city[key].map((item) => item.id)).size).toBe(city[key].length);
    expect(city.mapSize).toBe("unlimited"); expect(city.roads).toHaveLength(source.roads.length * 2);
  });
});
