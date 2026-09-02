import { distance, nearestPointOnRoad, sampleLogicalRoad, sampleRoad, segmentIntersection } from "../geometry/RoadGeometry";
import type { Point } from "../geometry/Point";
import type { City, Road, RoadCategory, RoadEdge, RoadGeometry, RoadNode, RoadStructure, RoadSubtype } from "../model/City";
import type { RoadSnapshot } from "../commands/RoadCommands";
import { roadNameAtNode } from "./RoadIdentity";

export interface RoadCreationInput {
  start: Point;
  end: Point;
  startNodeId?: string;
  endNodeId?: string;
  roadId?: string;
  category: RoadCategory;
  subtype: RoadSubtype;
  width: number;
  name: string;
  structure: RoadStructure;
  geometry: RoadGeometry;
}

export interface RoadGraphSnapshot extends RoadSnapshot {
  startNodeId: string;
  endNodeId: string;
  roadId: string;
}

export interface SplitRoadResult extends RoadSnapshot { nodeId: string; changed: boolean }

function id(prefix: string): string { return `${prefix}-${crypto.randomUUID()}`; }
function cloneGeometry(geometry: RoadGeometry): RoadGeometry {
  if (geometry.type === "line") return { type: "line" };
  if (geometry.type === "polyline") return { type: "polyline", points: geometry.points.map((point) => ({ ...point })) };
  return { type: "bezier", controlPoints: geometry.controlPoints.map((point) => ({ ...point })) };
}
function cloneSnapshot(city: City): RoadSnapshot {
  return { roadNodes: structuredClone(city.roadNodes), roads: structuredClone(city.roads), roadEdges: structuredClone(city.roadEdges) };
}
function replaceSegment(roads: Road[], roadId: string, segmentId: string, replacements: string[]): void {
  const road = roads.find((candidate) => candidate.id === roadId);
  if (!road) return;
  const index = road.segmentIds.indexOf(segmentId);
  if (index >= 0) road.segmentIds.splice(index, 1, ...replacements);
}
function pathGeometry(points: Point[]): RoadGeometry {
  return points.length <= 2 ? { type: "line" } : { type: "polyline", points: points.slice(1, -1).map((point) => ({ x: point.x, y: point.y })) };
}
function sampledSubpath(path: Point[], startT: number, endT: number): Point[] {
  if (path.length < 2) return path;
  const max = path.length - 1; const startPosition = startT * max; const endPosition = endT * max;
  const interpolate = (position: number): Point => { const index = Math.min(max - 1, Math.floor(position)); const ratio = position - index; const a = path[index]!; const b = path[index + 1]!; return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio }; };
  const result = [interpolate(startPosition)];
  for (let index = Math.floor(startPosition) + 1; index <= Math.floor(endPosition); index += 1) if (index < endPosition && path[index]) result.push({ ...path[index]! });
  result.push(interpolate(endPosition)); return result;
}

export function logicalRoadTerminalNodeIds(city: Pick<City, "roads" | "roadEdges">, roadId: string): string[] {
  const road = city.roads.find((candidate) => candidate.id === roadId);
  if (!road) return [];
  const degree = new Map<string, number>();
  for (const edge of city.roadEdges.filter((candidate) => candidate.roadId === roadId && road.segmentIds.includes(candidate.id))) {
    degree.set(edge.startNodeId, (degree.get(edge.startNodeId) ?? 0) + 1);
    degree.set(edge.endNodeId, (degree.get(edge.endNodeId) ?? 0) + 1);
  }
  return [...degree].filter(([, count]) => count === 1).map(([nodeId]) => nodeId);
}

export function continuationRoad(city: City, nodeId: string | undefined, nextPoint: Point, preferredRoadId?: string): Road | undefined {
  if (!nodeId) return undefined;
  const node = city.roadNodes.find((candidate) => candidate.id === nodeId);
  if (!node) return undefined;
  const candidates = city.roads.filter((road) => logicalRoadTerminalNodeIds(city, road.id).includes(nodeId));
  const preferred = candidates.find((road) => road.id === preferredRoadId);
  if (preferred) return preferred;
  if (candidates.length <= 1) return candidates[0];
  const outgoing = { x: nextPoint.x - node.x, y: nextPoint.y - node.y }; const outgoingLength = Math.hypot(outgoing.x, outgoing.y);
  if (outgoingLength < 1e-6) return candidates[0];
  const edgeLookup = new Map(city.roadEdges.map((edge) => [edge.id, edge]));
  const nodes = new Map(city.roadNodes.map((candidate) => [candidate.id, candidate]));
  let best = candidates[0]; let bestScore = -1;
  for (const road of candidates) {
    const path = sampleLogicalRoad(road, edgeLookup, nodes);
    const nearStart = path[0] && distance(path[0], node) < 1e-5;
    const directionPoint = nearStart ? path[1] : path.at(-2);
    if (!directionPoint) continue;
    const inward = { x: directionPoint.x - node.x, y: directionPoint.y - node.y }; const inwardLength = Math.hypot(inward.x, inward.y);
    if (inwardLength < 1e-6) continue;
    const score = Math.abs((outgoing.x * inward.x + outgoing.y * inward.y) / (outgoingLength * inwardLength));
    if (score > bestScore) { best = road; bestScore = score; }
  }
  return best;
}

