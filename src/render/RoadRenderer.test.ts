import { describe, expect, it } from "vitest";
import type { City } from "../model/City";
import { RoadRenderer } from "./RoadRenderer";

describe("RoadRenderer", () => {
  it("draws all same-level borders before surfaces so connected nodes have no divider seam", () => {
    const city: City = {
      id: "city", name: "City", bounds: { x: 0, y: 0, width: 1000, height: 1000 }, mapSize: "small", terrain: "flat",
      roadNodes: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 200, y: 0 }],
      roads: [
        { id: "road", category: "normal", subtype: "medium", width: 14, name: "", segmentIds: ["ab", "bc"] },
      ],
      roadEdges: [{ id: "ab", roadId: "road", name: "", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } }, { id: "bc", roadId: "road", name: "", startNodeId: "b", endNodeId: "c", structure: "ground", level: 0, geometry: { type: "line" } }],
      buildings: [], blocks: [], zones: [], parks: [], waters: [], pois: [], facilities: [], transitLines: [], transitStations: [], labels: [],
    };
    const rendered = new RoadRenderer().render(city);
    const groundLayer = rendered.children[1];
    expect(groundLayer?.children).toHaveLength(2);
    expect(groundLayer?.children[0]?.children).toHaveLength(2);
    expect(groundLayer?.children[1]?.children).toHaveLength(2);
    rendered.destroy({ children: true });
  });

  it("highlights equal non-empty names across different internal road ids", () => {
    const city: City = {
      id: "groups", name: "Groups", bounds: { x: 0, y: 0, width: 500, height: 200 }, mapSize: "small", terrain: "flat",
      roadNodes: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 300, y: 0 }, { id: "d", x: 400, y: 0 }],
      roads: [{ id: "first", category: "normal", subtype: "small", width: 8, name: "Lake Road", segmentIds: ["first-edge"] }, { id: "second", category: "normal", subtype: "small", width: 8, name: "Lake Road", segmentIds: ["second-edge"] }],
      roadEdges: [{ id: "first-edge", roadId: "first", name: "Lake Road", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } }, { id: "second-edge", roadId: "second", name: "Lake Road", startNodeId: "c", endNodeId: "d", structure: "ground", level: 0, geometry: { type: "line" } }],
      buildings: [], blocks: [], zones: [], parks: [], waters: [], pois: [], facilities: [], transitLines: [], transitStations: [], labels: [],
    };
    const rendered = new RoadRenderer().render(city, { kind: "road", id: "first", edgeId: "first-edge" });
    expect(rendered.children).toHaveLength(9);
    rendered.destroy({ children: true });
  });
});
