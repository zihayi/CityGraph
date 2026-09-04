import { describe, expect, it } from "vitest";
import type { BusLine, BusPathStep, BusStop, City, RoadEdge, RoadNode } from "../model/City";
import { busPathDistance, busStopGeometry, locatePointOnRoad, pointAtRoadFraction, routeBetweenBusStops, routeBusStopLoop, sampleDirectedBusPath, sampleDirectedBusPathSegments } from "./BusGeometry";

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
const line = (path: BusPathStep[]): BusLine => ({ id: "line", name: "Line", color: "#336699", loop: false, startTerminalId: "start", endTerminalId: "end", path, direction: "start-to-end", stopIds: [] });
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

  it("routes directly between two fractions on the same edge", () => {
    expect(routeBetweenBusStops(city, { roadEdgeId: "ab", fraction: 0.2 }, { roadEdgeId: "ab", fraction: 0.8 })).toEqual([
      { roadEdgeId: "ab", forward: true, startFraction: 0.2, endFraction: 0.8 },
    ]);
    expect(routeBetweenBusStops(city, { roadEdgeId: "ab", fraction: 0.8 }, { roadEdgeId: "ab", fraction: 0.2 })).toEqual([
      { roadEdgeId: "ab", forward: false, startFraction: 0.8, endFraction: 0.2 },
    ]);
  });

  it("routes across edges with directed partial steps", () => {
    expect(routeBetweenBusStops(city, { roadEdgeId: "ab", fraction: 0.5 }, { roadEdgeId: "bc", fraction: 0.25 })).toEqual([
      { roadEdgeId: "ab", forward: true, startFraction: 0.5, endFraction: 1 },
      { roadEdgeId: "bc", forward: true, startFraction: 0, endFraction: 0.25 },
    ]);
  });

  it("returns undefined when stop roads are disconnected or invalid", () => {
    const disconnectedNodes: RoadNode[] = [...nodes, { id: "e", x: 100, y: 0 }, { id: "f", x: 110, y: 0 }];
    const disconnectedEdge: RoadEdge = { id: "ef", roadId: "road", name: "EF", startNodeId: "e", endNodeId: "f", structure: "ground", level: 0, geometry: { type: "line" } };
    const disconnectedCity = { ...city, roadNodes: disconnectedNodes, roadEdges: [...edges, disconnectedEdge] } as City;
    expect(routeBetweenBusStops(disconnectedCity, { roadEdgeId: "ab", fraction: 0.5 }, { roadEdgeId: "ef", fraction: 0.5 })).toBeUndefined();
    expect(routeBetweenBusStops(city, { roadEdgeId: "missing", fraction: 0.5 }, { roadEdgeId: "ab", fraction: 0.5 })).toBeUndefined();
    expect(routeBetweenBusStops(city, { roadEdgeId: "ab", fraction: 0.5 }, { roadEdgeId: "missing", fraction: 0.5 })).toBeUndefined();
    expect(routeBetweenBusStops(city, { roadEdgeId: "ab", fraction: Number.NaN }, { roadEdgeId: "bc", fraction: 0.5 })).toBeUndefined();
  });

  it("routes in reverse and omits zero-length steps", () => {
    expect(routeBetweenBusStops(city, { roadEdgeId: "bc", fraction: 0.75 }, { roadEdgeId: "ab", fraction: 0.25 })).toEqual([
      { roadEdgeId: "bc", forward: false, startFraction: 0.75, endFraction: 0 },
      { roadEdgeId: "ab", forward: false, startFraction: 1, endFraction: 0.25 },
    ]);
    expect(routeBetweenBusStops(city, { roadEdgeId: "ab", fraction: 0.4 }, { roadEdgeId: "ab", fraction: 0.4 })).toEqual([]);
  });

  it("closes an ordered stop loop", () => {
    expect(routeBusStopLoop(city, [{ roadEdgeId: "ab", fraction: 0.5 }, { roadEdgeId: "bc", fraction: 0.5 }])).toEqual([
      { roadEdgeId: "ab", forward: true, startFraction: 0.5, endFraction: 1 },
      { roadEdgeId: "bc", forward: true, startFraction: 0, endFraction: 0.5 },
      { roadEdgeId: "bc", forward: false, startFraction: 0.5, endFraction: 0 },
      { roadEdgeId: "ab", forward: false, startFraction: 1, endFraction: 0.5 },
    ]);
  });

  it("samples and measures only the requested part of an edge", () => {
    const partial: BusPathStep = { roadEdgeId: "ab", forward: true, startFraction: 0.25, endFraction: 0.75 };
    expect(sampleDirectedBusPath(city, line([partial]))).toEqual([{ x: 2.5, y: 0 }, { x: 7.5, y: 0 }]);
    expect(busPathDistance({ x: 0, y: 0 }, city, line([partial]))).toBe(2.5);
    expect(sampleDirectedBusPath(city, line([{ ...partial, forward: false, startFraction: 0.75, endFraction: 0.25 }]))).toEqual([{ x: 7.5, y: 0 }, { x: 2.5, y: 0 }]);
  });

  it("preserves legacy full-edge steps and samples curved partial steps by arc length", () => {
    const bend: RoadEdge = { id: "bend", roadId: "road", name: "Bend", startNodeId: "a", endNodeId: "d", structure: "ground", level: 0, geometry: { type: "polyline", points: [{ x: 10, y: 0 }] } };
    const bendCity = { ...city, roadEdges: [bend] } as City;
    expect(sampleDirectedBusPath(bendCity, line([{ roadEdgeId: "bend", forward: false }]))).toEqual([
      { id: "d", x: 10, y: 10 }, { x: 10, y: 0 }, { id: "a", x: 0, y: 0 },
    ]);
    const partial = line([{ roadEdgeId: "bend", forward: true, startFraction: 0.25, endFraction: 0.75 }]);
    expect(sampleDirectedBusPath(bendCity, partial)).toEqual([{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }]);
    expect(busPathDistance({ x: 0, y: 0 }, bendCity, partial)).toBe(5);
  });

  it("includes source and target partial costs when choosing a route", () => {
    const routeNodes: RoadNode[] = [
      { id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 100, y: 10 }, { id: "d", x: 0, y: 10 },
    ];
    const road = (id: string, startNodeId: string, endNodeId: string): RoadEdge => (
      { id, roadId: "road", name: id, startNodeId, endNodeId, structure: "ground", level: 0, geometry: { type: "line" } }
    );
    const routeCity = { ...city, roadNodes: routeNodes, roadEdges: [road("ab", "a", "b"), road("bc", "b", "c"), road("cd", "c", "d"), road("da", "d", "a")] } as City;
    expect(routeBetweenBusStops(routeCity, { roadEdgeId: "ab", fraction: 0.9 }, { roadEdgeId: "cd", fraction: 0.1 })).toEqual([
      { roadEdgeId: "ab", forward: true, startFraction: 0.9, endFraction: 1 },
      { roadEdgeId: "bc", forward: true, startFraction: 0, endFraction: 1 },
      { roadEdgeId: "cd", forward: true, startFraction: 0, endFraction: 0.1 },
    ]);
  });

  it("can leave and re-enter an edge when that is shorter than direct same-edge travel", () => {
    const detourNodes: RoadNode[] = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 50, y: 0 }];
    const road = (id: string, startNodeId: string, endNodeId: string, geometry: RoadEdge["geometry"] = { type: "line" }): RoadEdge => (
      { id, roadId: "road", name: id, startNodeId, endNodeId, structure: "ground", level: 0, geometry }
    );
    const detourCity = {
      ...city,
      roadNodes: detourNodes,
      roadEdges: [road("ab", "a", "b", { type: "polyline", points: [{ x: 0, y: 100 }, { x: 100, y: 100 }] }), road("ac", "a", "c"), road("cb", "c", "b")],
    } as City;
    expect(routeBetweenBusStops(detourCity, { roadEdgeId: "ab", fraction: 0.1 }, { roadEdgeId: "ab", fraction: 0.9 })).toEqual([
      { roadEdgeId: "ab", forward: false, startFraction: 0.1, endFraction: 0 },
      { roadEdgeId: "ac", forward: true, startFraction: 0, endFraction: 1 },
      { roadEdgeId: "cb", forward: true, startFraction: 0, endFraction: 1 },
      { roadEdgeId: "ab", forward: false, startFraction: 1, endFraction: 0.9 },
    ]);
  });

  it("weights shortest paths by sampled curved-road length", () => {
    const curvedNodes: RoadNode[] = [
      { id: "s", x: -10, y: 0 }, { id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 },
      { id: "c", x: 0, y: 10 }, { id: "d", x: 10, y: 10 }, { id: "t", x: 20, y: 10 },
    ];
    const road = (id: string, startNodeId: string, endNodeId: string, geometry: RoadEdge["geometry"] = { type: "line" }): RoadEdge => (
      { id, roadId: "road", name: id, startNodeId, endNodeId, structure: "ground", level: 0, geometry }
    );
    const curvedCity = {
      ...city,
      roadNodes: curvedNodes,
      roadEdges: [
        road("sa", "s", "a"), road("ab-curve", "a", "b", { type: "bezier", controlPoints: [{ x: 5, y: 30 }] }),
        road("bd", "b", "d"), road("ac", "a", "c"), road("cd", "c", "d"), road("dt", "d", "t"),
      ],
    } as City;
    expect(routeBetweenBusStops(curvedCity, { roadEdgeId: "sa", fraction: 1 }, { roadEdgeId: "dt", fraction: 0 })).toEqual([
      { roadEdgeId: "ac", forward: true, startFraction: 0, endFraction: 1 },
      { roadEdgeId: "cd", forward: true, startFraction: 0, endFraction: 1 },
    ]);
  });
});
