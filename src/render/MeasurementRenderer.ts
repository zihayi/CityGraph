import { Container, Graphics } from "pixi.js";
import type { MeasurementMode } from "../app/store/editorStore";
import { measurementRectangle } from "../geometry/MeasurementGeometry";
import type { Point } from "../geometry/Point";

export class MeasurementRenderer {
  public render(mode: MeasurementMode, start: Point, end: Point, zoom = 1): Container {
    const container = new Container({ label: `measurement-preview:${mode}` });
    this.update(container, mode, start, end, zoom);
    return container;
  }
  public update(container: Container, mode: MeasurementMode, start: Point, end: Point, zoom = 1): void {
    const label = `measurement-preview:${mode}`;
    if (container.label !== label) { container.removeChildren().forEach((child) => child.destroy({ children: true })); container.label = label; }
    const graphic = (label: string) => { const existing = container.children.find((child) => child.label === label) as Graphics | undefined; return existing ? existing.clear() : container.addChild(new Graphics({ label })); };
    const color = 0x20cfd0; const safeZoom = Math.max(zoom, 1e-6);
    if (mode === "area") {
      const rectangle = measurementRectangle(start, end);
      graphic("measurement-area").rect(rectangle.x, rectangle.y, rectangle.width, rectangle.height).fill({ color, alpha: 0.12 }).stroke({ color, width: 2 / safeZoom, alpha: 0.95 });
      graphic("measurement-diagonal").moveTo(start.x, start.y).lineTo(end.x, end.y).stroke({ color, width: 1.25 / safeZoom, alpha: 0.55 });
    } else graphic("measurement-distance").moveTo(start.x, start.y).lineTo(end.x, end.y).stroke({ color, width: 2 / safeZoom, alpha: 0.95 });
    for (const [index, point] of [start, end].entries()) graphic(`measurement-point:${index}`).circle(point.x, point.y, 5 / safeZoom).fill({ color: 0xf5ffff }).stroke({ color, width: 2 / safeZoom });
  }
}
