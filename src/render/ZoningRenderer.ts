import { Container, Graphics } from "pixi.js";
import type { EditorSelection } from "../editor/Editor";
import type { City, Zone, ZoneType } from "../model/City";
import { defaultZoneColors } from "../model/ZoneStyle";
import { drawPolygon } from "./graphics";

export function zoneColor(type: ZoneType, custom?: string): number { const value = custom && /^#[0-9a-f]{6}$/i.test(custom) ? custom : defaultZoneColors[type]; return Number.parseInt(value.slice(1), 16); }

export class ZoningRenderer {
  public render(city: City, selection: EditorSelection = null, editable = false): Container {
    const container = new Container();
    for (const block of city.blocks) { if (!block.zoneType) continue; const color = zoneColor(block.zoneType); container.addChild(drawPolygon(new Graphics(), block.polygon).fill({ color, alpha: 0.2 }).stroke({ color, alpha: 0.55, width: 1.5 })); }
    for (const zone of city.zones) container.addChild(this.drawZone(zone, selection?.kind === "zone" && selection.id === zone.id, editable));
    return container;
  }

  public renderPreview(polygon: PointLike[], colorValue: string, valid: boolean, closed: boolean): Container {
    const container = new Container(); if (polygon.length === 0) return container; const color = valid ? zoneColor("custom", colorValue) : 0xd46f72; const fill = new Graphics().moveTo(polygon[0]!.x, polygon[0]!.y); for (const point of polygon.slice(1)) fill.lineTo(point.x, point.y); if (closed && polygon.length >= 3) fill.closePath().fill({ color, alpha: 0.28 }); fill.stroke({ color, alpha: 0.9, width: 2 }); container.addChild(fill); for (const point of polygon) container.addChild(new Graphics().circle(point.x, point.y, 5).fill({ color }).stroke({ color: 0xffffff, width: 1.5 })); return container;
  }

  private drawZone(zone: Zone, selected: boolean, editable: boolean): Container {
    const container = new Container(); const color = zoneColor(zone.type, zone.color); const polygon = drawPolygon(new Graphics(), zone.polygon).fill({ color, alpha: zone.opacity }).stroke({ color: selected ? 0x168cff : color, alpha: selected ? 1 : Math.min(1, zone.opacity + 0.38), width: selected ? 3 : 1.5 }); container.addChild(polygon);
    if (selected && editable) for (const point of zone.polygon) container.addChild(new Graphics().circle(point.x, point.y, 7).fill({ color: 0xffffff }).stroke({ color: 0x168cff, width: 2.5 })); return container;
  }
}

interface PointLike { x: number; y: number }
