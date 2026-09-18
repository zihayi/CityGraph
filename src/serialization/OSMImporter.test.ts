import { describe, expect, it } from "vitest";
import { Editor } from "../editor/Editor";
import { footprintContainsPoint, isValidBuildingFootprint } from "../geometry/BuildingGeometry";
import { sampleRoad } from "../geometry/RoadGeometry";
import { isValidWaterPolygon } from "../geometry/WaterGeometry";
import { pointInPolygon } from "../geometry/Polygon";
import { defaultOSMLayers, importOSM, MAX_OSM_FILE_BYTES, selectOSMLayers } from "./OSMImporter";
import neighborhood from "./fixtures/neighborhood.osm?raw";

const xml = (content: string) => `<osm version="0.6">${content}</osm>`;
const node = (id: number, lat: number, lon: number, tags = "") => `<node id="${id}" lat="${lat}" lon="${lon}">${tags}</node>`;
const tag = (key: string, value: string) => `<tag k="${key}" v="${value}"/>`;
const way = (id: number, refs: number[], tags = "") => `<way id="${id}">${refs.map((ref) => `<nd ref="${ref}"/>`).join("")}${tags}</way>`;
const square = (start: number, lat: number, lon: number, side = 0.001) => node(start, lat, lon) + node(start + 1, lat, lon + side) + node(start + 2, lat + side, lon + side) + node(start + 3, lat + side, lon);
const member = (ref: number, role = "outer") => `<member type="way" ref="${ref}" role="${role}"/>`;
const relation = (id: number, members: string, tags: string) => `<relation id="${id}">${members}${tag("type", "multipolygon")}${tags}</relation>`;

