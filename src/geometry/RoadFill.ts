import type { City } from "../model/City";
import type { Point } from "./Point";
import { pointInPolygon } from "./Polygon";
import { sampleRoad, segmentIntersection } from "./RoadGeometry";

interface Primitive { a: Point; b: Point; width: number; cuts: number[] }
interface Fragment { a: number; b: number; width: number }
interface HalfEdge { fragment: number; from: number; to: number; width: number }

export interface RoadFillFace { centerline: Point[]; polygon: Point[]; area: number }

const EPSILON = 1e-5;

export function buildRoadFillFaces(city: City): RoadFillFace[] {
  const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const roads = new Map(city.roads.map((road) => [road.id, road])); const primitives: Primitive[] = [];
  for (const edge of city.roadEdges) {
    if (edge.structure !== "ground") continue; const road = roads.get(edge.roadId); if (!road || !Number.isFinite(road.width) || road.width <= 0) continue; const path = sampleRoad(edge, nodes, edge.geometry.type === "bezier" ? 64 : 28);
    for (let index = 1; index < path.length; index += 1) { const a = path[index - 1]!; const b = path[index]!; if (Math.hypot(b.x - a.x, b.y - a.y) > EPSILON) primitives.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, width: road.width, cuts: [0, 1] }); }
  }
  for (let first = 0; first < primitives.length; first += 1) for (let second = first + 1; second < primitives.length; second += 1) {
    const a = primitives[first]!; const b = primitives[second]!; if (!boxesOverlap(a, b)) continue; const crossing = segmentIntersection(a.a, a.b, b.a, b.b); if (!crossing) continue; a.cuts.push(clampUnit(crossing.t)); b.cuts.push(clampUnit(crossing.u));
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
    const signed = signedArea(ring); if (!closed || ring.length < 3 || signed <= 0.01) continue; const polygon = insetFace(ring, widths); const insetArea = Math.abs(signedArea(polygon)); if (polygon.length >= 3 && insetArea > 0.01) faces.push({ centerline: ring.map(copyPoint), polygon, area: signed });
  }
  return faces.sort((a, b) => a.area - b.area);
}

export function findRoadFillPolygon(faces: RoadFillFace[], point: Point): Point[] | undefined {
  return faces.find((face) => pointInPolygon(point, face.centerline, { includeBoundary: false }))?.polygon.map(copyPoint);
}

function insetFace(points: Point[], widths: number[]): Point[] {
  const result: Point[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]!; const current = points[index]!; const next = points[(index + 1) % points.length]!; const previousLine = offsetLine(previous, current, (widths[(index - 1 + widths.length) % widths.length] ?? 0) / 2); const currentLine = offsetLine(current, next, (widths[index] ?? 0) / 2); const crossing = infiniteLineIntersection(previousLine.a, previousLine.b, currentLine.a, currentLine.b);
    const fallback = { x: (previousLine.b.x + currentLine.a.x) / 2, y: (previousLine.b.y + currentLine.a.y) / 2 }; const maximumMiter = Math.max(widths[(index - 1 + widths.length) % widths.length] ?? 0, widths[index] ?? 0) * 4; result.push(crossing && Math.hypot(crossing.x - current.x, crossing.y - current.y) <= maximumMiter ? crossing : fallback);
  }
  return result.filter((point, index, values) => index === 0 || Math.hypot(point.x - values[index - 1]!.x, point.y - values[index - 1]!.y) > EPSILON);
}

function offsetLine(a: Point, b: Point, offset: number): { a: Point; b: Point } { const dx = b.x - a.x; const dy = b.y - a.y; const length = Math.hypot(dx, dy) || 1; const nx = -dy / length; const ny = dx / length; return { a: { x: a.x + nx * offset, y: a.y + ny * offset }, b: { x: b.x + nx * offset, y: b.y + ny * offset } }; }
function infiniteLineIntersection(a: Point, b: Point, c: Point, d: Point): Point | undefined { const rx = b.x - a.x; const ry = b.y - a.y; const sx = d.x - c.x; const sy = d.y - c.y; const denominator = rx * sy - ry * sx; if (Math.abs(denominator) < 1e-9) return undefined; const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denominator; return { x: a.x + rx * t, y: a.y + ry * t }; }
function addOutgoing(outgoing: Map<number, HalfEdge[]>, edge: HalfEdge): void { const list = outgoing.get(edge.from) ?? []; list.push(edge); outgoing.set(edge.from, list); }
function edgeKey(edge: HalfEdge): string { return `${edge.fragment}:${edge.from}`; }
function angle(a: Point, b: Point): number { return Math.atan2(b.y - a.y, b.x - a.x); }
function signedArea(points: Point[]): number { return points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]!; return sum + point.x * next.y - next.x * point.y; }, 0) / 2; }
function boxesOverlap(a: Primitive, b: Primitive): boolean { return Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x)) <= Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x)) + EPSILON && Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y)) <= Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y)) + EPSILON; }
function lerp(a: Point, b: Point, t: number): Point { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
function clampUnit(value: number): number { return Math.max(0, Math.min(1, value)); }
function copyPoint(point: Point): Point { return { x: point.x, y: point.y }; }
