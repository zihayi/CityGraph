import type { City, RailNode, RailPathStep, RailStation, RailSystem, RailTrack } from "../model/City";
import type { Point } from "./Point";
import { bezierPoint, sampleBezier } from "./Bezier";

const EPSILON = 1e-9;

type RailNetwork = Pick<City, "railNodes" | "railTracks" | "railStations">;

interface Traversal {
  trackId: string;
  to: string;
  forward: boolean;
  distance: number;
}

export interface RailTrackLocation {
  trackId: string;
  point: Point;
  fraction: number;
  distance: number;
}

function railSystem(value: { system?: RailSystem }): RailSystem { return value.system ?? "train"; }

export function railTrackLength(track: RailTrack, nodes: ReadonlyMap<string, RailNode>): number {
  const points = sampleRailTrack(track, nodes); if (points.length < 2) return Number.POSITIVE_INFINITY; return points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y), 0);
}

export function sampleRailTrack(track: RailTrack, nodes: ReadonlyMap<string, RailNode>, forward = true): Point[] {
  const start = nodes.get(track.startNodeId); const end = nodes.get(track.endNodeId); if (!start || !end) return []; const points = track.geometry?.type === "bezier" ? sampleBezier(start, end, track.geometry.controlPoints, 32) : [start, end]; return forward ? points : [...points].reverse();
}

export function railPathNodeIds(path: readonly RailPathStep[], tracks: ReadonlyMap<string, RailTrack>): string[] | undefined {
  if (path.length === 0) return [];
  const firstStep = path[0]!; const firstTrack = tracks.get(firstStep.trackId); if (!firstTrack) return undefined; const result = [firstStep.forward ? firstTrack.startNodeId : firstTrack.endNodeId];
  for (const step of path) { const track = tracks.get(step.trackId); if (!track) return undefined; const startNodeId = step.forward ? track.startNodeId : track.endNodeId; const endNodeId = step.forward ? track.endNodeId : track.startNodeId; if (result[result.length - 1] !== startNodeId) return undefined; result.push(endNodeId); }
  return result;
}

export function sampleRailPath(city: RailNetwork, path: readonly RailPathStep[]): Point[] {
  const nodes = new Map((city.railNodes ?? []).map((node) => [node.id, node])); const tracks = new Map((city.railTracks ?? []).map((track) => [track.id, track])); const points: Point[] = [];
  for (const step of path) { const track = tracks.get(step.trackId); if (!track) return []; const sampled = sampleRailTrack(track, nodes, step.forward); if (sampled.length < 2 || points.length && Math.hypot(points.at(-1)!.x - sampled[0]!.x, points.at(-1)!.y - sampled[0]!.y) > EPSILON) return []; points.push(...sampled.slice(points.length ? 1 : 0)); }
  return points;
}

export function railPathLength(city: RailNetwork, path: readonly RailPathStep[]): number {
  const nodes = new Map((city.railNodes ?? []).map((node) => [node.id, node])); const tracks = new Map((city.railTracks ?? []).map((track) => [track.id, track])); let total = 0; for (const step of path) { const track = tracks.get(step.trackId); if (!track) return Number.POSITIVE_INFINITY; total += railTrackLength(track, nodes); } return total;
}

export function railStationsFollowPath(city: RailNetwork, stationIds: readonly string[], path: readonly RailPathStep[], loop: boolean): boolean {
  const stations = new Map((city.railStations ?? []).map((station) => [station.id, station])); const tracks = new Map((city.railTracks ?? []).map((track) => [track.id, track])); const orderedStations = stationIds.map((id) => stations.get(id)); const system = orderedStations[0] ? railSystem(orderedStations[0]) : undefined; const orderedNodes = orderedStations.map((station) => station?.nodeId); const pathNodes = railPathNodeIds(path, tracks); if (!system || orderedStations.some((station) => !station || railSystem(station) !== system) || path.some((step) => railSystem(tracks.get(step.trackId) ?? {}) !== system) || orderedNodes.length < 2 || orderedNodes.some((id) => id === undefined) || !pathNodes?.length || pathNodes[0] !== orderedNodes[0]) return false;
  let stationIndex = 1; for (const nodeId of pathNodes.slice(1)) { const laterIndex = orderedNodes.indexOf(nodeId, stationIndex); if (laterIndex > stationIndex) return false; if (laterIndex === stationIndex) stationIndex += 1; }
  if (stationIndex !== orderedNodes.length) return false; return loop ? pathNodes[pathNodes.length - 1] === orderedNodes[0] : pathNodes[pathNodes.length - 1] === orderedNodes[orderedNodes.length - 1];
}