export function inheritedRoadName(city: City, nodeId: string | undefined, nextPoint: Point, preferredRoadId?: string): string {
  const road = continuationRoad(city, nodeId, nextPoint, preferredRoadId); return road ? roadNameAtNode(city, road.id, nodeId) : "";
}

function splitEdgeInSnapshot(snapshot: RoadSnapshot, edgeId: string, point: Point, existingNodeId?: string): string {
  const edgeIndex = snapshot.roadEdges.findIndex((candidate) => candidate.id === edgeId);
  const edge = snapshot.roadEdges[edgeIndex];
  if (!edge) throw new Error("Road edge not found");
  const nodes = new Map(snapshot.roadNodes.map((node) => [node.id, node]));
  const start = nodes.get(edge.startNodeId); const end = nodes.get(edge.endNodeId);
  if (!start || !end) throw new Error("Road edge endpoints not found");
  if (distance(start, point) < 1e-4) return start.id;
  if (distance(end, point) < 1e-4) return end.id;
  const fullPath = sampleRoad(edge, nodes, 48);
  let splitIndex = 1; let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < fullPath.length; index += 1) {
    const a = fullPath[index - 1]; const b = fullPath[index];
    if (!a || !b) continue;
    const dx = b.x - a.x; const dy = b.y - a.y; const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
    const projected = { x: a.x + dx * ratio, y: a.y + dy * ratio }; const candidate = distance(point, projected);
    if (candidate < nearest) { nearest = candidate; splitIndex = index; }
  }
  const node = existingNodeId ? snapshot.roadNodes.find((candidate) => candidate.id === existingNodeId) : undefined;
  const splitNode: RoadNode = node ?? { id: id("node"), x: point.x, y: point.y };
  if (!node) snapshot.roadNodes.push(splitNode);
  const beforePath = [...fullPath.slice(0, splitIndex), point];
  const afterPath = [point, ...fullPath.slice(splitIndex)];
  const first: RoadEdge = { ...edge, id: id("edge"), endNodeId: splitNode.id, geometry: pathGeometry(beforePath) };
  const second: RoadEdge = { ...edge, id: id("edge"), startNodeId: splitNode.id, geometry: pathGeometry(afterPath) };
  snapshot.roadEdges.splice(edgeIndex, 1, first, second);
  replaceSegment(snapshot.roads, edge.roadId, edge.id, [first.id, second.id]);
  return splitNode.id;
}

export function splitRoadEdge(city: City, edgeId: string, point: Point): SplitRoadResult {
  const snapshot = cloneSnapshot(city);
  const edge = snapshot.roadEdges.find((candidate) => candidate.id === edgeId);
  if (!edge) throw new Error("Road edge not found");
  const nodes = new Map(snapshot.roadNodes.map((node) => [node.id, node]));
  const nearest = nearestPointOnRoad(point, edge, nodes);
  if (!nearest) throw new Error("Road edge geometry not found");
  const start = nodes.get(edge.startNodeId); const end = nodes.get(edge.endNodeId);
  if (start && distance(start, nearest.point) < 1e-4) return { ...snapshot, nodeId: start.id, changed: false };
  if (end && distance(end, nearest.point) < 1e-4) return { ...snapshot, nodeId: end.id, changed: false };
  return { ...snapshot, nodeId: splitEdgeInSnapshot(snapshot, edgeId, nearest.point), changed: true };
}

