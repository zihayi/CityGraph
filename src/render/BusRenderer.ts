import { Container, Graphics, GraphicsPath, Text } from "pixi.js";
import busIconSvg from "../../assets/transport/bus.svg?raw";
import type { EditorSelection } from "../editor/Editor";
import { busStopGeometry, sampleDirectedBusPathSegments } from "../geometry/BusGeometry";
import type { Point } from "../geometry/Point";
import type { City } from "../model/City";

const FALLBACK_COLOR = 0x327d8d;
const SELECTION_COLOR = 0x168cff;
const BUS_ICON_PATH = busIconSvg.match(/<path\b[^>]*\bd=["']([^"']+)["']/i)?.[1] ?? "";
const BUS_ICON_GRAPHICS_PATH = BUS_ICON_PATH ? new GraphicsPath(BUS_ICON_PATH) : undefined;

interface CameraStyle {
  zoom: number;
  rotation: number;
}

interface ArrowPath {
  segments: Point[][];
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

function pathLength(points: Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y);
  return total;
}

function pointAtDistance(points: Point[], target: number): { point: Point; tangent: Point } | undefined {
  let traversed = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!; const end = points[index]!; const dx = end.x - start.x; const dy = end.y - start.y; const length = Math.hypot(dx, dy);
    if (length <= 1e-6) continue;
    if (traversed + length >= target) { const ratio = (target - traversed) / length; return { point: { x: start.x + dx * ratio, y: start.y + dy * ratio }, tangent: { x: dx / length, y: dy / length } }; }
    traversed += length;
  }
  return undefined;
}

function drawArrows(layer: Container, paths: ArrowPath[], zoomValue: number): void {
  layer.removeChildren().forEach((child) => child.destroy());
  const zoom = safeZoom(zoomValue); const spacing = 86 / zoom; const inset = 30 / zoom; const halfLength = 7 / zoom; const wing = 4.5 / zoom;
  for (const path of paths) {
    for (const points of path.segments) {
      const total = pathLength(points);
      const distances: number[] = [];
      for (let distance = inset; distance <= total - inset; distance += spacing) distances.push(distance);
      if (distances.length === 0 && total * zoom >= 34) distances.push(total / 2);
      const shadow = new Graphics(); const arrows = new Graphics();
      for (const distance of distances) {
        const located = pointAtDistance(points, distance);
        if (!located) continue;
        const { point, tangent } = located; const normal = { x: -tangent.y, y: tangent.x }; const tip = { x: point.x + tangent.x * halfLength, y: point.y + tangent.y * halfLength }; const back = { x: point.x - tangent.x * halfLength, y: point.y - tangent.y * halfLength };
        for (const graphics of [shadow, arrows]) graphics.moveTo(back.x + normal.x * wing, back.y + normal.y * wing).lineTo(tip.x, tip.y).lineTo(back.x - normal.x * wing, back.y - normal.y * wing);
      }
      shadow.stroke({ color: 0x18343d, width: 5 / zoom, alpha: 0.78, cap: "round", join: "round" });
      arrows.stroke({ color: 0xffffff, width: 2.1 / zoom, alpha: 0.98, cap: "round", join: "round" });
      layer.addChild(shadow, arrows);
    }
  }
}

function markerText(text: string, size: number, color: number, weight: "600" | "700" = "700"): Text {
  return new Text({ text, style: { fontFamily: "Arial", fontSize: size, fontWeight: weight, fill: color, stroke: { color: 0xffffff, width: 3 } } });
}

