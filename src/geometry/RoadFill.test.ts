import { describe, expect, it, vi } from "vitest";
import type { City, RoadStructure } from "../model/City";
import { buildRoadFillFaceAt, buildRoadFillFaces, createRoadFillQuery, findRoadFillPolygon } from "./RoadFill";
import { zoneArea } from "./ZoneGeometry";
import * as RoadGeometry from "./RoadGeometry";

function square(structure: RoadStructure = "ground"): City {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  return { id: "fill", name: "Fill", bounds: { x: -50, y: -50, width: 200, height: 200 }, mapSize: "small", terrain: "flat", roadNodes: points.map((point, index) => ({ id: `n${index}`, ...point })), roads: points.map((_, index) => ({ id: `r${index}`, name: "", category: "normal", subtype: "small", width: 10, segmentIds: [`e${index}`] })), roadEdges: points.map((_, index) => ({ id: `e${index}`, roadId: `r${index}`, name: "", startNodeId: `n${index}`, endNodeId: `n${(index + 1) % points.length}`, structure, level: structure === "ground" ? 0 : structure === "elevated" ? 1 : -1, geometry: { type: "line" } })), buildings: [], blocks: [], zones: [], parks: [], districts: [], waters: [], pois: [], facilities: [], universities: [], hospitals: [], companies: [], transitLines: [], transitStations: [], busTerminals: [], busLines: [], busStops: [], labels: [] };
}

function addSquare(city: City, prefix: string, x: number, y = 0, size = 100): void {
  const loop = square();
  loop.roadNodes.forEach((node) => { node.id = `${prefix}-${node.id}`; node.x = x + node.x * size / 100; node.y = y + node.y * size / 100; });
  loop.roads.forEach((road) => { road.id = `${prefix}-${road.id}`; road.segmentIds = road.segmentIds.map((id) => `${prefix}-${id}`); });
  loop.roadEdges.forEach((edge) => { edge.id = `${prefix}-${edge.id}`; edge.roadId = `${prefix}-${edge.roadId}`; edge.startNodeId = `${prefix}-${edge.startNodeId}`; edge.endNodeId = `${prefix}-${edge.endNodeId}`; });
  city.roadNodes.push(...loop.roadNodes); city.roads.push(...loop.roads); city.roadEdges.push(...loop.roadEdges);
}

