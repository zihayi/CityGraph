import polygonClipping, { type Polygon } from "polygon-clipping";
import type { BuildingFootprint, WaterArea } from "../model/City";
import type { Point } from "./Point";
import { buildingArea, footprintContainsPoint } from "./BuildingGeometry";
import { pointsBounds } from "./ImportGeometry";
import { distancePointToSegment } from "./Segment";
import { zoneLabelPoint } from "./ZoneGeometry";

export interface WaterDisplayGroup {
  id: string;
  name: string;
  members: readonly WaterArea[];
  footprints: BuildingFootprint[];
  label?: Point;
}

function groupKey(water: WaterArea): string {
  // Both old imports and cropped/merged imports retain this ID stem. Keep different
  // import batches and user-renamed pieces separate; never group arbitrary equal names.
  const match = /^(.*?)osm-waters-(way|relation)-(-?\d+)(?:-|$)/.exec(water.id);
  return match ? JSON.stringify([match[1], match[2], match[3], water.name?.trim() ?? ""]) : water.id;
}

function labelPoint(footprint: BuildingFootprint): Point | undefined {
  const candidate = zoneLabelPoint(footprint.outer);
  if (candidate && footprintContainsPoint(footprint, candidate)) return candidate;
  const bounds = pointsBounds(footprint.outer); const rings = [footprint.outer, ...footprint.holes];
  let best: { point: Point; clearance: number } | undefined;
  for (let row = 1; row < 20; row += 1) for (let column = 1; column < 20; column += 1) {
    const point = { x: bounds.x + bounds.width * column / 20, y: bounds.y + bounds.height * row / 20 };
    if (!footprintContainsPoint(footprint, point)) continue;
    let clearance = Infinity;
    for (const ring of rings) for (let index = 0; index < ring.length; index += 1) clearance = Math.min(clearance, distancePointToSegment(point, ring[index]!, ring[(index + 1) % ring.length]!));
    if (!best || clearance > best.clearance) best = { point, clearance };
  }
  return best?.point ?? footprint.outer[0];
}

const cache = new WeakMap<readonly WaterArea[], WaterDisplayGroup[]>();

/** Cached display-only unions. Refresh explicitly after in-place geometry edits. */
export function waterDisplayGroups(waters: readonly WaterArea[], refresh = false): WaterDisplayGroup[] {
  const cached = cache.get(waters); if (!refresh && cached) return cached;
  const grouped = new Map<string, WaterArea[]>();
  for (const water of waters) { const key = groupKey(water); const group = grouped.get(key) ?? []; group.push(water); grouped.set(key, group); }
  const result: WaterDisplayGroup[] = [];
  for (const [id, members] of grouped) {
    let footprints: BuildingFootprint[] = members.map((water) => ({ outer: water.points, holes: [] }));
    if (members.length > 1) {
      // Cut vertices can differ by a few floating-point ulps after translation/cropping.
      // Snap display geometry to 0.01 mm so these do not become hairline gaps.
      const polygons: Polygon[] = members.map((water) => [water.points.map((point) => [Math.round(point.x * 100_000) / 100_000, Math.round(point.y * 100_000) / 100_000])]);
      try {
        const union = polygonClipping.union(polygons);
        if (union.length) footprints = union.map((rings) => ({ outer: rings[0]!.slice(0, -1).map(([x, y]) => ({ x, y })), holes: rings.slice(1).map((ring) => ring.slice(0, -1).map(([x, y]) => ({ x, y }))) }));
      } catch { /* Keep edited geometry visible even when its union cannot be computed. */ }
    }
    const largest = footprints.reduce<BuildingFootprint | undefined>((best, footprint) => !best || buildingArea(footprint) > buildingArea(best) ? footprint : best, undefined);
    const name = members[0]!.name?.trim() ?? "";
    result.push({ id, name, members, footprints, label: name && largest ? labelPoint(largest) : undefined });
  }
  cache.set(waters, result); return result;
}
