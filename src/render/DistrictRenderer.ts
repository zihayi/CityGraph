import { Container, Graphics, Text } from "pixi.js";
import type { EditorSelection } from "../editor/Editor";
import type { Point } from "../geometry/Point";
import { zoneLabelPoint } from "../geometry/ZoneGeometry";
import { districtBorderColor, districtFillColor, districtFillOpacity, type City, type District } from "../model/City";
import { drawPolygon } from "./graphics";

function color(value: string): number { return Number.parseInt(value.slice(1), 16); }
const districtColors = [0xe2a85f, 0x67aaa5, 0xd17f83, 0x758fc2, 0x9b7db5, 0x80a960, 0xcf9062, 0x559abb, 0xb87ca2, 0x62a77d, 0xc5a04f, 0x6f86ad];
function districtColor(index: number): number { return districtColors[index % districtColors.length]!; }
function borderColor(value: number): number { return ((value >> 16) * 0.58 << 16) | (((value >> 8) & 0xff) * 0.58 << 8) | ((value & 0xff) * 0.58); }

export class DistrictRenderer {
  public render(city: City, selection: EditorSelection = null, editable = false, zoom = 1): Container {
    const container = new Container({ label: "districts" });
    for (const [index, district] of city.districts.entries()) {
      const selected = selection?.kind === "district" && selection.id === district.id || selection?.kind === "spatial-group" && selection.items.some((item) => item.kind === "district" && item.id === district.id);
      this.drawDistrict(district, index, selected, editable, zoom, container);
    }
    return container;
  }

  public drawDistrict(district: District, index: number, selected: boolean, editable: boolean, zoom = 1, container = new Container()): Container {
    const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1; const fill = districtColor(index);
    container.addChild(drawPolygon(new Graphics({ label: `district:${district.id}` }), district.points).fill({ color: fill, alpha: Math.max(0.26, districtFillOpacity) }).stroke({ color: selected ? 0x168cff : borderColor(fill), alpha: 0.95, width: (selected ? 3 : 2) / scale }));
    if (selected && editable) for (const [vertexIndex, point] of district.points.entries()) container.addChild(new Graphics({ label: `district-vertex:${district.id}:${vertexIndex}` }).circle(point.x, point.y, 6 / scale).fill({ color: 0xfffbef }).stroke({ color: 0x168cff, width: 2 / scale }));
    return container;
  }

  public renderLabels(city: City, zoom = 1): Container {
    const container = new Container({ label: "district-labels" }); const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    for (const [index, district] of city.districts.entries()) { const center = zoneLabelPoint(district.points); if (!center || !district.name) continue; const label = new Text({ text: district.name, style: { fontFamily: "Arial", fontSize: 14, fontWeight: "700", fill: borderColor(districtColor(index)), stroke: { color: 0xffffff, width: 3 } } }); label.anchor.set(0.5); label.position.set(center.x, center.y); label.scale.set(1 / scale); container.addChild(label); }
    return container;
  }

  public renderPreview(points: Point[], valid: boolean, zoom = 1): Container {
    const container = new Container({ label: "district-preview" }); if (points.length === 0) return container; const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1; const previewColor = valid ? color(districtBorderColor) : 0xd64f55;
    const preview = new Graphics().moveTo(points[0]!.x, points[0]!.y); for (const point of points.slice(1)) preview.lineTo(point.x, point.y); if (points.length >= 3) preview.closePath().fill({ color: valid ? color(districtFillColor) : previewColor, alpha: districtFillOpacity }); preview.stroke({ color: previewColor, alpha: 0.95, width: 2 / scale }); container.addChild(preview);
    for (const point of points) container.addChild(new Graphics().circle(point.x, point.y, 5 / scale).fill({ color: previewColor }).stroke({ color: 0xffffff, width: 1.5 / scale })); return container;
  }
}
