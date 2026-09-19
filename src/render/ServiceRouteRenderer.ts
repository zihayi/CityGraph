import { Container, Graphics, GraphicsPath, Text } from "pixi.js";
import type { EditorSelection } from "../editor/Editor";
import type { Point } from "../geometry/Point";
import { sampleServiceRoute, serviceRoutePoints, terminalAnchors, terminalZoneType } from "../geometry/ServiceRouteGeometry";
import type { City, ServiceRouteSystem } from "../model/City";
import { zoneIconPath, zoneIconViewBox } from "../model/ZoneIconAssets";
import { defaultZoneIconColors } from "../model/ZoneStyle";

type CameraStyle = { zoom: number; rotation: number };
export interface ServiceRouteDraft { system: ServiceRouteSystem; points: Point[]; color: string }
const iconPaths = new Map<string, GraphicsPath>();
function color(value: string): number { return /^#[0-9a-f]{6}$/i.test(value) ? Number.parseInt(value.slice(1), 16) : 0x367f95; }
function upright(container: Container, camera: CameraStyle): void {
  const apply = (zoom: number, rotation: number) => { container.scale.set(1 / Math.max(zoom, 1e-6)); container.rotation = -rotation; };
  apply(camera.zoom, camera.rotation); container.onRender = () => { const matrix = container.parent?.worldTransform; if (matrix) apply(Math.hypot(matrix.a, matrix.b), Math.atan2(matrix.b, matrix.a)); };
}
function routeStroke(points: readonly Point[], tint: number, selected: boolean, camera: CameraStyle): Graphics {
  const path = new Graphics(); let previousZoom = 0;
  const draw = (zoom: number) => {
    if (Math.abs(zoom - previousZoom) < 1e-6) return; previousZoom = zoom; path.clear();
    const trace = () => { if (!points.length) return; path.moveTo(points[0]!.x, points[0]!.y); for (const point of points.slice(1)) path.lineTo(point.x, point.y); };
    if (selected) { trace(); path.stroke({ color: 0xffffff, width: 7 / zoom, alpha: 0.95, cap: "round", join: "round" }); }
    trace(); path.stroke({ color: tint, width: (selected ? 4 : 2.5) / zoom, alpha: 0.9, cap: "round", join: "round" });
  };
  draw(Math.max(camera.zoom, 1e-6)); path.onRender = () => { const matrix = path.parent?.worldTransform; if (matrix) draw(Math.max(Math.hypot(matrix.a, matrix.b), 1e-6)); };
  return path;
}
export class ServiceRouteRenderer {
  public render(city: City, selection: EditorSelection, camera: CameraStyle, system?: ServiceRouteSystem): Container {
    const container = new Container({ label: "service-routes" }); const anchors = terminalAnchors(city.zones);
    for (const route of city.serviceRoutes ?? []) {
      if (route.system !== system) continue;
      const selected = selection?.kind === "service-route" && selection.id === route.id;
      const points = sampleServiceRoute(route.system, serviceRoutePoints(route, anchors)); if (points.length < 2) continue;
      const stroke = routeStroke(points, color(route.color), selected, camera); stroke.label = `service-route:${route.id}`; container.addChild(stroke);
      const middle = Math.floor((points.length - 1) / 2); const a = points[middle]!; const b = points[middle + 1]!; const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; const label = new Container({ label: `service-route-name:${route.id}` }); label.position.set(center.x, center.y); upright(label, camera);
      label.addChild(new Text({ text: route.name, style: { fontFamily: "Arial", fontSize: 11, fontWeight: "600", fill: color(route.color), stroke: { color: 0xffffff, width: 3 } } })); label.children[0]!.position.set(8, -18); container.addChild(label);
      if (selected) for (const point of route.waypoints) { const handle = new Container(); handle.position.set(point.x, point.y); upright(handle, camera); handle.addChild(new Graphics().circle(0, 0, 5).fill(0xffffff).stroke({ color: color(route.color), width: 2 })); container.addChild(handle); }
    }
    for (const zone of city.zones) {
      const point = anchors.get(zone.id); if (!point) continue;
      const active = system && zone.type === terminalZoneType(system); const selected = selection?.kind === "zone" && selection.id === zone.id;
      if (active) container.addChild(new Graphics().poly(zone.polygon.flatMap((p) => [p.x, p.y])).fill({ color: color(zone.color ?? "#a5c8cc"), alpha: 0.18 }).stroke({ color: color(defaultZoneIconColors[zone.type]), width: 1.5 / Math.max(camera.zoom, 1e-6), alpha: 0.7 }));
      const marker = new Container({ label: `service-terminal:${zone.id}` }); marker.position.set(point.x, point.y); upright(marker, camera);
      const tint = color(zone.iconColor ?? defaultZoneIconColors[zone.type]); marker.addChild(new Graphics().circle(0, 0, selected ? 16 : 13).fill(tint).stroke({ color: selected ? 0x49bfb5 : 0xffffff, width: selected ? 3 : 2 }));
      const icon = zone.icon ?? zone.type; let path = iconPaths.get(icon); if (!path) { path = new GraphicsPath(zoneIconPath(icon)); iconPaths.set(icon, path); }
      const [, , width, height] = zoneIconViewBox(icon).split(/\s+/).map(Number); const glyph = new Graphics().path(path).fill(0xffffff); glyph.pivot.set((width ?? 256) / 2, (height ?? 256) / 2); glyph.scale.set(16 / Math.max(width ?? 256, height ?? 256)); marker.addChild(glyph);
      if (zone.name) { const text = new Text({ text: zone.name, style: { fontFamily: "Arial", fontSize: 11, fontWeight: "600", fill: 0x304a50, stroke: { color: 0xffffff, width: 3 } } }); text.position.set(18, -7); marker.addChild(text); }
      container.addChild(marker);
    }
    return container;
  }
  public renderDraft(draft: ServiceRouteDraft, camera: CameraStyle): Container {
    const container = new Container({ label: "service-route-preview" }); const points = sampleServiceRoute(draft.system, draft.points);
    container.addChild(routeStroke(points, color(draft.color), false, camera));
    for (const point of draft.points) { const marker = new Container(); marker.position.set(point.x, point.y); upright(marker, camera); marker.addChild(new Graphics().circle(0, 0, 5).fill(0xffffff).stroke({ color: color(draft.color), width: 2 })); container.addChild(marker); }
    return container;
  }
}
