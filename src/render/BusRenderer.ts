import { Container, Graphics, GraphicsPath, Text } from "pixi.js";
import busIconSvg from "../../assets/transport/bus.svg?raw";
import type { EditorSelection } from "../editor/Editor";
import { busStopGeometry, sampleDirectedBusPathSegments } from "../geometry/BusGeometry";
import type { Point } from "../geometry/Point";
import type { BusPathStep, BusStop, City } from "../model/City";

const FALLBACK_COLOR = 0x327d8d;
const SELECTION_COLOR = 0x168cff;
const BUS_ICON_PATH = busIconSvg.match(/<path\b[^>]*\bd=["']([^"']+)["']/i)?.[1] ?? "";
// The SVG is a compound path: its inner contours are the window and wheel details.
// Ask Pixi to treat contained contours as holes instead of filling them solid.
const BUS_ICON_GRAPHICS_PATH = BUS_ICON_PATH ? new GraphicsPath(BUS_ICON_PATH, true) : undefined;

interface CameraStyle {
  zoom: number;
  rotation: number;
}

function colorValue(value: string | undefined): number {
  if (!value) return FALLBACK_COLOR;
  const match = value.match(/^#([0-9a-f]{6})$/i);
  return match ? Number.parseInt(match[1]!, 16) : FALLBACK_COLOR;
}

function safeZoom(zoom: number): number { return Number.isFinite(zoom) && zoom > 0 ? zoom : 1; }

function parentCamera(container: Container): CameraStyle | undefined {
  const transform = container.parent?.worldTransform;
  if (!transform) return undefined;
  const zoom = Math.hypot(transform.a, transform.b);
  if (!Number.isFinite(zoom) || zoom <= 0) return undefined;
  return { zoom, rotation: Math.atan2(transform.b, transform.a) };
}

function keepScreenUpright(container: Container, camera: CameraStyle): void {
  const apply = ({ zoom, rotation }: CameraStyle) => { container.scale.set(1 / safeZoom(zoom)); container.rotation = -rotation; };
  apply(camera);
  container.onRender = () => { const current = parentCamera(container); if (current) apply(current); };
}

function drawPolyline(graphics: Graphics, segments: Point[][]): void {
  for (const points of segments) {
    const first = points[0];
    if (!first) continue;
    graphics.moveTo(first.x, first.y);
    for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
  }
}

function markerText(text: string, size: number, color: number, weight: "600" | "700" = "700"): Text {
  return new Text({ text, style: { fontFamily: "Arial", fontSize: size, fontWeight: weight, fill: color, stroke: { color: 0xffffff, width: 3 } } });
}

export class BusRenderer {
  public render(city: City, selection: EditorSelection = null, camera: CameraStyle = { zoom: 1, rotation: 0 }, showLines = true): Container {
    const container = new Container({ label: "buses" });
    const pathLayer = new Container({ label: "bus-paths" }); const connectorLayer = new Container({ label: "bus-connectors" }); const markerLayer = new Container({ label: "bus-markers" });
    const lines = showLines ? city.busLines ?? [] : []; const stops = city.busStops ?? []; const lineLookup = new Map((city.busLines ?? []).map((line) => [line.id, line]));

    for (const line of lines) {
      const segments = sampleDirectedBusPathSegments(city, line);
      if (segments.length === 0) continue;
      const color = colorValue(line.color); const selected = selection?.kind === "bus-line" && selection.id === line.id;
      if (selected) { const highlight = new Graphics({ label: `bus-line-selection:${line.id}` }); drawPolyline(highlight, segments); highlight.stroke({ color: SELECTION_COLOR, width: 12, alpha: 0.68, cap: "round", join: "round" }); pathLayer.addChild(highlight); }
      const path = new Graphics({ label: `bus-line:${line.id}` }); drawPolyline(path, segments); path.stroke({ color, width: 6, alpha: 0.96, cap: "round", join: "round" }); pathLayer.addChild(path);
    }

    for (const stop of stops) {
      const geometry = busStopGeometry(city, stop); const line = lineLookup.get(stop.lineId); const color = colorValue(line?.color); const selected = selection?.kind === "bus-stop" && selection.id === stop.id;
      if (geometry.roadPoint.x !== geometry.stopPoint.x || geometry.roadPoint.y !== geometry.stopPoint.y) {
        const connector = new Container({ label: `bus-stop-connector:${stop.id}` });
        const halo = new Graphics().moveTo(geometry.roadPoint.x, geometry.roadPoint.y).lineTo(geometry.stopPoint.x, geometry.stopPoint.y).stroke({ color: 0xffffff, width: 4, alpha: 0.9, cap: "round" });
        const stem = new Graphics().moveTo(geometry.roadPoint.x, geometry.roadPoint.y).lineTo(geometry.stopPoint.x, geometry.stopPoint.y).stroke({ color, width: 1.5, alpha: 0.95, cap: "round" }); connector.addChild(halo, stem); connectorLayer.addChild(connector);
      }
      const marker = new Container({ label: `bus-stop:${stop.id}` }); marker.position.set(geometry.stopPoint.x, geometry.stopPoint.y); keepScreenUpright(marker, camera);
       if (selected) marker.addChild(new Graphics().roundRect(-11, -11, 22, 22, 7).fill({ color: SELECTION_COLOR, alpha: 0.2 }).stroke({ color: SELECTION_COLOR, width: 2.5 }));
       marker.addChild(new Graphics().roundRect(-10, -10, 20, 20, 6).fill({ color, alpha: 0.96 }));
       const iconContainer = new Container({ label: `bus-stop-icon:${stop.id}` });
       if (BUS_ICON_GRAPHICS_PATH) { const icon = new Graphics().path(BUS_ICON_GRAPHICS_PATH).fill({ color: 0xf9fcfb }); icon.pivot.set(512, 512); icon.scale.set(0.011); iconContainer.addChild(icon); }
       marker.addChild(iconContainer);
       const label = markerText(stop.name, 11, 0x263940, "600"); label.position.set(12, -7); marker.addChild(label);
      markerLayer.addChild(marker);
    }

    container.addChild(pathLayer, connectorLayer, markerLayer);
    return container;
  }

  public renderDraft(city: City, path: BusPathStep[], stops: Array<Omit<BusStop, "id" | "lineId">>, candidate: Omit<BusStop, "id" | "lineId"> | undefined, color: string, camera: CameraStyle): Container {
    const lineId = "bus-line-preview"; const allStops = [...stops, ...(candidate ? [candidate] : [])];
    const busStops: BusStop[] = allStops.map((stop, index) => ({ ...stop, id: `bus-stop-preview-${index}`, lineId }));
    const preview: City = { ...city, busTerminals: [], busLines: [{ id: lineId, name: "", color, loop: false, path, direction: "start-to-end", stopIds: busStops.map((stop) => stop.id) }], busStops };
    const rendered = this.render(preview, { kind: "bus-line", id: lineId }, camera, true); rendered.label = "bus-loop-preview"; return rendered;
  }
}
