import { describe, expect, it } from "vitest";
import type { RoadEdge, RoadNode } from "../model/City";
import { roadBounds, sampleRoad } from "./RoadGeometry";

const edge: RoadEdge = { id: "edge", roadId: "road", name: "Road", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } };
function nodes(): Map<string, RoadNode> { return new Map([["a", { id: "a", x: 10, y: 20 }], ["b", { id: "b", x: -30, y: -40 }]]); }

describe("roadBounds", () => {
  it("bounds endpoints and expands by a radius without shrinking for negative padding", () => {
    expect(roadBounds(edge, nodes())).toEqual({ minX: -30, minY: -40, maxX: 10, maxY: 20 });
    expect(roadBounds(edge, nodes(), 5)).toEqual({ minX: -35, minY: -45, maxX: 15, maxY: 25 });
    expect(roadBounds(edge, nodes(), -5)).toEqual(roadBounds(edge, nodes()));
  });

  it.each<RoadEdge["geometry"]>([
    { type: "bezier", controlPoints: [{ x: -80, y: 150 }] },
    { type: "bezier", controlPoints: [{ x: -80, y: 150 }, { x: 120, y: -100 }] },
    { type: "bezier", controlPoints: [] },
    { type: "polyline", points: [{ x: -80, y: 150 }, { x: 120, y: -100 }] },
    { type: "polyline", points: [] },
  ])("contains every sample of $type geometry using its controls/vertices", (geometry) => {
    const candidate = { ...edge, geometry }; const lookup = nodes(); const bounds = roadBounds(candidate, lookup)!;
    const vertices = geometry.type === "bezier" ? geometry.controlPoints : geometry.type === "polyline" ? geometry.points : [];
    for (const point of [...lookup.values(), ...vertices, ...sampleRoad(candidate, lookup, 200)]) {
      expect(point.x).toBeGreaterThanOrEqual(bounds.minX - 1e-10); expect(point.x).toBeLessThanOrEqual(bounds.maxX + 1e-10);
      expect(point.y).toBeGreaterThanOrEqual(bounds.minY - 1e-10); expect(point.y).toBeLessThanOrEqual(bounds.maxY + 1e-10);
    }
    if (vertices.length === 2) expect(bounds).toEqual({ minX: -80, minY: -100, maxX: 120, maxY: 150 });
  });

  it("returns undefined when either endpoint is missing", () => {
    const lookup = nodes(); lookup.delete("a"); expect(roadBounds(edge, lookup)).toBeUndefined();
    lookup.clear(); lookup.set("a", { id: "a", x: 0, y: 0 }); expect(roadBounds(edge, lookup)).toBeUndefined();
  });

  it("reads only endpoints and control/vertex coordinates, not sampled curve positions", () => {
    let reads = 0;
    const control = { get x() { reads += 1; return 100; }, get y() { reads += 1; return 200; } };
    expect(roadBounds({ ...edge, geometry: { type: "bezier", controlPoints: [control] } }, nodes())).toEqual({ minX: -30, minY: -40, maxX: 100, maxY: 200 });
    expect(reads).toBe(4);
  });

  it("reflects in-place changes to nodes, controls and polyline vertices", () => {
    const lookup = nodes(); const point = { x: 50, y: 60 };
    for (const geometry of [{ type: "bezier", controlPoints: [point] }, { type: "polyline", points: [point] }] satisfies RoadEdge["geometry"][]) {
      point.x = 50; point.y = 60; lookup.get("a")!.x = 10;
      const candidate = { ...edge, geometry }; expect(roadBounds(candidate, lookup)!.maxX).toBe(50);
      point.x = 500; point.y = -600; lookup.get("a")!.x = -700;
      expect(roadBounds(candidate, lookup)).toEqual({ minX: -700, minY: -600, maxX: 500, maxY: 20 });
    }
  });
});
