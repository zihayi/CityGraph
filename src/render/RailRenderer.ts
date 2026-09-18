import { Container, Graphics, GraphicsPath, Text } from "pixi.js";
import metroIconSvg from "../../assets/transport/metro_SH.svg?raw";
import type { EditorSelection } from "../editor/Editor";
import { routeRailStations, sampleRailPath, sampleRailTrack } from "../geometry/RailGeometry";
import type { Point } from "../geometry/Point";
import type { City, RailSystem, RailTrack } from "../model/City";

interface CameraStyle { zoom: number; rotation: number }
export interface RailDraft { mode: "track" | "line"; system: RailSystem; points?: Point[]; waypoints?: Point[]; stationIds?: string[]; color?: string; loop?: boolean }

function colorValue(value: string | undefined, fallback = 0xd9485f): number { const match = value?.match(/^#([0-9a-f]{6})$/i); return match ? Number.parseInt(match[1]!, 16) : fallback; }
function safeZoom(zoom: number): number { return Number.isFinite(zoom) && zoom > 0 ? zoom : 1; }
function keepScreenUpright(container: Container, camera: CameraStyle): void {
  const apply = (zoom: number, rotation: number) => { container.scale.set(1 / safeZoom(zoom)); container.rotation = -rotation; };
  apply(camera.zoom, camera.rotation); container.onRender = () => { const transform = container.parent?.worldTransform; if (transform) apply(Math.hypot(transform.a, transform.b), Math.atan2(transform.b, transform.a)); };
}
function polyline(points: readonly Point[], label?: string): Graphics { const path = new Graphics({ label }); const first = points[0]; if (!first) return path; path.moveTo(first.x, first.y); for (const point of points.slice(1)) path.lineTo(point.x, point.y); return path; }
function dashedPolyline(points: readonly Point[], width: number, color: number, label: string): Graphics {
  const graphics = new Graphics({ label }); let drawing = true; let remaining = 12;
  for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) { const start = points[pointIndex - 1]!; const end = points[pointIndex]!; const dx = end.x - start.x; const dy = end.y - start.y; const length = Math.hypot(dx, dy); if (length <= 1e-9) continue; let offset = 0; while (offset < length - 1e-9) { const step = Math.min(remaining, length - offset); if (drawing) graphics.moveTo(start.x + dx * offset / length, start.y + dy * offset / length).lineTo(start.x + dx * (offset + step) / length, start.y + dy * (offset + step) / length); offset += step; remaining -= step; if (remaining <= 1e-9) { drawing = !drawing; remaining = 12; } } }
  return graphics.stroke({ color, width, cap: "butt" });
}

const METRO_ICON_PATH = metroIconSvg.match(/<path\b[^>]*\bd=["']([^"']+)["']/i)?.[1] ?? "";
const METRO_ICON_GRAPHICS_PATH = METRO_ICON_PATH ? new GraphicsPath(METRO_ICON_PATH) : undefined;

export class RailRenderer {
  public render(city: City, selection: EditorSelection = null, camera: CameraStyle = { zoom: 1, rotation: 0 }, prominent = false, prominentSystem: RailSystem = "train"): Container {
    const container = new Container({ label: "railways" }); const tracks = new Container({ label: "rail-tracks" }); const lines = new Container({ label: "rail-lines" }); const markers = new Container({ label: "rail-markers" }); const nodes = new Map((city.railNodes ?? []).map((node) => [node.id, node]));
    for (const track of city.railTracks ?? []) { const points = sampleRailTrack(track, nodes); if (points.length < 2) continue; const active = prominent && track.system === prominentSystem; const selected = selection?.kind === "rail-track" && selection.id === track.id;
      if (track.system === "metro") {
        if (selected) tracks.addChild(polyline(points, `rail-track-selection:${track.id}`).stroke({ color: 0x19bfc2, width: 11, alpha: 0.62, cap: "round" }));
        tracks.addChild(polyline(points, `rail-track:${track.id}`).stroke({ color: 0x3d4a4f, width: active ? 6 : 3.5, alpha: active ? 0.9 : 0.34, cap: "round" }), polyline(points, `rail-track-rail:${track.id}`).stroke({ color: 0xaeb9b8, width: active ? 2 : 1.2, alpha: active ? 0.96 : 0.46, cap: "round" }));
      } else {
        if (selected) tracks.addChild(polyline(points, `rail-track-selection:${track.id}`).stroke({ color: 0x000000, width: 11, cap: "round" }), polyline(points, `rail-track-selection-inner:${track.id}`).stroke({ color: 0xffffff, width: 8, cap: "round" }));
        tracks.addChild(polyline(points, `rail-track:${track.id}`).stroke({ color: 0x000000, width: active ? 5 : 3, cap: "round" }), dashedPolyline(points, active ? 2.5 : 1.5, 0xffffff, `rail-track-dashes:${track.id}`));
      }
    }
    if (prominent) for (const line of (city.railLines ?? []).filter((candidate) => candidate.system === prominentSystem)) { const points = sampleRailPath(city, line.path); if (points.length < 2) continue; const selected = selection?.kind === "rail-line" && selection.id === line.id; if (selected) lines.addChild(polyline(points, `rail-line-selection:${line.id}`).stroke({ color: 0xffffff, width: 12, alpha: 0.9, cap: "round", join: "round" })); lines.addChild(polyline(points, `rail-line:${line.id}`).stroke({ color: colorValue(line.color), width: selected ? 7 : 6, alpha: 0.96, cap: "round", join: "round" })); }
    if (prominent) for (const node of (city.railNodes ?? []).filter((candidate) => candidate.system === prominentSystem)) { const selected = selection?.kind === "rail-node" && selection.id === node.id; tracks.addChild(node.system === "metro" ? new Graphics({ label: `rail-node:${node.id}` }).circle(node.x, node.y, selected ? 5 : 2.7).fill({ color: selected ? 0x19bfc2 : 0xd9e2e1, alpha: selected ? 1 : 0.86 }).stroke({ color: 0x35464b, width: 1 }) : new Graphics({ label: `rail-node:${node.id}` }).circle(node.x, node.y, selected ? 5 : 2.7).fill({ color: 0xffffff }).stroke({ color: 0x000000, width: selected ? 2.5 : 1 })); }
    for (const station of city.railStations ?? []) {
      const node = nodes.get(station.nodeId); if (!node) continue; const active = prominent && station.system === prominentSystem; const selected = selection?.kind === "rail-station" && selection.id === station.id; const marker = new Container({ label: `rail-station:${station.id}` }); marker.position.set(node.x, node.y); keepScreenUpright(marker, camera);
      if (station.system === "metro") {
        const stationLines = (city.railLines ?? []).filter((line) => line.system === "metro" && line.stationIds.includes(station.id)); const colors = [...new Set(stationLines.map((line) => colorValue(line.color)))];
        if (selected) marker.addChild(new Graphics().roundRect(-15, -14, 30, 28, 5).fill({ color: 0x19bfc2, alpha: 0.2 }).stroke({ color: 0x19bfc2, width: 2.5 }));
        marker.addChild(new Graphics({ label: `metro-station-logo-background:${station.id}` }).roundRect(-13, -12, 26, 24, 3).fill({ color: 0xffffff }).stroke({ color: 0xd4dfe1, width: 1 }));
        const fallbackLogo = new Graphics({ label: `metro-station-logo:${station.id}` });
        if (METRO_ICON_GRAPHICS_PATH) { fallbackLogo.path(METRO_ICON_GRAPHICS_PATH).fill({ color: 0xd81e06 }); fallbackLogo.pivot.set(512, 512); fallbackLogo.scale.set(0.026); }
        marker.addChild(fallbackLogo);
        const label = new Text({ text: station.name, style: { fontFamily: "Arial", fontSize: 11, fontWeight: "600", fill: 0x263940, stroke: { color: 0xffffff, width: 3 } } }); label.position.set(17, -9); marker.addChild(label); stationLines.forEach((line, index) => { const y = 5 + index * 10; marker.addChild(new Graphics({ label: `metro-station-line-color:${station.id}:${line.id}` }).circle(20, y + 3, 3).fill({ color: colorValue(line.color) })); const lineLabel = new Text({ label: `metro-station-line:${station.id}:${line.id}`, text: line.name, style: { fontFamily: "Arial", fontSize: 8, fontWeight: "700", fill: colorValue(line.color), stroke: { color: 0xffffff, width: 2 } } }); lineLabel.position.set(25, y - 2); marker.addChild(lineLabel); });
      } else {
        const radius = active ? 7 : 4.5; if (selected) marker.addChild(new Graphics().circle(0, 0, radius + 5).fill({ color: 0x19bfc2, alpha: 0.2 }).stroke({ color: 0x19bfc2, width: 2.5 })); marker.addChild(new Graphics().circle(0, 0, radius).fill({ color: 0xffffff, alpha: active ? 1 : 0.8 }).stroke({ color: 0x273a40, width: active ? 2.5 : 1.5 })); if (active) { const label = new Text({ text: station.name, style: { fontFamily: "Arial", fontSize: 11, fontWeight: "600", fill: 0x263940, stroke: { color: 0xffffff, width: 3 } } }); label.position.set(11, -7); marker.addChild(label); }
      }
      markers.addChild(marker);
    }
    container.addChild(tracks, lines, markers); return container;
  }

  public renderDraft(city: City, draft: RailDraft, camera: CameraStyle): Container {
    const container = new Container({ label: "rail-preview" });
    if (draft.mode === "track") { const points = draft.points ?? []; if (points.length > 0) { if (draft.system === "metro") container.addChild(polyline(points, "rail-track-preview").stroke({ color: 0x19bfc2, width: 5, alpha: 0.88, cap: "round", join: "round" })); else container.addChild(polyline(points, "rail-track-preview").stroke({ color: 0x000000, width: 5, cap: "round", join: "round" }), dashedPolyline(points, 2.5, 0xffffff, "rail-track-preview-dashes")); for (const point of draft.waypoints ?? points.slice(0, -1)) container.addChild(new Graphics().circle(point.x, point.y, 4 / safeZoom(camera.zoom)).fill({ color: 0xffffff }).stroke({ color: draft.system === "metro" ? 0x19bfc2 : 0x000000, width: 2 / safeZoom(camera.zoom) })); } return container; }
    const stationIds = draft.stationIds ?? []; const path = routeRailStations(city, stationIds, draft.loop ?? false, draft.system); const points = draft.points ? [...draft.points, ...(draft.loop && draft.points.length > 1 ? [draft.points[0]!] : [])] : path ? sampleRailPath(city, path) : [];
    if (points.length > 1) container.addChild(polyline(points, "rail-line-preview").stroke({ color: colorValue(draft.color), width: 7, alpha: 0.82, cap: "round", join: "round" }));
    if (draft.points) { draft.points.forEach((point, index) => { const marker = new Container({ label: `rail-draft-station:${draft.system}:${index}` }); marker.position.set(point.x, point.y); keepScreenUpright(marker, camera); marker.addChild(new Graphics().circle(0, 0, 10).fill({ color: colorValue(draft.color) }).stroke({ color: 0xffffff, width: 2 })); const number = new Text({ text: String(index + 1), style: { fontFamily: "Arial", fontSize: 10, fontWeight: "700", fill: 0xffffff } }); number.anchor.set(0.5); marker.addChild(number); container.addChild(marker); }); return container; }
    const stations = new Map((city.railStations ?? []).map((station) => [station.id, station])); const nodes = new Map((city.railNodes ?? []).map((node) => [node.id, node])); stationIds.forEach((id, index) => { const station = stations.get(id); const node = station ? nodes.get(station.nodeId) : undefined; if (!node) return; const marker = new Container({ label: `rail-draft-station:${id}` }); marker.position.set(node.x, node.y); keepScreenUpright(marker, camera); marker.addChild(new Graphics().circle(0, 0, 10).fill({ color: colorValue(draft.color) }).stroke({ color: 0xffffff, width: 2 })); const number = new Text({ text: String(index + 1), style: { fontFamily: "Arial", fontSize: 10, fontWeight: "700", fill: 0xffffff } }); number.anchor.set(0.5); marker.addChild(number); container.addChild(marker); }); return container;
  }
}
