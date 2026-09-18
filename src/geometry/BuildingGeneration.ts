import type { BuildingFootprint } from "../model/City";
import { createBuildingRectangleFromCorners, isValidBuildingFootprint } from "./BuildingGeometry";
import type { Point } from "./Point";
import { polygonContainsPolygon, polygonsIntersectOrContain, simplifyClosedPolygon } from "./Polygon";
import { distancePointToSegment } from "./Segment";

export interface RoadAreaBuildingGenerationOptions {
  polygon: readonly Point[];
  boundaryRoadWidth: number;
  boundaryRoadWidths?: readonly number[];
  minSpacing: number;
  maxSpacing: number;
  minSideLength: number;
  maxSideLength: number;
  density: number;
  occupied?: readonly BuildingFootprint[];
  seed?: number;
}

export interface RoadAreaSingleBuildingOptions {
  polygon: readonly Point[];
  boundaryRoadWidth: number;
  boundaryRoadWidths?: readonly number[];
  setback: number;
}

interface BoundarySegment { start: Point; end: Point; length: number; width: number }

const ROAD_SETBACK = 1;
const MAX_SINGLE_BUILDING_VERTICES = 512;

function randomGenerator(seed: number): () => number { let state = seed >>> 0 || 1; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }; }
function polygonSeed(points: readonly Point[]): number { return points.reduce((value, point) => (Math.imul(value ^ Math.round(point.x * 10), 16777619) ^ Math.round(point.y * 10)) >>> 0, 2166136261); }
function signedArea(points: readonly Point[]): number { return points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]!; return sum + point.x * next.y - next.x * point.y; }, 0) / 2; }
function segmentDistance(a: Point, b: Point, c: Point, d: Point): number { return Math.min(distancePointToSegment(a, c, d), distancePointToSegment(b, c, d), distancePointToSegment(c, a, b), distancePointToSegment(d, a, b)); }
function clearsBoundary(footprint: BuildingFootprint, segments: readonly BoundarySegment[]): boolean {
  return footprint.outer.every((start, index) => { const end = footprint.outer[(index + 1) % footprint.outer.length]!; return segments.every((segment) => segmentDistance(start, end, segment.start, segment.end) >= segment.width / 2 + ROAD_SETBACK - 1e-5); });
}

function lineIntersection(a: Point, directionA: Point, b: Point, directionB: Point): Point | undefined {
  const cross = directionA.x * directionB.y - directionA.y * directionB.x; if (Math.abs(cross) < 1e-8) return undefined; const delta = { x: b.x - a.x, y: b.y - a.y }; const amount = (delta.x * directionB.y - delta.y * directionB.x) / cross; return { x: a.x + directionA.x * amount, y: a.y + directionA.y * amount };
}

