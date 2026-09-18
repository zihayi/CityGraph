import { Container, Graphics } from "pixi.js";
import type { EditorSelection } from "../editor/Editor";
import type { Point } from "../geometry/Point";
import { defaultLandscapingColor, type City, type Park } from "../model/City";
import { drawPolygon } from "./graphics";

export function landscapingColor(value?: string): number {
  const color = value && /^#[0-9a-f]{6}$/i.test(value) ? value : defaultLandscapingColor;
  return Number.parseInt(color.slice(1), 16);
}

export class ParkRenderer {
  public render(city: City, selection: EditorSelection = null, editable = false, zoom = 1): Container {
    const container = new Container({ label: "landscaping" });
    for (const park of city.parks) {
      const selected = selection?.kind === "park" && selection.id === park.id || selection?.kind === "spatial-group" && selection.items.some((item) => item.kind === "park" && item.id === park.id);
      this.drawPark(park, selected, editable, zoom, container);
    }
    return container;
  }

  public drawPark(park: Park, selected: boolean, editable: boolean, zoom = 1, container = new Container()): Container {
    const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1; const color = landscapingColor(park.color);
    container.addChild(drawPolygon(new Graphics({ label: `park:${park.id}` }), park.points).fill({ color, alpha: park.opacity }).stroke({ color: selected ? 0x168cff : color, alpha: selected ? 1 : Math.min(1, park.opacity + 0.3), width: selected ? 3 / scale : 1.5 }));
    if (selected && editable) for (const [index, point] of park.points.entries()) container.addChild(new Graphics({ label: `park-vertex:${park.id}:${index}` }).circle(point.x, point.y, 6 / scale).fill({ color: 0xf5fff3 }).stroke({ color: 0x168cff, width: 2 / scale }));
    return container;
  }

  public renderPreview(points: Point[], colorValue: string, opacity: number, valid: boolean, closed: boolean, zoom = 1): Container {
    const container = new Container({ label: "landscaping-preview" }); if (points.length === 0) return container; const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1; const color = valid ? landscapingColor(colorValue) : 0xd46f72;
    const preview = new Graphics().moveTo(points[0]!.x, points[0]!.y); for (const point of points.slice(1)) preview.lineTo(point.x, point.y); if (closed && points.length >= 3) preview.closePath().fill({ color, alpha: Math.max(0.15, Math.min(1, opacity)) }); preview.stroke({ color, alpha: 0.95, width: 2 / scale }); container.addChild(preview);
    for (const point of points) container.addChild(new Graphics().circle(point.x, point.y, 5 / scale).fill({ color }).stroke({ color: 0xffffff, width: 1.5 / scale }));
    return container;
  }
}
