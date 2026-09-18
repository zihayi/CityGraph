import { Container, Graphics } from "pixi.js";
import type { MeasurementMode } from "../app/store/editorStore";
import { measurementRectangle } from "../geometry/MeasurementGeometry";
import type { Point } from "../geometry/Point";

export class MeasurementRenderer {
  public render(mode: MeasurementMode, start: Point, end: Point, zoom = 1): Container {
    const container = new Container({ label: `measurement-preview:${mode}` });
    const color = 0x20cfd0; const safeZoom = Math.max(zoom, 1e-6);
    if (mode === "area") {
      const rectangle = measurementRectangle(start, end);
      container.addChild(new Graphics({ label: "measurement-area" }).rect(rectangle.x, rectangle.y, rectangle.width, rectangle.height).fill({ color, alpha: 0.12 }).stroke({ color, width: 2 / safeZoom, alpha: 0.95 }));
      container.addChild(new Graphics({ label: "measurement-diagonal" }).moveTo(start.x, start.y).lineTo(end.x, end.y).stroke({ color, width: 1.25 / safeZoom, alpha: 0.55 }));
    } else container.addChild(new Graphics({ label: "measurement-distance" }).moveTo(start.x, start.y).lineTo(end.x, end.y).stroke({ color, width: 2 / safeZoom, alpha: 0.95 }));
    for (const [index, point] of [start, end].entries()) container.addChild(new Graphics({ label: `measurement-point:${index}` }).circle(point.x, point.y, 5 / safeZoom).fill({ color: 0xf5ffff }).stroke({ color, width: 2 / safeZoom }));
    return container;
  }
}