export function generateRoadAreaSingleBuildingFootprint(options: RoadAreaSingleBuildingOptions): BuildingFootprint | undefined {
  const polygon = options.polygon; const setback = Math.max(0, options.setback); if (polygon.length < 3 || ![options.boundaryRoadWidth, setback].every(Number.isFinite)) return undefined;
  const widths = options.boundaryRoadWidths?.length === polygon.length ? options.boundaryRoadWidths : polygon.map(() => options.boundaryRoadWidth); const orientation = signedArea(polygon) >= 0 ? 1 : -1;
  const segments = polygon.map((start, index) => { const end = polygon[(index + 1) % polygon.length]!; const length = Math.hypot(end.x - start.x, end.y - start.y); if (length < 1e-5) return undefined; const direction = { x: (end.x - start.x) / length, y: (end.y - start.y) / length }; const clearance = Math.max(0, widths[index] ?? options.boundaryRoadWidth) / 2 + setback; const normal = { x: -direction.y * orientation, y: direction.x * orientation }; return { direction, normal, clearance, start: { x: start.x + normal.x * clearance, y: start.y + normal.y * clearance } }; });
  if (segments.some((segment) => !segment)) return undefined; const offsetSegments = segments as Array<NonNullable<(typeof segments)[number]>>; const outer: Point[] = [];
  for (let index = 0; index < offsetSegments.length; index += 1) { const previous = offsetSegments[(index - 1 + offsetSegments.length) % offsetSegments.length]!; const current = offsetSegments[index]!; const intersection = lineIntersection(previous.start, previous.direction, current.start, current.direction); const source = polygon[index]!; if (!intersection) { const clearance = Math.max(previous.clearance, current.clearance); outer.push({ x: source.x + current.normal.x * clearance, y: source.y + current.normal.y * clearance }); continue; } const miterLimit = Math.max(previous.clearance, current.clearance, 1) * 12; if (Math.hypot(intersection.x - source.x, intersection.y - source.y) > miterLimit) return undefined; outer.push(intersection); }
  let simplified = simplifyClosedPolygon(outer, 0.05); for (let tolerance = 0.1; simplified.length > MAX_SINGLE_BUILDING_VERTICES && tolerance <= 1.6; tolerance *= 2) simplified = simplifyClosedPolygon(outer, tolerance); if (simplified.length > MAX_SINGLE_BUILDING_VERTICES) return undefined;
  const footprint = { outer: simplified, holes: [] }; return isFiniteFootprint(footprint) && isValidBuildingFootprint(footprint) && polygonContainsPolygon(polygon, footprint.outer) ? footprint : undefined;
}

function isFiniteFootprint(footprint: BuildingFootprint): boolean { return footprint.outer.length >= 3 && footprint.outer.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)); }

