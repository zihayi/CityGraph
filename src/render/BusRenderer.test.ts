import { describe, expect, it } from "vitest";
import type { Container } from "pixi.js";
import type { City } from "../model/City";
import { BusRenderer } from "./BusRenderer";

function city(): City {
  return {
    id: "bus-city", name: "Bus City", bounds: { x: 0, y: 0, width: 300, height: 200 }, mapSize: "small", terrain: "flat",
    roadNodes: [{ id: "a", x: 0, y: 50 }, { id: "b", x: 100, y: 50 }],
    roads: [{ id: "road", name: "Main", category: "normal", subtype: "small", width: 12, segmentIds: ["edge"] }],
    roadEdges: [{ id: "edge", roadId: "road", name: "Main", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "bezier", controlPoints: [{ x: 50, y: 100 }] } }],
    busTerminals: [{ id: "west", name: "West Terminal", position: { x: 0, y: 50 } }, { id: "east", name: "East Terminal", position: { x: 100, y: 50 } }],
    busLines: [{ id: "line", name: "B1", color: "#3366cc", loop: false, startTerminalId: "west", endTerminalId: "east", path: [{ roadEdgeId: "edge", forward: true }], direction: "start-to-end", stopIds: ["stop"] }],
    busStops: [{ id: "stop", name: "Market", lineId: "line", roadEdgeId: "edge", fraction: 0.5, position: { x: 50, y: 75 }, side: "right" }],
    buildings: [], blocks: [], zones: [], parks: [], waters: [], pois: [], facilities: [], universities: [], transitLines: [], transitStations: [], labels: [],
  };
}

function descendant(root: Container, label: string): Container | undefined {
  for (const child of root.children) {
    if (child.label === label) return child as Container;
    const nested = descendant(child as Container, label);
    if (nested) return nested;
  }
  return undefined;
}

describe("BusRenderer", () => {
  it("renders paths, connected stop markers, and line selection without direction arrows", () => {
    const rendered = new BusRenderer().render(city(), { kind: "bus-line", id: "line" }, { zoom: 2, rotation: 0.4 });
    expect(descendant(rendered, "bus-line:line")).toBeDefined();
    expect(descendant(rendered, "bus-line-selection:line")).toBeDefined();
    expect(descendant(rendered, "bus-arrows")).toBeUndefined();
    expect(descendant(rendered, "bus-stop-connector:stop")).toBeDefined();
    const stop = descendant(rendered, "bus-stop:stop")!;
    expect(stop.scale.x).toBeCloseTo(0.5); expect(stop.rotation).toBeCloseTo(-0.4); expect(stop.children).toHaveLength(3);
    expect(descendant(rendered, "bus-terminal:west")).toBeUndefined();
    rendered.destroy({ children: true });
  });

  it("highlights stop selections and tolerates invalid references and colors", () => {
    const invalid = city(); invalid.busLines![0] = { ...invalid.busLines![0]!, color: "invalid", path: [{ roadEdgeId: "missing", forward: true }] }; invalid.busStops![0] = { ...invalid.busStops![0]!, roadEdgeId: "missing", position: { x: 20, y: 30 } };
    expect(() => new BusRenderer().render(invalid, { kind: "bus-stop", id: "stop" })).not.toThrow();
    const stopSelection = new BusRenderer().render(invalid, { kind: "bus-stop", id: "stop" });
    expect(descendant(stopSelection, "bus-line:line")).toBeUndefined(); expect(descendant(stopSelection, "bus-stop:stop")?.children).toHaveLength(4);
    stopSelection.destroy({ children: true });
  });

  it("renders a loop draft with its snapped stop markers", () => {
    const value = city(); const stop = value.busStops[0]!;
    const rendered = new BusRenderer().renderDraft(value, value.busLines[0]!.path, [{ name: "First", roadEdgeId: stop.roadEdgeId, fraction: stop.fraction, position: stop.position, side: stop.side }], undefined, "#22aa88", { zoom: 1, rotation: 0 });
    expect(rendered.label).toBe("bus-loop-preview"); expect(descendant(rendered, "bus-line:bus-line-preview")).toBeDefined(); expect(descendant(rendered, "bus-stop:bus-stop-preview-0")).toBeDefined();
    rendered.destroy({ children: true });
  });
});
