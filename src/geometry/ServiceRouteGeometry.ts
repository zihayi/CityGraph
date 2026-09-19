import type { City, ServiceRoute, ServiceRouteSystem, Zone } from "../model/City";
import type { Point } from "./Point";
import { sampleBezier } from "./Bezier";
import { pointToSegmentDistance } from "./RoadGeometry";
import { zoneLabelPoint } from "./ZoneGeometry";

export function terminalZoneType(system: ServiceRouteSystem): "airport" | "ferry-terminal" { return system === "airplane" ? "airport" : "ferry-terminal"; }
export function terminalAnchors(zones: readonly Zone[]): Map<string, Point> {
  const result = new Map<string, Point>();
  for (const zone of zones) { if (zone.type !== "airport" && zone.type !== "ferry-terminal") continue; const point = zoneLabelPoint(zone.polygon); if (point) result.set(zone.id, point); }
  return result;
}
export function serviceRoutePoints(route: ServiceRoute, anchors: Map<string, Point>): Point[] {
  const start = anchors.get(route.startZoneId); const end = anchors.get(route.endZoneId);
  return start && end ? [start, ...route.waypoints, end] : [];
}
export function sampleServiceRoute(system: ServiceRouteSystem, points: readonly Point[]): Point[] {
  if (system !== "airplane" || points.length !== 2) return [...points];
  const [a, b] = points as readonly [Point, Point];
  const direction = a.x < b.x || a.x === b.x && a.y <= b.y ? 1 : -1;
  const control = { x: (a.x + b.x) / 2 - (b.y - a.y) * 0.18 * direction, y: (a.y + b.y) / 2 + (b.x - a.x) * 0.18 * direction };
  return sampleBezier(a, b, [control], 32);
}
export function serviceRouteLength(points: readonly Point[]): number { return points.slice(1).reduce((total, point, i) => total + Math.hypot(point.x - points[i]!.x, point.y - points[i]!.y), 0); }
export function serviceRouteDistance(point: Point, points: readonly Point[]): number { return points.slice(1).reduce((best, end, i) => Math.min(best, pointToSegmentDistance(point, points[i]!, end)), Infinity); }
export function routesMatchingZones(routes: readonly ServiceRoute[], zones: readonly Zone[]): ServiceRoute[] {
  const types = new Map(zones.map((zone) => [zone.id, zone.type]));
  return routes.filter((route) => types.get(route.startZoneId) === terminalZoneType(route.system) && types.get(route.endZoneId) === terminalZoneType(route.system));
}
export function isServiceRoute(value: unknown, city: Pick<City, "zones">): value is ServiceRoute {
  if (!value || typeof value !== "object") return false;
  const route = value as ServiceRoute;
  if (typeof route.id !== "string" || !route.id.trim() || !["airplane", "ferry"].includes(route.system) || typeof route.name !== "string" || !route.name.trim() || typeof route.color !== "string" || !/^#[0-9a-f]{6}$/i.test(route.color) || typeof route.startZoneId !== "string" || typeof route.endZoneId !== "string" || route.startZoneId === route.endZoneId || !Array.isArray(route.waypoints) || route.waypoints.length > 1000 || !route.waypoints.every((point) => point && typeof point.x === "number" && Number.isFinite(point.x) && typeof point.y === "number" && Number.isFinite(point.y))) return false;
  return routesMatchingZones([route], city.zones).length === 1 && serviceRoutePoints(route, terminalAnchors(city.zones)).length >= 2;
}
