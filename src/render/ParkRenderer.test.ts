import { describe, expect, it } from "vitest";
import type { Container } from "pixi.js";
import { defaultLandscapingColor, type City } from "../model/City";
import { landscapingColor, ParkRenderer } from "./ParkRenderer";

function city(): City {
  return {
    id: "green-city", name: "Green City", bounds: { x: 0, y: 0, width: 200, height: 200 }, mapSize: "small", terrain: "flat",
    roadNodes: [], roads: [], roadEdges: [], buildings: [], blocks: [], zones: [], universities: [], hospitals: [], companies: [], waters: [], pois: [], facilities: [], transitLines: [], transitStations: [], busTerminals: [], busLines: [], busStops: [], labels: [],
    parks: [{ id: "greenway", name: "Greenway", points: [{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 80 }, { x: 10, y: 80 }], source: "custom", color: "#4f8f55", opacity: 0.7 }], districts: [],
  };
}

function descendant(root: Container, label: string): Container | undefined {
  for (const child of root.children) { if (child.label === label) return child as Container; const nested = descendant(child as Container, label); if (nested) return nested; }
  return undefined;
}

describe("ParkRenderer", () => {
  it("renders styled landscaping and editable vertices", () => {
    const rendered = new ParkRenderer().render(city(), { kind: "park", id: "greenway" }, true, 2);
    expect(descendant(rendered, "park:greenway")).toBeDefined(); expect(rendered.children).toHaveLength(5); expect(descendant(rendered, "park-vertex:greenway:3")).toBeDefined(); rendered.destroy({ children: true });
  });

  it("uses safe green colors and renders custom previews", () => {
    expect(landscapingColor("#123456")).toBe(0x123456); expect(landscapingColor("invalid")).toBe(Number.parseInt(defaultLandscapingColor.slice(1), 16));
    const preview = new ParkRenderer().renderPreview([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 30 }], "#4f8f55", 0.6, true, true, 1); expect(preview.label).toBe("landscaping-preview"); expect(preview.children).toHaveLength(4); preview.destroy({ children: true });
  });
});