export function buildRoadCreation(city: City, input: RoadCreationInput): RoadGraphSnapshot {
  const snapshot = cloneSnapshot(city);
  const lookup = new Map(snapshot.roadNodes.map((node) => [node.id, node]));
  const ensureNode = (point: Point, existingId?: string): RoadNode => {
    const existing = existingId ? lookup.get(existingId) : undefined;
    if (existing) return existing;
    const colocated = snapshot.roadNodes.find((node) => distance(node, point) < 1e-4 && (!snapshot.roadEdges.some((edge) => edge.startNodeId === node.id || edge.endNodeId === node.id) || snapshot.roadEdges.some((edge) => (edge.startNodeId === node.id || edge.endNodeId === node.id) && edge.structure === input.structure)));
    if (colocated) return colocated;
    for (const edge of snapshot.roadEdges) {
      if (edge.structure !== input.structure) continue;
      const nearest = nearestPointOnRoad(point, edge, lookup);
      if (!nearest || nearest.distance >= 1e-4) continue;
      const nodeId = splitEdgeInSnapshot(snapshot, edge.id, nearest.point); const node = snapshot.roadNodes.find((candidate) => candidate.id === nodeId);
      if (node) { lookup.set(node.id, node); return node; }
    }
    const node = { id: id("node"), x: point.x, y: point.y }; snapshot.roadNodes.push(node); lookup.set(node.id, node); return node;
  };
  const start = ensureNode(input.start, input.startNodeId); const end = ensureNode(input.end, input.endNodeId);
  let road = snapshot.roads.find((candidate) => candidate.id === input.roadId);
  const existingPath = road ? sampleLogicalRoad(road, new Map(snapshot.roadEdges.map((edge) => [edge.id, edge])), lookup) : [];
  if (!road) {
    road = { id: id("road"), name: input.name, category: input.category, subtype: input.subtype, width: input.width, segmentIds: [] };
    snapshot.roads.push(road);
  }

  const previewEdge: RoadEdge = { id: "preview", roadId: road.id, name: input.name, startNodeId: start.id, endNodeId: end.id, structure: input.structure, level: 0, geometry: input.geometry };
  const inputPath = sampleRoad(previewEdge, lookup, 48);
  const pathNodes: Array<{ node: RoadNode; t: number }> = [{ node: start, t: 0 }, { node: end, t: 1 }];
  if (input.structure === "ground") {
    for (const edge of [...snapshot.roadEdges]) {
      if (edge.structure !== "ground") continue;
      const edgeStart = lookup.get(edge.startNodeId); const edgeEnd = lookup.get(edge.endNodeId);
      if (!edgeStart || !edgeEnd) continue;
      const edgePath = sampleRoad(edge, lookup, 48); const crossings: Array<{ point: Point; t: number }> = [];
      for (let inputIndex = 1; inputIndex < inputPath.length; inputIndex += 1) {
        for (let edgeIndex = 1; edgeIndex < edgePath.length; edgeIndex += 1) {
          const crossing = segmentIntersection(inputPath[inputIndex - 1]!, inputPath[inputIndex]!, edgePath[edgeIndex - 1]!, edgePath[edgeIndex]!);
          if (!crossing) continue;
          const t = (inputIndex - 1 + crossing.t) / (inputPath.length - 1);
          if (t < 1e-5 || t > 1 - 1e-5 || crossings.some((entry) => distance(entry.point, crossing.point) < 1e-4)) continue;
          crossings.push({ point: crossing.point, t });
        }
      }
      for (const crossing of crossings) {
        let crossingNode = snapshot.roadNodes.find((node) => distance(node, crossing.point) < 1e-4);
        if (!crossingNode) {
          const candidates = snapshot.roadEdges.filter((candidate) => candidate.roadId === edge.roadId && candidate.structure === "ground").map((candidate) => ({ edge: candidate, nearest: nearestPointOnRoad(crossing.point, candidate, lookup) })).filter((candidate) => candidate.nearest && candidate.nearest.distance < 0.1).sort((a, b) => a.nearest!.distance - b.nearest!.distance);
          const candidate = candidates[0]; if (!candidate) continue;
          const nodeId = splitEdgeInSnapshot(snapshot, candidate.edge.id, crossing.point); crossingNode = snapshot.roadNodes.find((node) => node.id === nodeId);
          if (crossingNode) lookup.set(crossingNode.id, crossingNode);
        } else {
          const candidate = snapshot.roadEdges.find((current) => current.roadId === edge.roadId && current.startNodeId !== crossingNode!.id && current.endNodeId !== crossingNode!.id && (nearestPointOnRoad(crossing.point, current, lookup)?.distance ?? Infinity) < 0.1);
          if (candidate) splitEdgeInSnapshot(snapshot, candidate.id, crossing.point, crossingNode.id);
        }
        if (crossingNode && !pathNodes.some((entry) => entry.node.id === crossingNode!.id)) pathNodes.push({ node: crossingNode, t: crossing.t });
      }
    }
  }
  pathNodes.sort((a, b) => a.t - b.t);
  const segmentIds: string[] = [];
  for (let index = 1; index < pathNodes.length; index += 1) {
    const from = pathNodes[index - 1]?.node; const to = pathNodes[index]?.node;
    if (!from || !to || distance(from, to) < 0.01) continue;
    const edge: RoadEdge = {
      id: id("edge"), roadId: road.id, startNodeId: from.id, endNodeId: to.id,
      name: input.name,
      structure: input.structure, level: input.structure === "elevated" ? 1 : input.structure === "tunnel" ? -1 : 0,
      geometry: pathNodes.length === 2 ? cloneGeometry(input.geometry) : pathGeometry(sampledSubpath(inputPath, pathNodes[index - 1]!.t, pathNodes[index]!.t)),
    };
    snapshot.roadEdges.push(edge); segmentIds.push(edge.id);
  }
  const extendsAtStart = existingPath[0] && distance(existingPath[0], start) < 1e-4;
  if (input.roadId && extendsAtStart) road.segmentIds.unshift(...segmentIds.reverse()); else road.segmentIds.push(...segmentIds);
  return { ...snapshot, startNodeId: start.id, endNodeId: end.id, roadId: road.id };
}
