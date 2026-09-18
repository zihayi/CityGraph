import type { City, Road, RoadEdge, RoadNode } from "../model/City";
import type { Point } from "./Point";
import { pointInPolygon, simplifyClosedPolygon } from "./Polygon";
import { roadBounds, sampleRoad, segmentIntersection, type RoadBounds } from "./RoadGeometry";

interface Primitive { a: Point; b: Point; width: number; cuts: number[] }
interface Fragment { a: number; b: number; width: number }
interface HalfEdge { fragment: number; from: number; to: number; width: number }
interface RoadFillCandidate { edge: RoadEdge; bounds: RoadBounds; order: number }
type RoadFillIndex = { bounds: RoadBounds } & ({ candidates: RoadFillCandidate[] } | { left: RoadFillIndex; right: RoadFillIndex });
interface RoadFillWindow { key: string; bounds: RoadBounds; faces: RoadFillFace[]; complete: boolean }

export interface RoadFillFace { centerline: Point[]; polygon: Point[]; area: number; boundaryRoadWidth: number; boundaryRoadWidths: number[]; bounds: { minX: number; minY: number; maxX: number; maxY: number } }

const EPSILON = 1e-5;
const INTERSECTION_CELL_SIZE = 256;
const QUERY_CACHE_SIZE = 4;

export function buildRoadFillFaces(city: City): RoadFillFace[] {
  return buildFaces(city.roadEdges, new Map(city.roadNodes.map((node) => [node.id, node])), new Map(city.roads.map((road) => [road.id, road])));
}

function buildFaces(edges: readonly RoadEdge[], nodes: Map<string, RoadNode>, roads: ReadonlyMap<string, Road>): RoadFillFace[] {
  const primitives: Primitive[] = [];
  for (const edge of edges) {
    if (edge.structure !== "ground") continue; const road = roads.get(edge.roadId); if (!road || !Number.isFinite(road.width) || road.width <= 0) continue; const path = sampleRoad(edge, nodes, edge.geometry.type === "bezier" ? 64 : 28);
    for (let index = 1; index < path.length; index += 1) { const a = path[index - 1]!; const b = path[index]!; if (Math.hypot(b.x - a.x, b.y - a.y) > EPSILON) primitives.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, width: road.width, cuts: [0, 1] }); }
  }
  const intersectionCells = new Map<string, number[]>();
  for (let index = 0; index < primitives.length; index += 1) {
    const primitive = primitives[index]!; const cells = primitiveGridCells(primitive); const candidates = new Set<number>(); for (const cell of cells) for (const candidate of intersectionCells.get(cell) ?? []) candidates.add(candidate);
    for (const candidate of candidates) { const other = primitives[candidate]!; if (!boxesOverlap(primitive, other)) continue; const crossing = segmentIntersection(primitive.a, primitive.b, other.a, other.b); if (!crossing) continue; primitive.cuts.push(clampUnit(crossing.t)); other.cuts.push(clampUnit(crossing.u)); }
    for (const cell of cells) { const entries = intersectionCells.get(cell) ?? []; entries.push(index); intersectionCells.set(cell, entries); }
  }
  const vertices: Point[] = []; const vertexIds = new Map<string, number>(); const fragments: Fragment[] = [];
  const vertexId = (point: Point) => { const key = `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)}`; const existing = vertexIds.get(key); if (existing !== undefined) return existing; const id = vertices.length; vertices.push(point); vertexIds.set(key, id); return id; };
  for (const primitive of primitives) {
    const cuts = [...primitive.cuts].sort((a, b) => a - b).filter((value, index, values) => index === 0 || value - values[index - 1]! > EPSILON);
    for (let index = 1; index < cuts.length; index += 1) { const start = lerp(primitive.a, primitive.b, cuts[index - 1]!); const end = lerp(primitive.a, primitive.b, cuts[index]!); const a = vertexId(start); const b = vertexId(end); if (a !== b) fragments.push({ a, b, width: primitive.width }); }
  }
  const halfEdges: HalfEdge[] = []; const outgoing = new Map<number, HalfEdge[]>();
  fragments.forEach((fragment, index) => { const forward = { fragment: index, from: fragment.a, to: fragment.b, width: fragment.width }; const backward = { fragment: index, from: fragment.b, to: fragment.a, width: fragment.width }; halfEdges.push(forward, backward); addOutgoing(outgoing, forward); addOutgoing(outgoing, backward); });
  for (const [vertex, edges] of outgoing) edges.sort((a, b) => angle(vertices[vertex]!, vertices[a.to]!) - angle(vertices[vertex]!, vertices[b.to]!));
  const visited = new Set<string>(); const faces: RoadFillFace[] = [];
  for (const start of halfEdges) {
    const startKey = edgeKey(start); if (visited.has(startKey)) continue; const ring: Point[] = []; const widths: number[] = []; let current = start; let closed = false;
    for (let guard = 0; guard <= halfEdges.length + 1; guard += 1) {
      const key = edgeKey(current); if (visited.has(key)) { closed = key === startKey; break; } visited.add(key); ring.push(vertices[current.from]!); widths.push(current.width);
      const choices = outgoing.get(current.to) ?? []; const twinIndex = choices.findIndex((edge) => edge.fragment === current.fragment && edge.to === current.from); if (twinIndex < 0 || choices.length === 0) break; current = choices[(twinIndex - 1 + choices.length) % choices.length]!;
    }
    const signed = signedArea(ring); if (!closed || ring.length < 3 || signed <= 0.01) continue; const tolerance = Math.max(1, Math.min(...widths) * 0.45); const polygon = safeSimplification(ring, simplifyClosedPolygon(ring, tolerance)); const polygonArea = Math.abs(signedArea(polygon)); if (polygon.length >= 3 && polygonArea > 0.01) faces.push({ centerline: ring.map(copyPoint), polygon, area: signed, boundaryRoadWidth: Math.max(...widths), boundaryRoadWidths: [...widths], bounds: polygonBounds(ring) });
  }
  return faces.sort((a, b) => a.area - b.area);
}