export class BusRenderer {
  public render(city: City, selection: EditorSelection = null, camera: CameraStyle = { zoom: 1, rotation: 0 }): Container {
    const container = new Container({ label: "buses" });
    const pathLayer = new Container({ label: "bus-paths" }); const arrowLayer = new Container({ label: "bus-arrows" }); const connectorLayer = new Container({ label: "bus-connectors" }); const markerLayer = new Container({ label: "bus-markers" });
    const lines = city.busLines ?? []; const terminals = city.busTerminals ?? []; const stops = city.busStops ?? []; const lineLookup = new Map(lines.map((line) => [line.id, line])); const arrowPaths: ArrowPath[] = [];

    for (const line of lines) {
      const segments = sampleDirectedBusPathSegments(city, line);
      if (segments.length === 0) continue;
      const color = colorValue(line.color); const selected = selection?.kind === "bus-line" && selection.id === line.id;
      if (selected) { const highlight = new Graphics({ label: `bus-line-selection:${line.id}` }); drawPolyline(highlight, segments); highlight.stroke({ color: SELECTION_COLOR, width: 12, alpha: 0.68, cap: "round", join: "round" }); pathLayer.addChild(highlight); }
      const path = new Graphics({ label: `bus-line:${line.id}` }); drawPolyline(path, segments); path.stroke({ color, width: 6, alpha: 0.96, cap: "round", join: "round" }); pathLayer.addChild(path);
      arrowPaths.push({ segments });
    }

    drawArrows(arrowLayer, arrowPaths, camera.zoom);
    let arrowZoom = safeZoom(camera.zoom);
    container.onRender = () => { const current = parentCamera(container); if (current && (current.zoom / arrowZoom > 1.12 || arrowZoom / current.zoom > 1.12)) { arrowZoom = current.zoom; drawArrows(arrowLayer, arrowPaths, arrowZoom); } };

    for (const stop of stops) {
      const geometry = busStopGeometry(city, stop); const line = lineLookup.get(stop.lineId); const color = colorValue(line?.color); const selected = selection?.kind === "bus-stop" && selection.id === stop.id;
      if (geometry.roadPoint.x !== geometry.stopPoint.x || geometry.roadPoint.y !== geometry.stopPoint.y) {
        const connector = new Container({ label: `bus-stop-connector:${stop.id}` });
        const halo = new Graphics().moveTo(geometry.roadPoint.x, geometry.roadPoint.y).lineTo(geometry.stopPoint.x, geometry.stopPoint.y).stroke({ color: 0xffffff, width: 4, alpha: 0.9, cap: "round" });
        const stem = new Graphics().moveTo(geometry.roadPoint.x, geometry.roadPoint.y).lineTo(geometry.stopPoint.x, geometry.stopPoint.y).stroke({ color, width: 1.5, alpha: 0.95, cap: "round" }); connector.addChild(halo, stem); connectorLayer.addChild(connector);
      }
      const marker = new Container({ label: `bus-stop:${stop.id}` }); marker.position.set(geometry.stopPoint.x, geometry.stopPoint.y); keepScreenUpright(marker, camera);
      if (selected) marker.addChild(new Graphics().roundRect(-16, -18, 32, 36, 10).fill({ color: SELECTION_COLOR, alpha: 0.2 }).stroke({ color: SELECTION_COLOR, width: 3 }));
      marker.addChild(new Graphics().roundRect(-12, -14, 24, 28, 7).fill({ color: 0xf9fcfb, alpha: 0.98 }).stroke({ color, width: 1.5 }));
      marker.addChild(new Graphics().roundRect(-8, -10, 16, 20, 4).fill({ color }));
      if (BUS_ICON_GRAPHICS_PATH) { const icon = new Graphics().path(BUS_ICON_GRAPHICS_PATH).fill({ color: 0xffffff }); icon.pivot.set(512, 512); icon.scale.set(0.013); marker.addChild(icon); }
      const label = markerText(stop.name, 11, 0x263940, "600"); label.position.set(17, -7); marker.addChild(label);
      markerLayer.addChild(marker);
    }

    for (const terminal of terminals) {
      const connected = lines.find((line) => line.startTerminalId === terminal.id || line.endTerminalId === terminal.id); const color = colorValue(connected?.color); const selected = selection?.kind === "bus-terminal" && selection.id === terminal.id;
      const marker = new Container({ label: `bus-terminal:${terminal.id}` }); marker.position.set(terminal.position.x, terminal.position.y); keepScreenUpright(marker, camera);
      if (selected) marker.addChild(new Graphics().circle(0, 0, 18).fill({ color: SELECTION_COLOR, alpha: 0.2 }).stroke({ color: SELECTION_COLOR, width: 3 }));
      marker.addChild(new Graphics().circle(0, 0, 13).fill({ color }).stroke({ color: 0xffffff, width: 3 }));
      const glyph = new Text({ text: "B", style: { fontFamily: "Arial", fontSize: 13, fontWeight: "700", fill: 0xffffff } }); glyph.anchor.set(0.5); glyph.position.y = -0.5; marker.addChild(glyph);
      const label = markerText(terminal.name, 12, 0x263940, "600"); label.position.set(18, -8); marker.addChild(label); markerLayer.addChild(marker);
    }

    container.addChild(pathLayer, arrowLayer, connectorLayer, markerLayer);
    return container;
  }
}
