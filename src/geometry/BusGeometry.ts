import type { BusLine, BusStop, City, RoadEdge, RoadNode } from "../model/City";
import type { Point } from "./Point";
import { distance, pointToSegmentDistance, sampleRoad } from "./RoadGeometry";

const ROAD_SAMPLES = 128;
const JOIN_EPSILON = 1e-6;

export interface RoadLocation {
  point: Point;
  tangent: Point;
  fraction: number;
  distance: number;
}

export interface RoadFractionPoint {
  point: Point;
  tangent: Point;
}

export interface BusStopGeometry {
  roadPoint: Point;
  stopPoint: Point;
  tangent: Point;
}

function unitTangent(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  return length > 0 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
}

function sampledRoad(edge: RoadEdge, nodes: Map<string, RoadNode>): { points: Point[]; lengths: number[]; total: number } {
  const points = sampleRoad(edge, nodes, ROAD_SAMPLES);
  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = start && end ? distance(start, end) : 0;
    lengths.push(length);
    total += length;
  }
  return { points, lengths, total };
}

export function sampleDirectedBusPathSegments(city: City, line: BusLine): Point[][] {
  const edges = new Map(city.roadEdges.map((edge) => [edge.id, edge]));
  const nodes = new Map(city.roadNodes.map((node) => [node.id, node]));
  const result: Point[][] = [];
  for (const step of line.path) {
    const edge = edges.get(step.roadEdgeId);
    if (!edge) continue;
    const sampled = sampleRoad(edge, nodes, ROAD_SAMPLES);
    const path = step.forward ? sampled : [...sampled].reverse();
    if (path.length < 2) continue;
    const previous = result[result.length - 1];
    if (previous && distance(previous[previous.length - 1]!, path[0]!) <= JOIN_EPSILON) previous.push(...path.slice(1));
    else result.push(path);
  }
  return result;
}

export function sampleDirectedBusPath(city: City, line: BusLine): Point[] {
  return sampleDirectedBusPathSegments(city, line).flat();
}

export function locatePointOnRoad(point: Point, edge: RoadEdge, nodes: Map<string, RoadNode>): RoadLocation | undefined {
  const sampled = sampledRoad(edge, nodes);
  let nearest: RoadLocation | undefined;
  let traversed = 0;
  for (let index = 1; index < sampled.points.length; index += 1) {
    const start = sampled.points[index - 1];
    const end = sampled.points[index];
    const length = sampled.lengths[index - 1] ?? 0;
    if (!start || !end || length === 0) continue;
    const tangent = unitTangent(start, end);
    const along = Math.max(0, Math.min(length, (point.x - start.x) * tangent.x + (point.y - start.y) * tangent.y));
    const projected = { x: start.x + tangent.x * along, y: start.y + tangent.y * along };
    const candidate: RoadLocation = {
      point: projected,
      tangent,
      fraction: sampled.total > 0 ? (traversed + along) / sampled.total : 0,
      distance: distance(point, projected),
    };
    if (!nearest || candidate.distance < nearest.distance) nearest = candidate;
    traversed += length;
  }
  const only = sampled.points[0];
  return nearest ?? (only ? { point: { x: only.x, y: only.y }, tangent: { x: 1, y: 0 }, fraction: 0, distance: distance(point, only) } : undefined);
}

export function pointAtRoadFraction(edge: RoadEdge, nodes: Map<string, RoadNode>, fraction: number): RoadFractionPoint | undefined {
  const sampled = sampledRoad(edge, nodes);
  const first = sampled.points[0];
  if (!first) return undefined;
  if (sampled.total === 0) return { point: { x: first.x, y: first.y }, tangent: { x: 1, y: 0 } };
  const clamped = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
  const target = sampled.total * clamped;
  let traversed = 0;
  for (let index = 1; index < sampled.points.length; index += 1) {
    const start = sampled.points[index - 1];
    const end = sampled.points[index];
    const length = sampled.lengths[index - 1] ?? 0;
    if (!start || !end || length === 0) continue;
    if (traversed + length >= target || index === sampled.points.length - 1) {
      const ratio = Math.max(0, Math.min(1, (target - traversed) / length));
      return {
        point: { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio },
        tangent: unitTangent(start, end),
      };
    }
    traversed += length;
  }
  return { point: { x: first.x, y: first.y }, tangent: { x: 1, y: 0 } };
}

export function busStopGeometry(city: City, stop: BusStop): BusStopGeometry {
  const fallback = (): BusStopGeometry => ({
    roadPoint: { x: stop.position.x, y: stop.position.y },
    stopPoint: { x: stop.position.x, y: stop.position.y },
    tangent: { x: 1, y: 0 },
  });
  const edge = city.roadEdges.find((candidate) => candidate.id === stop.roadEdgeId);
  const road = edge ? city.roads.find((candidate) => candidate.id === edge.roadId) : undefined;
  if (!edge || !road || !Number.isFinite(road.width) || road.width <= 0 || !Number.isFinite(stop.fraction)) return fallback();
  const nodes = new Map(city.roadNodes.map((node) => [node.id, node]));
  const location = pointAtRoadFraction(edge, nodes, stop.fraction);
  if (!location) return fallback();
  const direction = stop.side === "left" ? 1 : -1;
  const offset = road.width / 2 + 8;
  const normal = { x: -location.tangent.y * direction, y: location.tangent.x * direction };
  return {
    roadPoint: location.point,
    stopPoint: { x: location.point.x + normal.x * offset, y: location.point.y + normal.y * offset },
    tangent: location.tangent,
  };
}

export function busPathDistance(point: Point, city: City, line: BusLine): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const path of sampleDirectedBusPathSegments(city, line)) {
    for (let index = 1; index < path.length; index += 1) {
      const start = path[index - 1];
      const end = path[index];
      if (start && end) nearest = Math.min(nearest, pointToSegmentDistance(point, start, end));
    }
  }
  return nearest;
}