export function findRoadFillPolygon(faces: RoadFillFace[], point: Point): Point[] | undefined {
  return findRoadFillFace(faces, point)?.polygon.map(copyPoint);
}

export function findRoadFillFace(faces: readonly RoadFillFace[], point: Point): RoadFillFace | undefined { return faces.find((face) => point.x > face.bounds.minX && point.x < face.bounds.maxX && point.y > face.bounds.minY && point.y < face.bounds.maxY && pointInPolygon(point, face.centerline, { includeBoundary: false })); }

export function buildRoadFillFaceAt(city: City, point: Point): RoadFillFace | undefined {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
  return createRoadFillQuery(city)(point);
}

/** Reuse until roads/nodes/city change, then discard. Returned faces belong to the query cache. */
export function createRoadFillQuery(city: City): (point: Point) => RoadFillFace | undefined {
  const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const roads = new Map(city.roads.map((road) => [road.id, road]));
  const candidates: RoadFillCandidate[] = city.roadEdges.flatMap((edge, order) => {
    const road = roads.get(edge.roadId);
    if (edge.structure !== "ground" || !road || !Number.isFinite(road.width) || road.width <= 0) return [];
    // Include the topology builder's 0.001-unit vertex snapping tolerance.
    const bounds = roadBounds(edge, nodes, 0.001);
    return bounds && Object.values(bounds).every(Number.isFinite) ? [{ edge, bounds, order }] : [];
  });
  const index = candidates.length ? buildRoadFillIndex(candidates) : undefined;
  const cache: RoadFillWindow[] = [];
  return (point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !index) return undefined;
    // No bounded face can extend outside the bounds of all eligible roads.
    if (!pointInsideBounds(point, index.bounds)) return undefined;
    for (let entryIndex = 0; entryIndex < cache.length; entryIndex += 1) {
      const entry = cache[entryIndex]!;
      if (!entry.complete && !pointInsideBounds(point, entry.bounds)) continue;
      const face = findRoadFillFace(entry.faces, point);
      // Search the whole sorted face set, never just the previously hit face:
      // disconnected nested loops may provide a smaller containing face.
      if (entry.complete || (face && boundsStrictlyInside(face.bounds, entry.bounds))) {
        cache.splice(entryIndex, 1); cache.unshift(entry);
        return face;
      }
    }
    for (let radius = INTERSECTION_CELL_SIZE; ; radius *= 2) {
      const window = { minX: point.x - radius, minY: point.y - radius, maxX: point.x + radius, maxY: point.y + radius };
      const selected: RoadFillCandidate[] = []; queryRoadFillIndex(index, window, selected);
      selected.sort((a, b) => a.order - b.order);
      const key = selected.map((candidate) => candidate.order).join(",");
      const entryIndex = cache.findIndex((entry) => entry.key === key);
      let entry: RoadFillWindow;
      if (entryIndex >= 0) {
        entry = cache.splice(entryIndex, 1)[0]!;
        // An unchanged subset needs only a new completeness window, not topology.
        entry.bounds = window;
      } else {
        const localNodes = new Map<string, RoadNode>();
        for (const { edge } of selected) {
          localNodes.set(edge.startNodeId, nodes.get(edge.startNodeId)!);
          localNodes.set(edge.endNodeId, nodes.get(edge.endNodeId)!);
        }
        entry = { key, bounds: window, faces: buildFaces(selected.map((candidate) => candidate.edge), localNodes, roads), complete: selected.length === candidates.length };
      }
      cache.unshift(entry); if (cache.length > QUERY_CACHE_SIZE) cache.pop();
      const face = findRoadFillFace(entry.faces, point);
      // A partial-window miss is not evidence of open space: keep expanding.
      if (entry.complete || (face && boundsStrictlyInside(face.bounds, window))) return face;
    }
  };
}