export function generateRoadAreaBuildingFootprints(options: RoadAreaBuildingGenerationOptions): BuildingFootprint[] {
  const polygon = options.polygon; const minSpacing = Math.max(0, options.minSpacing); const maxSpacing = Math.max(minSpacing, options.maxSpacing);
  if (polygon.length < 3 || !polygon.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) || ![options.boundaryRoadWidth, minSpacing, maxSpacing, options.minSideLength, options.maxSideLength, options.density].every(Number.isFinite)) return [];
  const minimumSide = Math.max(4, options.minSideLength); const maximumSide = Math.max(minimumSide, options.maxSideLength); const density = Math.max(0, Math.min(1, options.density));
  if (density === 0) return [];
  const widths = options.boundaryRoadWidths?.length === polygon.length ? options.boundaryRoadWidths : polygon.map(() => options.boundaryRoadWidth); const segments = polygon.map((start, index): BoundarySegment => { const end = polygon[(index + 1) % polygon.length]!; return { start, end, length: Math.hypot(end.x - start.x, end.y - start.y), width: Math.max(0, widths[index] ?? options.boundaryRoadWidth) }; }).filter((segment) => segment.length > 1e-5);
  if (segments.length < 3 || segments.some((segment) => !Number.isFinite(segment.width))) return [];
  type Parcel = { minX: number; minY: number; maxX: number; maxY: number };
  const bounds = (points: readonly Point[]): Parcel => points.reduce((box, point) => ({ minX: Math.min(box.minX, point.x), minY: Math.min(box.minY, point.y), maxX: Math.max(box.maxX, point.x), maxY: Math.max(box.maxY, point.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const intersects = (a: Parcel, b: Parcel, gap = 0) => a.minX - gap <= b.maxX && a.maxX + gap >= b.minX && a.minY - gap <= b.maxY && a.maxY + gap >= b.minY;
  const block = bounds(polygon); const clearance = Math.min(...segments.map((segment) => segment.width / 2 + ROAD_SETBACK));
  const occupied = (options.occupied ?? []).map((footprint) => ({ footprint, bounds: bounds(footprint.outer) })).filter((building) => intersects(block, building.bounds, minSpacing));
  const seed = options.seed ?? polygonSeed(polygon); const random = randomGenerator(seed); const accepted: BuildingFootprint[] = [];
  const parcels: Parcel[] = [{ minX: block.minX + clearance, minY: block.minY + clearance, maxX: block.maxX - clearance, maxY: block.maxY - clearance }];

  // Unequal rectangular parcels fill the interior without a uniform grid. Gaps at
  // every split keep all descendants separated, avoiding pairwise packing checks.
  for (let index = 0; index < parcels.length && index < 20000 && accepted.length < 2000; index += 1) {
    const parcel = parcels[index]!; const w = parcel.maxX - parcel.minX; const d = parcel.maxY - parcel.minY;
    if (w < minimumSide || d < minimumSide) continue;
    const targetArea = (minimumSide + random() * (maximumSide - minimumSide)) * (minimumSide + random() * (maximumSide - minimumSide));
    const gap = Math.max(0.01, minSpacing + random() * (maxSpacing - minSpacing));
    const canSplitX = w >= minimumSide * 2 + gap; const canSplitY = d >= minimumSide * 2 + gap;
    if (w * d <= targetArea && Math.max(w, d) <= maximumSide && Math.max(w / d, d / w) <= 6 || !canSplitX && !canSplitY) {
      const nearby = occupied.filter((building) => intersects(parcel, building.bounds, minSpacing));
      // Keep houses rectangular beside slanted roads and existing buildings;
      // shrink a little first, then subdivide rejected parcels into smaller lots.
      const padding = random() * (maxSpacing - minSpacing) * 0.2; let placed = false;
      for (const scale of [1, 0.85, 0.7]) {
        const buildingWidth = Math.max(minimumSide, Math.min(maximumSide, (w - padding * 2) * scale)); const buildingDepth = Math.max(minimumSide, Math.min(maximumSide, (d - padding * 2) * scale));
        const insetX = (w - buildingWidth) / 2; const insetY = (d - buildingDepth) / 2;
        const first = { x: parcel.minX + insetX, y: parcel.minY + insetY }; const opposite = { x: parcel.maxX - insetX, y: parcel.maxY - insetY };
        const footprint = createBuildingRectangleFromCorners(first, opposite);
        if (!polygonContainsPolygon(polygon, footprint.outer) || !clearsBoundary(footprint, segments)) continue;
        const envelope = createBuildingRectangleFromCorners({ x: first.x - minSpacing, y: first.y - minSpacing }, { x: opposite.x + minSpacing, y: opposite.y + minSpacing });
        if (nearby.some((building) => polygonsIntersectOrContain(envelope.outer, building.footprint.outer))) continue;
        accepted.push(footprint); placed = true; break;
      }
      if (placed) continue;
      const rectangle = createBuildingRectangleFromCorners({ x: parcel.minX, y: parcel.minY }, { x: parcel.maxX, y: parcel.maxY });
      if (!polygonsIntersectOrContain(polygon, rectangle.outer)) continue;
    }
    if (!canSplitX && !canSplitY) continue;
    const splitX = canSplitX && (!canSplitY || w > d * 2.5 || w >= d / 2.5 && random() < 0.5);
    const length = (splitX ? w : d) - gap; const cut = Math.max(minimumSide, Math.min(length - minimumSide, length * (0.25 + random() * 0.5)));
    if (splitX) parcels.push({ ...parcel, maxX: parcel.minX + cut }, { ...parcel, minX: parcel.minX + cut + gap });
    else parcels.push({ ...parcel, maxY: parcel.minY + cut }, { ...parcel, minY: parcel.minY + cut + gap });
  }
  if (density === 1) return accepted;
  // Thin the same seeded layout so lowering density cannot introduce smaller
  // houses or move existing ones. Size and spacing remain independent controls.
  const densityRandom = randomGenerator(seed ^ 0x9e3779b9);
  const ranked = accepted.map((_, index) => ({ index, rank: densityRandom() })).sort((a, b) => a.rank - b.rank);
  const keep = new Set(ranked.slice(0, Math.max(1, Math.round(accepted.length * density))).map((entry) => entry.index));
  return accepted.filter((_, index) => keep.has(index));
}
