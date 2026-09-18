import { Container, Graphics } from "pixi.js";
import { canvasHandlePoints, type CanvasResizeHandle } from "../geometry/CanvasBounds";
import type { Bounds } from "../geometry/Point";

export class CanvasBoundaryRenderer {
  public render(bounds: Bounds, zoom = 1, activeHandle?: CanvasResizeHandle): Container {
    const safeZoom = Math.max(zoom, 1e-6); const color = 0x16cbd0;
    const container = new Container({ label: "canvas-boundary-editor" });
    container.addChild(new Graphics({ label: "canvas-boundary-outline" }).rect(bounds.x, bounds.y, bounds.width, bounds.height).fill({ color, alpha: 0.045 }).stroke({ color, width: 2.5 / safeZoom, alpha: 0.98 }));
    for (const { handle, point } of canvasHandlePoints(bounds)) {
      const active = handle === activeHandle; const radius = (active ? 7 : 6) / safeZoom;
      container.addChild(new Graphics({ label: `canvas-boundary-handle:${handle}` }).rect(point.x - radius, point.y - radius, radius * 2, radius * 2).fill({ color: active ? 0x0b6973 : 0xf7ffff }).stroke({ color, width: 2 / safeZoom, alpha: 1 }));
    }
    return container;
  }
}