function buildRoadFillIndex(candidates: RoadFillCandidate[]): RoadFillIndex {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const candidate of candidates) {
    bounds.minX = Math.min(bounds.minX, candidate.bounds.minX); bounds.minY = Math.min(bounds.minY, candidate.bounds.minY);
    bounds.maxX = Math.max(bounds.maxX, candidate.bounds.maxX); bounds.maxY = Math.max(bounds.maxY, candidate.bounds.maxY);
  }
  if (candidates.length <= 8) return { bounds, candidates };
  const axis = bounds.maxX - bounds.minX >= bounds.maxY - bounds.minY ? "X" : "Y";
  candidates.sort((a, b) => (a.bounds[`min${axis}`] / 2 + a.bounds[`max${axis}`] / 2) - (b.bounds[`min${axis}`] / 2 + b.bounds[`max${axis}`] / 2));
  const middle = Math.floor(candidates.length / 2);
  // A bounds tree stores even city-spanning curves only once, unlike a dense grid.
  return { bounds, left: buildRoadFillIndex(candidates.slice(0, middle)), right: buildRoadFillIndex(candidates.slice(middle)) };
}

function queryRoadFillIndex(index: RoadFillIndex, window: RoadBounds, result: RoadFillCandidate[]): void {
  if (!boundsOverlap(index.bounds, window)) return;
  if ("candidates" in index) {
    for (const candidate of index.candidates) if (boundsOverlap(candidate.bounds, window)) result.push(candidate);
  } else {
    queryRoadFillIndex(index.left, window, result); queryRoadFillIndex(index.right, window, result);
  }
}

function safeSimplification(original: Point[], simplified: Point[]): Point[] {
  if (simplified.length >= original.length || simplified.length < 3) return original;
  const originalArea = signedArea(original); const simplifiedArea = signedArea(simplified); const areaChange = Math.abs(simplifiedArea - originalArea) / Math.max(Math.abs(originalArea), EPSILON);
  if (originalArea * simplifiedArea <= 0 || areaChange > 0.1 || polygonSelfIntersects(simplified)) return original;
  return simplified;
}

