import { Container, Graphics } from "pixi.js";
import type { EditorSelection } from "../editor/Editor";
import type { Building, BuildingFootprint, BuildingType, City } from "../model/City";
import type { FootprintEdge } from "../geometry/BuildingGeometry";

const colors: Record<BuildingType, number> = { residential: 0xe5ddd0, commercial: 0xd9cde3, education: 0xc5dce5, medical: 0xe5c7ca, government: 0xcbd4d8, industrial: 0xc9c2ce, office: 0xc4d1dc, public: 0xd7b4a4, custom: 0xd7d7d2 };

function drawRing(graphics: Graphics, points: readonly { x: number; y: number }[]): void { if (points.length >= 3) graphics.poly(points.flatMap((point) => [point.x, point.y]), true); }
function drawFootprint(graphics: Graphics, footprint: BuildingFootprint, color: number, alpha: number, stroke: { color: number; width: number; alpha?: number }): void {
  drawRing(graphics, footprint.outer); graphics.fill({ color, alpha });
  for (const hole of footprint.holes) { drawRing(graphics, hole); graphics.cut(); }
  drawRing(graphics, footprint.outer); graphics.stroke(stroke); for (const hole of footprint.holes) { drawRing(graphics, hole); graphics.stroke(stroke); }
}

export class BuildingRenderer {
  public render(city: City, selection: EditorSelection = null): Container {
    const container = new Container();
    for (const building of city.buildings) { const selected = selection?.kind === "building" && selection.id === building.id; const shape = new Graphics(); drawFootprint(shape, building.footprint, colors[building.type], 0.95, { color: selected ? 0x168cff : 0x9da8aa, width: selected ? 3 : 1.2 }); container.addChild(shape); }
    return container;
  }

  public renderPreview(building: Building, valid: boolean): Container { const container = new Container(); const shape = new Graphics(); if (building.footprint.outer.length >= 3) drawFootprint(shape, building.footprint, valid ? colors[building.type] : 0xe47878, 0.48, { color: valid ? 0x159b9e : 0xc73d48, width: 2 }); else { const first = building.footprint.outer[0]; if (first) { shape.moveTo(first.x, first.y); for (const point of building.footprint.outer.slice(1)) shape.lineTo(point.x, point.y); shape.stroke({ color: 0x159b9e, width: 2 }); for (const point of building.footprint.outer) shape.circle(point.x, point.y, 3).fill({ color: 0x159b9e }); } } container.addChild(shape); return container; }

  public renderEditor(building: Building, zoom: number, selectedEdge?: FootprintEdge): Container {
    const container = new Container(); const width = 2 / zoom; const radius = 5 / zoom; const rings = [building.footprint.outer, ...building.footprint.holes]; const outline = new Graphics();
    rings.forEach((ring, ringIndex) => { drawRing(outline, ring); outline.stroke({ color: 0x137f91, width, alpha: 0.8 }); if (selectedEdge?.ringIndex === ringIndex) { const a = ring[selectedEdge.edgeIndex]; const b = ring[(selectedEdge.edgeIndex + 1) % ring.length]; if (a && b) outline.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0xffa641, width: 4 / zoom }); } for (const point of ring) outline.circle(point.x, point.y, radius).fill({ color: 0xf5ffff, alpha: 0.96 }).stroke({ color: 0x087f91, width: 1.5 / zoom }); });
    container.addChild(outline); return container;
  }
}