describe("OSM import", () => {
  it("imports editable layers with decoded names, dimensions and stable large IDs", () => {
    const { city, counts, issues } = importOSM(neighborhood, "滨河街区");
    expect(counts).toEqual({ roads: 3, buildings: 1, waters: 1, parks: 1, zones: 0, facilities: 1 });
    expect(Object.values(issues).every((count) => count === 0)).toBe(true);
    expect(city).toMatchObject({ name: "滨河街区", mapSize: "custom", terrain: "flat", mapSource: { type: "osm", latitude: 31.0015 } });
    expect(city.roads[0]).toMatchObject({ name: "中央路", subtype: "large", width: 12 });
    expect(city.buildings[0]).toMatchObject({ name: "滨河公寓", floors: 6, height: 20, type: "residential" });
    expect(city.facilities[0]).toMatchObject({ id: "osm-facility-node-9007199254740993", name: "河畔 & Coffee", type: "coffee-shop" });
    expect(isValidBuildingFootprint(city.buildings[0]!.footprint)).toBe(true);
    expect(isValidWaterPolygon(city.waters[0]!.points)).toBe(true);
    const editor = new Editor(city); editor.updateBuilding(city.buildings[0]!.id, { floors: 10 });
    expect(city.buildings[0]!.floors).toBe(10); editor.undo(); expect(city.buildings[0]!.floors).toBe(6);
  });

  it("splits shared junctions, preserves bends and keeps unconnected crossings separate", () => {
    const { city } = importOSM(neighborhood);
    expect(city.roadEdges.filter((edge) => edge.startNodeId === "osm-node-3" || edge.endNodeId === "osm-node-3")).toHaveLength(4);
    const first = city.roadEdges.find((edge) => edge.roadId === "osm-road-100")!;
    expect(first.geometry.type).toBe("polyline");
    expect(sampleRoad(first, new Map(city.roadNodes.map((point) => [point.id, point])))).toHaveLength(3);
    expect(city.roadNodes.some((point) => point.id === "osm-node-2")).toBe(false);
    const bridge = city.roadEdges.find((edge) => edge.roadId === "osm-road-102")!;
    expect(bridge).toMatchObject({ startNodeId: "osm-node-7", endNodeId: "osm-node-8", structure: "elevated", level: 2 });
    expect(city.roadEdges).toHaveLength(5);
  });

  it("projects at local meter scale with north up, including the date line", () => {
    const makeRoad = (lat: number, west: number, east: number) => importOSM(xml(node(1, lat, west) + node(2, lat + 0.001, east) + way(1, [1, 2], tag("highway", "residential")))).city;
    const city = makeRoad(60, 0, 0.001); const [a, b] = city.roadNodes;
    expect(b!.x - a!.x).toBeCloseTo(55.6, 0); expect(a!.y - b!.y).toBeCloseTo(111.2, 0);
    const wrapped = makeRoad(0, 179.999, -179.999);
    expect(wrapped.roadNodes[1]!.x - wrapped.roadNodes[0]!.x).toBeCloseTo(222.4, 0);
    expect(wrapped.bounds.width).toBeLessThan(400);
  });

  it("creates a valid two-edge roundabout rather than a self-loop", () => {
    const { city } = importOSM(xml(square(1, 0, 0) + way(10, [1, 2, 3, 4, 1], tag("highway", "residential") + tag("junction", "roundabout"))));
    expect(city.roadEdges).toHaveLength(2);
    expect(city.roadEdges.every((edge) => edge.startNodeId !== edge.endNodeId)).toBe(true);
    expect(city.roadEdges[0]!.startNodeId).toBe(city.roadEdges[1]!.endNodeId);
    expect(city.roadEdges[0]!.endNodeId).toBe(city.roadEdges[1]!.startNodeId);
  });

  it("assembles reversed relation members, preserves courtyard holes and avoids duplicate buildings", () => {
    const { city } = importOSM(xml(square(1, 0, 0) + square(5, 0.0003, 0.0003, 0.0003)
      + way(10, [1, 2, 3], tag("building", "yes")) + way(11, [1, 4, 3]) + way(12, [5, 6, 7, 8, 5])
      + relation(20, member(11) + member(12, "inner") + member(10), tag("building", "yes") + tag("amenity", "library"))));
    expect(city.buildings).toHaveLength(1); const footprint = city.buildings[0]!.footprint;
    expect(footprint.holes).toHaveLength(1); expect(isValidBuildingFootprint(footprint)).toBe(true);
    expect(city.facilities).toHaveLength(1); expect(footprintContainsPoint(footprint, city.facilities[0]!.position)).toBe(true);
  });

  it("supports multiple outer polygons and suppresses matching tagged member ways", () => {
    const { city } = importOSM(xml(square(1, 0, 0) + square(5, 0.002, 0.002)
      + way(10, [1, 2, 3, 4, 1], tag("building", "yes")) + way(11, [5, 6, 7, 8, 5], tag("building", "yes"))
      + relation(20, member(11) + member(10), tag("building", "yes"))));
    expect(city.buildings).toHaveLength(2);
    expect(city.buildings.every((building) => building.id.startsWith("osm-buildings-relation-20"))).toBe(true);
  });

  it("preserves water holes without filling the tagged outer member", () => {
    const result = importOSM(xml(square(1, 0, 0) + square(5, 0.0003, 0.0003, 0.0003) + node(9, 0, 0, tag("amenity", "cafe"))
      + way(10, [1, 2, 3, 4, 1], tag("natural", "water")) + way(11, [5, 6, 7, 8, 5])
      + relation(20, member(10) + member(11, "inner"), tag("natural", "water"))));
    expect(result.city.waters).toHaveLength(2);
    expect(result.city.waters.every((water) => !pointInPolygon({ x: -5, y: 5 }, water.points))).toBe(true);
    expect(Object.values(result.issues).every((value) => value === 0)).toBe(true);
  });

  it("skips missing nodes instead of inventing connections and reports broken areas", () => {
    const result = importOSM(xml(square(1, 0, 0) + node(5, 0, 0, tag("amenity", "cafe"))
      + way(10, [1, 999, 2], tag("highway", "residential")) + way(11, [1, 2, 3], tag("building", "yes"))
      + way(12, [1, 3, 2, 4, 1], tag("building", "yes"))));
    expect(result.counts.roads).toBe(0); expect(result.counts.buildings).toBe(0);
    expect(result.issues).toMatchObject({ incomplete: 1, invalidGeometry: 2 });
  });

  it("imports rivers with metric width and uses defaults for missing building data", () => {
    const result = importOSM(xml(square(1, 0, 0) + way(10, [1, 2], tag("waterway", "river") + tag("width", "30 ft")) + way(11, [1, 2, 3, 4, 1], tag("building", "yes"))));
    expect(result.city.waters).toHaveLength(1); const ys = result.city.waters[0]!.points.map((point) => point.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(9.144, 3);
    expect(result.city.buildings[0]).toMatchObject({ floors: 3, height: 9.600000000000001, type: "custom" });
  });

  it("filters entire road graphs together, recomputes bounds and leaves the preview intact", () => {
    const result = importOSM(neighborhood);
    const city = selectOSMLayers(result, { ...defaultOSMLayers, roads: false, waters: false, parks: false, facilities: false }, "New");
    expect(city.name).toBe("New"); expect(city.roads).toEqual([]); expect(city.roadNodes).toEqual([]); expect(city.roadEdges).toEqual([]);
    expect(city.bounds.width).toBeLessThan(result.city.bounds.width); expect(result.city.roads).toHaveLength(3);
    expect(() => selectOSMLayers(result, { roads: false, buildings: false, waters: false, parks: false, zones: false, facilities: false }, "Empty")).toThrow("empty");
  });

  it.each([
    "", "{}", "<gpx/>", '<osm version="0.6"><node></osm>',
    xml(node(1, 0, 0) + node(1, 1, 1)), xml('<node id="1" lat="NaN" lon="0"/>'),
    xml('<node id="1" lat="" lon="0"/>'), xml('<node id="1" lat="0" lon="181"/>'),
    '<!DOCTYPE osm [<!ENTITY name "external">]><osm version="0.6"/>',
  ])("rejects malformed or non-OSM input: %s", (source) => {
    expect(() => importOSM(source)).toThrow("invalid");
  });

  it("rejects oversized, empty and geographically oversized datasets", () => {
    expect(() => importOSM(" ".repeat(MAX_OSM_FILE_BYTES + 1))).toThrow("tooLarge");
    expect(() => importOSM(xml(node(1, 0, 0)))).toThrow("empty");
    expect(() => importOSM(xml(node(1, 0, 0) + node(2, 10, 0)))).toThrow("extent");
    expect(() => importOSM(xml(node(1, 89, 0, tag("amenity", "cafe"))))).toThrow("extent");
  });

  it("does not treat inherited JavaScript keys as facility types", () => {
    const result = importOSM(xml(node(1, 0, 0, tag("amenity", "constructor")) + node(2, 0, 0, tag("amenity", "cafe"))));
    expect(result.city.facilities.map((facility) => facility.type)).toEqual(["coffee-shop"]);
  });

  it("maps land use, schools and medical areas to game zones and retains source tags", () => {
    const result = importOSM(xml(square(1, 0, 0) + square(5, 0.002, 0.002) + square(9, 0.004, 0.004)
      + way(10, [1, 2, 3, 4, 1], tag("landuse", "residential") + tag("name", "住宅区") + tag("addr:street", "湖滨路"))
      + way(11, [5, 6, 7, 8, 5], tag("amenity", "university"))
      + way(12, [9, 10, 11, 12, 9], tag("amenity", "hospital"))));
    expect(result.city.zones.map((zone) => zone.type)).toEqual(["residential", "education", "medical"]);
    expect(result.city.zones[0]).toMatchObject({ name: "住宅区", description: "湖滨路", osm: { type: "way", id: "10", tags: { landuse: "residential", "addr:street": "湖滨路" } } });
    expect(result.city.zones[1]!.educationLevel).toBe("university");
    const filtered = selectOSMLayers(result, { ...defaultOSMLayers, zones: false }, "Facilities");
    expect(filtered.zones).toEqual([]); expect(filtered.facilities).toHaveLength(1);
  });
});