function polygonSelfIntersects(points: Point[]): boolean {
  for (let first = 0; first < points.length; first += 1) {
    const firstEnd = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondEnd = (second + 1) % points.length; const adjacent = first === second || firstEnd === second || secondEnd === first;
      if (!adjacent && segmentIntersection(points[first]!, points[firstEnd]!, points[second]!, points[secondEnd]!)) return true;
    }
  }
  return false;
}

function addOutgoing(outgoing: Map<number, HalfEdge[]>, edge: HalfEdge): void { const list = outgoing.get(edge.from) ?? []; list.push(edge); outgoing.set(edge.from, list); }
function edgeKey(edge: HalfEdge): string { return `${edge.fragment}:${edge.from}`; }
function angle(a: Point, b: Point): number { return Math.atan2(b.y - a.y, b.x - a.x); }
function signedArea(points: Point[]): number { return points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]!; return sum + point.x * next.y - next.x * point.y; }, 0) / 2; }
function polygonBounds(points: readonly Point[]): RoadFillFace["bounds"] { return points.reduce((bounds, point) => ({ minX: Math.min(bounds.minX, point.x), minY: Math.min(bounds.minY, point.y), maxX: Math.max(bounds.maxX, point.x), maxY: Math.max(bounds.maxY, point.y) }), { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY }); }
function boundsOverlap(a: RoadFillFace["bounds"], b: RoadFillFace["bounds"]): boolean { return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY; }
function pointInsideBounds(point: Point, bounds: RoadBounds): boolean { return point.x > bounds.minX && point.x < bounds.maxX && point.y > bounds.minY && point.y < bounds.maxY; }
function boundsStrictlyInside(inner: RoadBounds, outer: RoadBounds): boolean { return inner.minX > outer.minX && inner.minY > outer.minY && inner.maxX < outer.maxX && inner.maxY < outer.maxY; }
function boxesOverlap(a: Primitive, b: Primitive): boolean { return Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x)) <= Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x)) + EPSILON && Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y)) <= Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y)) + EPSILON; }
function primitiveGridCells(primitive: Primitive): string[] {
  let x = Math.floor(primitive.a.x / INTERSECTION_CELL_SIZE); let y = Math.floor(primitive.a.y / INTERSECTION_CELL_SIZE); const endX = Math.floor(primitive.b.x / INTERSECTION_CELL_SIZE); const endY = Math.floor(primitive.b.y / INTERSECTION_CELL_SIZE); const dx = primitive.b.x - primitive.a.x; const dy = primitive.b.y - primitive.a.y; const stepX = Math.sign(dx); const stepY = Math.sign(dy); const deltaX = stepX === 0 ? Number.POSITIVE_INFINITY : INTERSECTION_CELL_SIZE / Math.abs(dx); const deltaY = stepY === 0 ? Number.POSITIVE_INFINITY : INTERSECTION_CELL_SIZE / Math.abs(dy); let nextX = stepX === 0 ? Number.POSITIVE_INFINITY : (((stepX > 0 ? x + 1 : x) * INTERSECTION_CELL_SIZE) - primitive.a.x) / dx; let nextY = stepY === 0 ? Number.POSITIVE_INFINITY : (((stepY > 0 ? y + 1 : y) * INTERSECTION_CELL_SIZE) - primitive.a.y) / dy; const cells = new Set<string>(); const add = (cellX: number, cellY: number) => cells.add(`${cellX},${cellY}`); add(x, y);
  const limit = Math.abs(endX - x) + Math.abs(endY - y) + 2; for (let guard = 0; (x !== endX || y !== endY) && guard < limit; guard += 1) { if (Math.abs(nextX - nextY) <= 1e-12) { add(x + stepX, y); add(x, y + stepY); x += stepX; y += stepY; nextX += deltaX; nextY += deltaY; } else if (nextX < nextY) { x += stepX; nextX += deltaX; } else { y += stepY; nextY += deltaY; } add(x, y); }
  return [...cells];
}
function lerp(a: Point, b: Point, t: number): Point { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
function clampUnit(value: number): number { return Math.max(0, Math.min(1, value)); }
function copyPoint(point: Point): Point { return { x: point.x, y: point.y }; }
