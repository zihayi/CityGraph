import { describe, expect, it } from "vitest";
import type { BusLine, BusPathStep, BusStop, City, RoadEdge, RoadNode } from "../model/City";
import { busPathDistance, busStopGeometry, locatePointOnRoad, pointAtRoadFraction, sampleDirectedBusPath, sampleDirectedBusPathSegments } from "./BusGeometry";

const nodes: RoadNode[] = [
  { id: "a", x: 0, y: 0 },
  { id: "b", x: 10, y: 0 },
  { id: "c", x: 20, y: 0 },
  { id: "d", x: 10, y: 10 },
];
const edges: RoadEdge[] = [
  { id: "ab", roadId: "road", name: "AB", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } },
  { id: "bc", roadId: "road", name: "BC", startNodeId: "b", endNodeId: "c", structure: "ground", level: 0, geometry: { type: "line" } },
];
const city = {
  roads: [{ id: "road", name: "Road", category: "normal", subtype: "small", width: 20, segmentIds: ["ab", "bc"] }],
  roadEdges: edges,
  roadNodes: nodes,
} as City;
const nodeMap = new Map(nodes.map((node) => [node.id, node]));
const line = (path: BusPathStep[]): BusLine => ({ id: "line", name: "Line", color: "#336699", startTerminalId: "start", endTerminalId: "end", path, direction: "start-to-end", stopIds: [] });
const stop = (overrides: Partial<BusStop>): BusStop => ({ id: "stop", name: "Stop", lineId: "line", roadEdgeId: "ab", fraction: 0.5, position: { x: 999, y: 999 }, side: "left", ...overrides });

describe("BusGeometry", () => {
  it("samples directed multi-edge paths without duplicate junctions and skips missing edges", () => {
    const path = sampleDirectedBusPath(city, line([{ roadEdgeId: "ab", forward: true }, { roadEdgeId: "missing", forward: true }, { roadEdgeId: "bc", forward: true }]));
    expect(path).toEqual([{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 }, { id: "c", x: 20, y: 0 }]);
    expect(busPathDistance({ x: 12, y: 3 }, city, line([{ roadEdgeId: "ab", forward: true }, { roadEdgeId: "bc", forward: true }]))).toBe(3);
  });

  it("reverses edges according to path direction", () => {
    expect(sampleDirectedBusPath(city, line([{ roadEdgeId: "bc", forward: false }, { roadEdgeId: "ab", forward: false }]))).toEqual([
      { id: "c", x: 20, y: 0 }, { id: "b", x: 10, y: 0 }, { id: "a", x: 0, y: 0 },
    ]);
  });

  it("keeps disconnected valid road references in separate path segments", () => {
    const disconnectedEdge: RoadEdge = { id: "dc", roadId: "road", name: "DC", startNodeId: "d", endNodeId: "c", structure: "ground", level: 0, geometry: { type: "line" } };
    const disconnectedCity = { ...city, roadEdges: [...edges, disconnectedEdge] } as City;
    const route = line([{ roadEdgeId: "ab", forward: true }, { roadEdgeId: "dc", forward: true }]);
    expect(sampleDirectedBusPathSegments(disconnectedCity, route)).toHaveLength(2);
    expect(busPathDistance({ x: 10, y: 5 }, disconnectedCity, route)).toBeGreaterThan(3);
  });

  it("uses sampled arc length for polyline road fractions and canonical tangents", () => {
    const edge: RoadEdge = { id: "bend", roadId: "road", name: "Bend", startNodeId: "a", endNodeId: "d", structure: "ground", level: 0, geometry: { type: "polyline", points: [{ x: 10, y: 0 }] } };
    const at = pointAtRoadFraction(edge, nodeMap, 0.75)!;
    expect(at.point.x).toBeCloseTo(10); expect(at.point.y).toBeCloseTo(5); expect(at.tangent).toEqual({ x: 0, y: 1 });
    const located = locatePointOnRoad({ x: 8, y: 6 }, edge, nodeMap)!;
    expect(located.point).toEqual({ x: 10, y: 6 }); expect(located.tangent).toEqual({ x: 0, y: 1 }); expect(located.fraction).toBeCloseTo(0.8); expect(located.distance).toBe(2);
  });

  it("samples quadratic and cubic curves with normalized canonical tangents", () => {
    const quadratic: RoadEdge = { id: "quadratic", roadId: "road", name: "Curve", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "bezier", controlPoints: [{ x: 5, y: 10 }] } };
    const cubic: RoadEdge = { ...quadratic, id: "cubic", geometry: { type: "bezier", controlPoints: [{ x: 0, y: 10 }, { x: 10, y: 10 }] } };
    for (const edge of [quadratic, cubic]) {
      const at = pointAtRoadFraction(edge, nodeMap, 0.5)!;
      expect(at.point.x).toBeCloseTo(5, 2); expect(at.tangent.x).toBeGreaterThan(0.99); expect(Math.hypot(at.tangent.x, at.tangent.y)).toBeCloseTo(1);
      const located = locatePointOnRoad(at.point, edge, nodeMap)!;
      expect(located.fraction).toBeCloseTo(0.5, 2); expect(located.distance).toBeCloseTo(0);
    }
  });

  it("places stops on the canonical left and right of the current road geometry", () => {
    expect(busStopGeometry(city, stop({ side: "left" }))).toEqual({ roadPoint: { x: 5, y: 0 }, stopPoint: { x: 5, y: 18 }, tangent: { x: 1, y: 0 } });
    expect(busStopGeometry(city, stop({ side: "right" }))).toEqual({ roadPoint: { x: 5, y: 0 }, stopPoint: { x: 5, y: -18 }, tangent: { x: 1, y: 0 } });
  });

  it("clamps fractions and safely falls back to the persisted stop position for missing refs", () => {
    expect(pointAtRoadFraction(edges[0]!, nodeMap, 2)!.point).toEqual({ x: 10, y: 0 });
    expect(pointAtRoadFraction(edges[0]!, nodeMap, -1)!.point).toEqual({ x: 0, y: 0 });
    expect(busStopGeometry(city, stop({ roadEdgeId: "missing", position: { x: 3, y: 4 } }))).toEqual({
      roadPoint: { x: 3, y: 4 }, stopPoint: { x: 3, y: 4 }, tangent: { x: 1, y: 0 },
    });
  });
});
