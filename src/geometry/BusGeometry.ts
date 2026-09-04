import type { BusLine, BusPathStep, BusStop, City, RoadEdge, RoadNode } from "../model/City";
import type { Point } from "./Point";
import { distance, pointToSegmentDistance, sampleRoad } from "./RoadGeometry";

const ROAD_SAMPLES = 128;
const JOIN_EPSILON = 1e-6;
const ROUTE_EPSILON = 1e-9;

type BusStopRoadLocation = Pick<BusStop, "roadEdgeId" | "fraction">;

interface RoadTraversal {
  edge: RoadEdge;
  to: string;
  forward: boolean;
  length: number;
}

interface PreviousTraversal {
  nodeId: string;
  edge: RoadEdge;
  forward: boolean;
}

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

function clampFraction(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function busStepFractions(step: BusPathStep): { start: number; end: number } {
  const defaultStart = step.forward ? 0 : 1;
  const defaultEnd = step.forward ? 1 : 0;
  return {
    start: step.startFraction !== undefined && Number.isFinite(step.startFraction) ? clampFraction(step.startFraction) : defaultStart,
    end: step.endFraction !== undefined && Number.isFinite(step.endFraction) ? clampFraction(step.endFraction) : defaultEnd,
  };
}

function sampledPointAtDistance(sampled: ReturnType<typeof sampledRoad>, target: number): Point | undefined {
  const first = sampled.points[0];
  const last = sampled.points.at(-1);
  if (!first || !last) return undefined;
  if (target <= 0) return first;
  if (target >= sampled.total) return last;
  let traversed = 0;
  for (let index = 1; index < sampled.points.length; index += 1) {
    const start = sampled.points[index - 1];
    const end = sampled.points[index];
    const length = sampled.lengths[index - 1] ?? 0;
    if (!start || !end || length === 0) continue;
    if (traversed + length >= target) {
      const ratio = (target - traversed) / length;
      if (ratio <= ROUTE_EPSILON) return start;
      if (ratio >= 1 - ROUTE_EPSILON) return end;
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
    }
    traversed += length;
  }
  return last;
}

function sampleRoadBetweenFractions(edge: RoadEdge, nodes: Map<string, RoadNode>, startFraction: number, endFraction: number): Point[] {
  const sampled = sampledRoad(edge, nodes);
  if (sampled.total <= 0 || sampled.total * Math.abs(startFraction - endFraction) <= ROUTE_EPSILON) return [];
  const startDistance = sampled.total * startFraction;
  const endDistance = sampled.total * endFraction;
  const low = Math.min(startDistance, endDistance);
  const high = Math.max(startDistance, endDistance);
  const first = sampledPointAtDistance(sampled, low);
  const last = sampledPointAtDistance(sampled, high);
  if (!first || !last) return [];
  const path = [first];
  let traversed = 0;
  for (let index = 1; index < sampled.points.length; index += 1) {
    traversed += sampled.lengths[index - 1] ?? 0;
    const point = sampled.points[index];
    if (point && traversed > low + ROUTE_EPSILON && traversed < high - ROUTE_EPSILON) path.push(point);
  }
  if (distance(path[path.length - 1]!, last) > ROUTE_EPSILON) path.push(last);
  return startFraction < endFraction ? path : path.reverse();
}

function directedStep(roadEdgeId: string, startFraction: number, endFraction: number, edgeLength: number): BusPathStep | undefined {
  if (edgeLength * Math.abs(endFraction - startFraction) <= ROUTE_EPSILON) return undefined;
  return { roadEdgeId, forward: endFraction > startFraction, startFraction, endFraction };
}

export function sampleDirectedBusPathSegments(city: City, line: BusLine): Point[][] {
  const edges = new Map(city.roadEdges.map((edge) => [edge.id, edge]));
  const nodes = new Map(city.roadNodes.map((node) => [node.id, node]));
  const result: Point[][] = [];
  for (const step of line.path) {
    const edge = edges.get(step.roadEdgeId);
    if (!edge) continue;
    const { start, end } = busStepFractions(step);
    const path = sampleRoadBetweenFractions(edge, nodes, start, end);
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

export function routeBetweenBusStops(city: City, from: BusStopRoadLocation, to: BusStopRoadLocation): BusPathStep[] | undefined {
  if (!Number.isFinite(from.fraction) || !Number.isFinite(to.fraction)) return undefined;
  const fromFraction = clampFraction(from.fraction);
  const toFraction = clampFraction(to.fraction);
  const edges = new Map(city.roadEdges.map((edge) => [edge.id, edge]));
  const nodes = new Map(city.roadNodes.map((node) => [node.id, node]));
  const fromEdge = edges.get(from.roadEdgeId);
  const toEdge = edges.get(to.roadEdgeId);
  if (!fromEdge || !toEdge) return undefined;

  const edgeLengths = new Map<string, number>();
  const graph = new Map<string, RoadTraversal[]>();
  for (const edge of city.roadEdges) {
    if (!nodes.has(edge.startNodeId) || !nodes.has(edge.endNodeId)) continue;
    const road = sampledRoad(edge, nodes);
    if (road.points.length < 2 || !Number.isFinite(road.total)) continue;
    edgeLengths.set(edge.id, road.total);
    const forward = graph.get(edge.startNodeId) ?? [];
    forward.push({ edge, to: edge.endNodeId, forward: true, length: road.total });
    graph.set(edge.startNodeId, forward);
    const reverse = graph.get(edge.endNodeId) ?? [];
    reverse.push({ edge, to: edge.startNodeId, forward: false, length: road.total });
    graph.set(edge.endNodeId, reverse);
  }

  const fromLength = edgeLengths.get(fromEdge.id);
  const toLength = edgeLengths.get(toEdge.id);
  if (fromLength === undefined || toLength === undefined) return undefined;

  let best: { cost: number; path: BusPathStep[] } | undefined;
  if (fromEdge.id === toEdge.id) {
    const step = directedStep(fromEdge.id, fromFraction, toFraction, fromLength);
    best = { cost: fromLength * Math.abs(toFraction - fromFraction), path: step ? [step] : [] };
  }

  const distances = new Map<string, number>();
  const previous = new Map<string, PreviousTraversal>();
  const sourceSteps = new Map<string, BusPathStep | undefined>();
  const queue: { nodeId: string; distance: number }[] = [];
  const push = (nodeId: string, candidateDistance: number, sourceStep: BusPathStep | undefined): void => {
    if (candidateDistance >= (distances.get(nodeId) ?? Number.POSITIVE_INFINITY)) return;
    distances.set(nodeId, candidateDistance);
    sourceSteps.set(nodeId, sourceStep);
    queue.push({ nodeId, distance: candidateDistance });
  };
  push(fromEdge.startNodeId, fromLength * fromFraction, directedStep(fromEdge.id, fromFraction, 0, fromLength));
  push(fromEdge.endNodeId, fromLength * (1 - fromFraction), directedStep(fromEdge.id, fromFraction, 1, fromLength));

  while (queue.length > 0) {
    let nearestIndex = 0;
    for (let index = 1; index < queue.length; index += 1) {
      if (queue[index]!.distance < queue[nearestIndex]!.distance) nearestIndex = index;
    }
    const current = queue.splice(nearestIndex, 1)[0]!;
    if (current.distance !== distances.get(current.nodeId)) continue;
    for (const traversal of graph.get(current.nodeId) ?? []) {
      const candidateDistance = current.distance + traversal.length;
      if (candidateDistance >= (distances.get(traversal.to) ?? Number.POSITIVE_INFINITY)) continue;
      distances.set(traversal.to, candidateDistance);
      previous.set(traversal.to, { nodeId: current.nodeId, edge: traversal.edge, forward: traversal.forward });
      sourceSteps.delete(traversal.to);
      queue.push({ nodeId: traversal.to, distance: candidateDistance });
    }
  }

  const targets = [
    { nodeId: toEdge.startNodeId, cost: toLength * toFraction, step: directedStep(toEdge.id, 0, toFraction, toLength) },
    { nodeId: toEdge.endNodeId, cost: toLength * (1 - toFraction), step: directedStep(toEdge.id, 1, toFraction, toLength) },
  ];
  for (const target of targets) {
    const graphDistance = distances.get(target.nodeId);
    if (graphDistance === undefined) continue;
    const cost = graphDistance + target.cost;
    if (best && cost >= best.cost - ROUTE_EPSILON) continue;
    const middle: BusPathStep[] = [];
    let currentNodeId = target.nodeId;
    while (true) {
      const traversal = previous.get(currentNodeId);
      if (!traversal) break;
      const length = edgeLengths.get(traversal.edge.id) ?? 0;
      const step = directedStep(traversal.edge.id, traversal.forward ? 0 : 1, traversal.forward ? 1 : 0, length);
      if (step) middle.push(step);
      currentNodeId = traversal.nodeId;
    }
    middle.reverse();
    const path: BusPathStep[] = [];
    const sourceStep = sourceSteps.get(currentNodeId);
    if (sourceStep) path.push(sourceStep);
    path.push(...middle);
    if (target.step) path.push(target.step);
    best = { cost, path };
  }
  return best?.path;
}

export function routeBusStopLoop(city: City, stops: readonly BusStopRoadLocation[]): BusPathStep[] | undefined {
  if (stops.length === 0) return [];
  const path: BusPathStep[] = [];
  for (let index = 0; index < stops.length; index += 1) {
    const from = stops[index]!;
    const to = stops[(index + 1) % stops.length]!;
    const section = routeBetweenBusStops(city, from, to);
    if (!section) return undefined;
    path.push(...section);
  }
  return path;
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