describe("road fill", () => {
  it("finds a bounded ground-road face and keeps its boundary beneath the roads", () => { const faces = buildRoadFillFaces(square()); const polygon = findRoadFillPolygon(faces, { x: 50, y: 50 }); expect(faces).toHaveLength(1); expect(faces[0]).toMatchObject({ boundaryRoadWidth: 10, bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 } }); expect(polygon).toHaveLength(4); expect(zoneArea(polygon!)).toBeCloseTo(10_000, 3); expect(findRoadFillPolygon(faces, { x: 101, y: 50 })).toBeUndefined(); });
  it("does not use elevated or tunnel roads as boundaries", () => { expect(buildRoadFillFaces(square("elevated"))).toHaveLength(0); expect(buildRoadFillFaces(square("tunnel"))).toHaveLength(0); });
  it("uses geometric ground crossings but ignores elevated and tunnel dividers", () => {
    const addDivider = (city: City, structure: RoadStructure) => { city.roadNodes.push({ id: "left", x: 0, y: 50 }, { id: "right", x: 100, y: 50 }); city.roads.push({ id: "divider", name: "", category: "normal", subtype: "small", width: 10, segmentIds: ["divider-edge"] }); city.roadEdges.push({ id: "divider-edge", roadId: "divider", name: "", startNodeId: "left", endNodeId: "right", structure, level: structure === "ground" ? 0 : structure === "elevated" ? 1 : -1, geometry: { type: "line" } }); return city; };
    expect(buildRoadFillFaces(addDivider(square(), "ground"))).toHaveLength(2); expect(buildRoadFillFaces(addDivider(square(), "elevated"))).toHaveLength(1); expect(buildRoadFillFaces(addDivider(square(), "tunnel"))).toHaveLength(1);
  });
  it("recognizes and aggressively simplifies a curved four-bezier road loop", () => { const city = square(); const k = 55.228; city.roadNodes = [{ id: "n0", x: 100, y: 0 }, { id: "n1", x: 0, y: 100 }, { id: "n2", x: -100, y: 0 }, { id: "n3", x: 0, y: -100 }]; city.roadEdges.forEach((edge, index) => { const controls = [[{ x: 100, y: k }, { x: k, y: 100 }], [{ x: -k, y: 100 }, { x: -100, y: k }], [{ x: -100, y: -k }, { x: -k, y: -100 }], [{ x: k, y: -100 }, { x: 100, y: -k }]][index]!; edge.geometry = { type: "bezier", controlPoints: controls }; }); const polygon = findRoadFillPolygon(buildRoadFillFaces(city), { x: 0, y: 0 }); expect(polygon!.length).toBeGreaterThanOrEqual(8); expect(polygon!.length).toBeLessThanOrEqual(16); expect(zoneArea(polygon!)).toBeGreaterThan(28_000); });
  it("keeps distant sampled curves out of local intersection checks", () => { const city = square(); for (let index = 0; index < 120; index += 1) { const x = 1_000 + index * 300; city.roadNodes.push({ id: `curve-a-${index}`, x, y: 0 }, { id: `curve-b-${index}`, x: x + 120, y: 100 }); city.roads.push({ id: `curve-road-${index}`, name: "", category: "normal", subtype: "small", width: 10, segmentIds: [`curve-${index}`] }); city.roadEdges.push({ id: `curve-${index}`, roadId: `curve-road-${index}`, name: "", startNodeId: `curve-a-${index}`, endNodeId: `curve-b-${index}`, structure: "ground", level: 0, geometry: { type: "bezier", controlPoints: [{ x: x + 40, y: -20 }, { x: x + 80, y: 120 }] } }); } const faces = buildRoadFillFaces(city); expect(faces).toHaveLength(1); expect(findRoadFillPolygon(faces, { x: 50, y: 50 })).toHaveLength(4); });
  it("builds only the road face around a selected point", () => { const city = square(); const distant = square(); distant.roadNodes.forEach((node) => { node.id = `d-${node.id}`; node.x += 10_000; }); distant.roads.forEach((road) => { road.id = `d-${road.id}`; road.segmentIds = road.segmentIds.map((id) => `d-${id}`); }); distant.roadEdges.forEach((edge) => { edge.id = `d-${edge.id}`; edge.roadId = `d-${edge.roadId}`; edge.startNodeId = `d-${edge.startNodeId}`; edge.endNodeId = `d-${edge.endNodeId}`; }); city.roadNodes.push(...distant.roadNodes); city.roads.push(...distant.roads); city.roadEdges.push(...distant.roadEdges); expect(buildRoadFillFaceAt(city, { x: 50, y: 50 })?.bounds).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 }); expect(buildRoadFillFaceAt(city, { x: 5_000, y: 50 })).toBeUndefined(); });
  it("does not sample distant curves when looking up a clicked block", () => {
    const city = square();
    for (let index = 0; index < 120; index += 1) {
      const x = 10_000 + index * 300;
      city.roadNodes.push({ id: `far-a-${index}`, x, y: 0 }, { id: `far-b-${index}`, x: x + 120, y: 100 });
      city.roads.push({ id: `far-road-${index}`, name: "", category: "normal", subtype: "small", width: 10, segmentIds: [`far-edge-${index}`] });
      city.roadEdges.push({ id: `far-edge-${index}`, roadId: `far-road-${index}`, name: "", startNodeId: `far-a-${index}`, endNodeId: `far-b-${index}`, structure: "ground", level: 0, geometry: { type: "bezier", controlPoints: [{ x: x + 40, y: -20 }, { x: x + 80, y: 120 }] } });
    }
    const sample = vi.spyOn(RoadGeometry, "sampleRoad");
    try {
      expect(buildRoadFillFaceAt(city, { x: 50, y: 50 })?.bounds).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
      expect(sample.mock.calls.map(([edge]) => edge.id)).toEqual(["e0", "e1", "e2", "e3"]);
      expect(sample.mock.calls.every(([, nodes]) => nodes.size === 4)).toBe(true);
    } finally { sample.mockRestore(); }
  });
  it("expands the local search for a large block without losing a curved boundary", () => {
    const city = square(); city.roadNodes.forEach((node) => { node.x *= 20; node.y *= 20; });
    city.roadEdges[0]!.geometry = { type: "bezier", controlPoints: [{ x: 600, y: -180 }, { x: 1400, y: -180 }] };
    const expected = buildRoadFillFaces(city)[0]!;
    expect(buildRoadFillFaceAt(city, { x: 1000, y: 1000 })).toEqual(expected);
    expect(buildRoadFillFaceAt(city, { x: NaN, y: 0 })).toBeUndefined();
  });

  it("indexes bounds once and reuses neighboring faces without sampling or rebuilding unrelated roads", () => {
    const city = square(); addSquare(city, "neighbor", 140);
    for (let index = 0; index < 120; index += 1) addSquare(city, `far-${index}`, 10_000 + index * 1000);
    const originalBounds = RoadGeometry.roadBounds; let boundsReads = 0;
    const bounds = vi.spyOn(RoadGeometry, "roadBounds").mockImplementation((...args) => {
      const result = originalBounds(...args);
      return result && new Proxy(result, { get(target, key) { boundsReads += 1; return Reflect.get(target, key); } });
    });
    const sample = vi.spyOn(RoadGeometry, "sampleRoad"); const intersections = vi.spyOn(RoadGeometry, "segmentIntersection");
    const nodeMap = vi.spyOn(city.roadNodes, "map"); const roadMap = vi.spyOn(city.roads, "map");
    try {
      const query = createRoadFillQuery(city);
      expect(bounds).toHaveBeenCalledTimes(city.roadEdges.length);
      expect(sample).not.toHaveBeenCalled(); expect(intersections).not.toHaveBeenCalled();
      boundsReads = 0;
      const first = query({ x: 50, y: 50 });
      expect(first?.area).toBe(10_000);
      expect(boundsReads).toBeLessThan(city.roadEdges.length);
      const reads = boundsReads; const builds = intersections.mock.calls.length;
      expect(builds).toBeGreaterThan(0);
      const neighbor = query({ x: 190, y: 50 }); expect(neighbor?.bounds.minX).toBe(140);
      for (let index = 1; index < 100; index += 1) {
        expect(query({ x: index, y: 50 })).toBe(first);
        expect(query({ x: 140 + index, y: 50 })).toBe(neighbor);
      }
      expect(sample.mock.calls.map(([edge]) => edge.id)).toEqual(["e0", "e1", "e2", "e3", "neighbor-e0", "neighbor-e1", "neighbor-e2", "neighbor-e3"]);
      expect(intersections).toHaveBeenCalledTimes(builds); expect(boundsReads).toBe(reads);
      // Moving outside the cached window must still use the index, not a bounds scan.
      boundsReads = 0;
      expect(query({ x: 10_050, y: 50 })?.bounds.minX).toBe(10_000);
      expect(boundsReads).toBeLessThan(city.roadEdges.length);
      expect(query({ x: 50, y: 50 })).toBe(first);
      expect(sample).toHaveBeenCalledTimes(12);
      expect(bounds).toHaveBeenCalledTimes(city.roadEdges.length);
      expect(nodeMap).toHaveBeenCalledTimes(1); expect(roadMap).toHaveBeenCalledTimes(1);
    } finally { bounds.mockRestore(); sample.mockRestore(); intersections.mockRestore(); nodeMap.mockRestore(); roadMap.mockRestore(); }
  });

  it("searches the cached face set when moving from an outer loop into a smaller nested loop", () => {
    const city = square(); addSquare(city, "inner", 35, 35, 30); addSquare(city, "far", 10_000);
    const sample = vi.spyOn(RoadGeometry, "sampleRoad"); const intersections = vi.spyOn(RoadGeometry, "segmentIntersection");
    try {
      const query = createRoadFillQuery(city); const outer = query({ x: 20, y: 20 }); const builds = intersections.mock.calls.length;
      expect(outer?.area).toBe(10_000);
      const inner = query({ x: 50, y: 50 }); expect(inner?.area).toBe(900);
      expect(query({ x: 80, y: 80 })).toBe(outer); expect(query({ x: 40, y: 40 })).toBe(inner);
      expect(sample).toHaveBeenCalledTimes(8); expect(intersections).toHaveBeenCalledTimes(builds);
    } finally { sample.mockRestore(); intersections.mockRestore(); }
  });

  it("does not trust an oversized cached face that extends beyond its completeness window", () => {
    const city = square(); addSquare(city, "outer", -1000, -1000, 2000); addSquare(city, "far", 10_000);
    const outer = city.roadEdges.find((edge) => edge.id === "outer-e0")!;
    outer.endNodeId = outer.startNodeId;
    outer.geometry = { type: "polyline", points: [{ x: 1000, y: -1000 }, { x: 1000, y: 1000 }, { x: -1000, y: 1000 }] };
    city.roadEdges = city.roadEdges.filter((edge) => !edge.id.startsWith("outer-") || edge === outer);
    city.roadNodes.push({ id: "divider-a", x: 500, y: -1000 }, { id: "divider-b", x: 500, y: 1000 });
    city.roadEdges.push({ ...city.roadEdges[0]!, id: "divider", startNodeId: "divider-a", endNodeId: "divider-b" });
    const sample = vi.spyOn(RoadGeometry, "sampleRoad");
    try {
      const query = createRoadFillQuery(city);
      expect(query({ x: 50, y: 50 })?.area).toBe(10_000); expect(sample).toHaveBeenCalledTimes(5);
      // Still inside the first search window, but outside the certified small face.
      const face = query({ x: 200, y: 50 });
      expect(face?.bounds).toEqual({ minX: -1000, minY: -1000, maxX: 500, maxY: 1000 });
      expect(face?.area).toBe(3_000_000);
      // Enlarging a window over the same five/six roads never rebuilds that subset.
      expect(sample).toHaveBeenCalledTimes(11);
      expect(sample.mock.calls.some(([edge]) => edge.id.startsWith("far-"))).toBe(false);
      expect(query({ x: 750, y: 50 })?.area).toBe(1_000_000); expect(sample).toHaveBeenCalledTimes(11);
    } finally { sample.mockRestore(); }
  });

  it("expands a cached local miss to find a surrounding block with all boundaries outside the initial window", () => {
    const city = square(); addSquare(city, "outer", -2000, -2000, 4000); addSquare(city, "far", 10_000);
    const sample = vi.spyOn(RoadGeometry, "sampleRoad");
    try {
      const query = createRoadFillQuery(city);
      expect(query({ x: 50, y: 50 })?.area).toBe(10_000); expect(sample).toHaveBeenCalledTimes(4);
      const outer = query({ x: 200, y: 50 }); expect(outer?.area).toBe(16_000_000);
      const calls = sample.mock.calls.length;
      expect(query({ x: 200, y: 50 })).toBe(outer); expect(query({ x: 201, y: 51 })).toBe(outer);
      expect(sample).toHaveBeenCalledTimes(calls);
      expect(sample.mock.calls.some(([edge]) => edge.id.startsWith("far-"))).toBe(false);
    } finally { sample.mockRestore(); }
  });

  it("caches complete open-area misses and does not rebuild identical subsets during expansion", () => {
    const city = square(); city.roadEdges = city.roadEdges.slice(0, 1); addSquare(city, "far", 10_000);
    const sample = vi.spyOn(RoadGeometry, "sampleRoad"); const intersections = vi.spyOn(RoadGeometry, "segmentIntersection");
    try {
      const query = createRoadFillQuery(city);
      expect(query({ x: 50, y: 50 })).toBeUndefined();
      expect(sample).toHaveBeenCalledTimes(6); const builds = intersections.mock.calls.length;
      for (const point of [{ x: 50, y: 50 }, { x: 51, y: 51 }, { x: 200, y: 50 }, { x: Number.MAX_VALUE, y: 50 }]) expect(query(point)).toBeUndefined();
      expect(query({ x: 10_050, y: 50 })?.area).toBe(10_000);
      expect(sample).toHaveBeenCalledTimes(6); expect(intersections).toHaveBeenCalledTimes(builds);
    } finally { sample.mockRestore(); intersections.mockRestore(); }
  });

  it("sees an in-place ground divider edit after the caller discards the old query", () => {
    const city = square(); const original = createRoadFillQuery(city)({ x: 25, y: 25 });
    expect(original?.area).toBe(10_000);
    city.roadNodes.push({ id: "left", x: 0, y: 50 }, { id: "right", x: 100, y: 50 });
    city.roadEdges.push({ ...city.roadEdges[0]!, id: "divider", startNodeId: "left", endNodeId: "right" });
    const query = createRoadFillQuery(city);
    expect(query({ x: 25, y: 25 })?.area).toBe(5000); expect(query({ x: 25, y: 75 })?.area).toBe(5000);
    expect(query({ x: 25, y: 50 })).toBeUndefined();
    expect(buildRoadFillFaceAt(city, { x: 25, y: 25 })).toEqual(query({ x: 25, y: 25 }));
  });

  it("reuses large curved blocks after expanding an unchanged road subset", () => {
    const city = square(); city.roadNodes.forEach((node) => { node.x *= 20; node.y *= 20; });
    city.roadEdges[0]!.geometry = { type: "bezier", controlPoints: [{ x: 600, y: -180 }, { x: 1400, y: -180 }] };
    const expected = buildRoadFillFaces(city)[0]!; addSquare(city, "far", 100_000);
    const sample = vi.spyOn(RoadGeometry, "sampleRoad");
    try {
      const query = createRoadFillQuery(city); const face = query({ x: 1000, y: 1000 });
      expect(face).toEqual(expected); expect(query({ x: 1001, y: 990 })).toBe(face);
      expect(sample.mock.calls.map(([edge]) => edge.id)).toEqual(["e0", "e1", "e2", "e3"]);
    } finally { sample.mockRestore(); }
  });

  it("requires strict containment when a face touches the search window boundary", () => {
    const city = square(); city.roadNodes.forEach((node) => { node.x *= 5.12; node.y *= 5.12; });
    addSquare(city, "near", 600, 600); addSquare(city, "far", 10_000);
    const sample = vi.spyOn(RoadGeometry, "sampleRoad");
    try {
      expect(createRoadFillQuery(city)({ x: 256, y: 256 })?.area).toBe(512 * 512);
      expect(sample).toHaveBeenCalledTimes(12);
      expect(sample.mock.calls.some(([edge]) => edge.id.startsWith("far-"))).toBe(false);
    } finally { sample.mockRestore(); }
  });

  it("rejects nonfinite and boundary points without corrupting cached hits", () => {
    const sample = vi.spyOn(RoadGeometry, "sampleRoad");
    try {
      const query = createRoadFillQuery(square());
      const invalid = [{ x: NaN, y: 50 }, { x: 50, y: NaN }, { x: Infinity, y: 50 }, { x: 50, y: -Infinity }, { x: -Infinity, y: Infinity }];
      for (const point of invalid) expect(query(point)).toBeUndefined();
      expect(sample).not.toHaveBeenCalled();
      const face = query({ x: 50, y: 50 }); expect(face?.area).toBe(10_000);
      for (const point of [...invalid, { x: 0, y: 50 }, { x: 50, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 0 }, { x: 101, y: 50 }]) expect(query(point)).toBeUndefined();
      expect(query({ x: 50, y: 50 })).toBe(face); expect(query({ x: 0.01, y: 50 })).toBe(face);
      expect(sample).toHaveBeenCalledTimes(4);
    } finally { sample.mockRestore(); }
  });

  it.each(["elevated", "tunnel"] as const)("does not index or sample %s boundaries or dividers", (structure) => {
    const sample = vi.spyOn(RoadGeometry, "sampleRoad"); const bounds = vi.spyOn(RoadGeometry, "roadBounds");
    try {
      expect(createRoadFillQuery(square(structure))({ x: 50, y: 50 })).toBeUndefined();
      expect(sample).not.toHaveBeenCalled(); expect(bounds).not.toHaveBeenCalled();
      const city = square();
      city.roadNodes.push({ id: "left", x: 0, y: 50 }, { id: "right", x: 100, y: 50 });
      city.roadEdges.push({ ...city.roadEdges[0]!, id: "divider", startNodeId: "left", endNodeId: "right", structure, level: structure === "elevated" ? 1 : -1 });
      expect(createRoadFillQuery(city)({ x: 50, y: 50 })?.area).toBe(10_000);
      expect(sample).toHaveBeenCalledTimes(4); expect(bounds).toHaveBeenCalledTimes(4);
    } finally { sample.mockRestore(); bounds.mockRestore(); }
  });
});
