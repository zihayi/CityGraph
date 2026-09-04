import { Container, Graphics } from "pixi.js";
import type { EditorSelection } from "../editor/Editor";
import type { Point } from "../geometry/Point";
import type { City, WaterArea } from "../model/City";
import { drawPolygon } from "./graphics";

export class WaterRenderer {
  public render(city: City, selection: EditorSelection = null, zoom = 1): Container {
    const container = new Container();

    for (const water of city.waters) {
      const selected = selection?.kind === "water" && selection.id === water.id;
      const area = drawPolygon(new Graphics({ label: `water:${water.id}` }), water.points)
        .fill({ color: 0x8ec9e8 })
        .stroke({ color: selected ? 0x168cff : 0x77b6d9, width: selected ? 3 / zoom : 2 });
      container.addChild(area);
    }

    return container;
  }

  public renderEditor(water: WaterArea, zoom = 1): Container {
    const container = new Container();
    for (const [index, point] of water.points.entries()) container.addChild(new Graphics({ label: `water-vertex:${water.id}:${index}` }).circle(point.x, point.y, 5 / zoom).fill({ color: 0xf5ffff }).stroke({ color: 0x087f91, width: 1.5 / zoom }));
    return container;
  }

  public renderPreview(points: Point[], valid: boolean, zoom = 1, rectangle?: { x: number; y: number; width: number; height: number }): Container {
    const container = new Container();
    if (rectangle) container.addChild(new Graphics().rect(rectangle.x, rectangle.y, rectangle.width, rectangle.height).stroke({ color: 0x168cff, width: 1.5 / zoom, alpha: 0.7 }));
    if (points.length === 0) return container;
    const color = valid ? 0x4caed2 : 0xd45f68; const preview = new Graphics();
    if (points.length >= 3) drawPolygon(preview, points).fill({ color, alpha: 0.45 }).stroke({ color, width: 2 / zoom });
    else { preview.moveTo(points[0]!.x, points[0]!.y); for (const point of points.slice(1)) preview.lineTo(point.x, point.y); preview.stroke({ color, width: 2 / zoom }); }
    container.addChild(preview); return container;
  }
}