export function nearestRailTrackLocation(city: RailNetwork, point: Point, trackIds?: ReadonlySet<string>, system?: RailSystem): RailTrackLocation | undefined {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined; const nodes = new Map((city.railNodes ?? []).map((node) => [node.id, node])); let nearest: RailTrackLocation | undefined;
  for (const track of [...(city.railTracks ?? [])].sort((left, right) => left.id.localeCompare(right.id))) {
    if (trackIds && !trackIds.has(track.id) || system && railSystem(track) !== system) continue; const start = nodes.get(track.startNodeId); const end = nodes.get(track.endNodeId); if (!start || !end) continue;
    if (track.geometry?.type !== "bezier") { const dx = end.x - start.x; const dy = end.y - start.y; const squaredLength = dx * dx + dy * dy; const fraction = squaredLength > 0 ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / squaredLength)) : 0; const projected = { x: start.x + dx * fraction, y: start.y + dy * fraction }; const distance = Math.hypot(point.x - projected.x, point.y - projected.y); const candidate = { trackId: track.id, point: projected, fraction, distance }; if (!nearest || distance < nearest.distance - EPSILON || Math.abs(distance - nearest.distance) <= EPSILON && track.id < nearest.trackId) nearest = candidate; continue; }
    const segments = 64; const samples = sampleBezier(start, end, track.geometry.controlPoints, segments); let candidate: RailTrackLocation | undefined;
    for (let index = 1; index < samples.length; index += 1) { const segmentStart = samples[index - 1]!; const segmentEnd = samples[index]!; const dx = segmentEnd.x - segmentStart.x; const dy = segmentEnd.y - segmentStart.y; const squaredLength = dx * dx + dy * dy; const local = squaredLength > 0 ? Math.max(0, Math.min(1, ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / squaredLength)) : 0; const fraction = (index - 1 + local) / segments; const projected = bezierPoint(start, end, track.geometry.controlPoints, fraction); const distance = Math.hypot(point.x - projected.x, point.y - projected.y); if (!candidate || distance < candidate.distance) candidate = { trackId: track.id, point: projected, fraction, distance }; }
    if (candidate && (!nearest || candidate.distance < nearest.distance - EPSILON || Math.abs(candidate.distance - nearest.distance) <= EPSILON && track.id < nearest.trackId)) nearest = candidate;
  }
  return nearest;
}

export function shortestRailPath(city: RailNetwork, startNodeId: string, endNodeId: string, system?: RailSystem): RailPathStep[] | undefined {
  const nodes = new Map((city.railNodes ?? []).map((node) => [node.id, node])); const resolvedSystem = system ?? railSystem(nodes.get(startNodeId) ?? {}); if (!nodes.has(startNodeId) || !nodes.has(endNodeId) || railSystem(nodes.get(startNodeId)!) !== resolvedSystem || railSystem(nodes.get(endNodeId)!) !== resolvedSystem) return undefined; if (startNodeId === endNodeId) return [];
  const graph = new Map<string, Traversal[]>();
  for (const track of [...(city.railTracks ?? [])].filter((candidate) => railSystem(candidate) === resolvedSystem).sort((left, right) => left.id.localeCompare(right.id))) { const distance = railTrackLength(track, nodes); if (!Number.isFinite(distance)) continue; const forward = graph.get(track.startNodeId) ?? []; forward.push({ trackId: track.id, to: track.endNodeId, forward: true, distance }); graph.set(track.startNodeId, forward); const reverse = graph.get(track.endNodeId) ?? []; reverse.push({ trackId: track.id, to: track.startNodeId, forward: false, distance }); graph.set(track.endNodeId, reverse); }
  for (const traversals of graph.values()) traversals.sort((left, right) => left.trackId.localeCompare(right.trackId) || Number(right.forward) - Number(left.forward) || left.to.localeCompare(right.to));
  const best = new Map<string, { distance: number; key: string; path: RailPathStep[] }>(); const queue: Array<{ nodeId: string; distance: number; key: string }> = [{ nodeId: startNodeId, distance: 0, key: "" }]; best.set(startNodeId, { distance: 0, key: "", path: [] });
  while (queue.length) {
    queue.sort((left, right) => left.distance - right.distance || left.key.localeCompare(right.key) || left.nodeId.localeCompare(right.nodeId)); const current = queue.shift()!; const state = best.get(current.nodeId); if (!state || Math.abs(state.distance - current.distance) > EPSILON || state.key !== current.key) continue; if (current.nodeId === endNodeId) return state.path;
    for (const traversal of graph.get(current.nodeId) ?? []) { const distance = state.distance + traversal.distance; const token = `${traversal.trackId}:${traversal.forward ? "0" : "1"}`; const key = state.key ? `${state.key}\u0000${token}` : token; const previous = best.get(traversal.to); if (previous && (distance > previous.distance + EPSILON || Math.abs(distance - previous.distance) <= EPSILON && key >= previous.key)) continue; const path = [...state.path, { trackId: traversal.trackId, forward: traversal.forward }]; best.set(traversal.to, { distance, key, path }); queue.push({ nodeId: traversal.to, distance, key }); }
  }
  return undefined;
}

export function routeRailStations(city: RailNetwork, stationIds: readonly string[], loop = false, system?: RailSystem): RailPathStep[] | undefined {
  const stations = new Map((city.railStations ?? []).map((station) => [station.id, station])); const ordered = stationIds.map((id) => stations.get(id)).filter((station): station is RailStation => Boolean(station)); if (ordered.length !== stationIds.length) return undefined; const resolvedSystem = system ?? railSystem(ordered[0] ?? {}); if (ordered.some((station) => railSystem(station) !== resolvedSystem)) return undefined; const path: RailPathStep[] = []; const sectionCount = Math.max(0, ordered.length - 1) + (loop && ordered.length > 1 ? 1 : 0);
  for (let index = 0; index < sectionCount; index += 1) { const from = ordered[index % ordered.length]!; const to = ordered[(index + 1) % ordered.length]!; const section = shortestRailPath(city, from.nodeId, to.nodeId, resolvedSystem); if (!section) return undefined; path.push(...section); }
  return path;
}
