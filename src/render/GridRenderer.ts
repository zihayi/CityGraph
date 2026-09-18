import { Container, Graphics } from "pixi.js";
import type { City } from "../model/City";
import { canvasRenderBounds } from "../model/mapGenerator";

export class GridRenderer {
  public render(city: City): Container {
    const container = new Container(); const bounds = canvasRenderBounds(city);
    const grid = new Graphics();

    const step = Math.max(50, bounds.width / 240);
    for (let x = bounds.x; x <= bounds.x + bounds.width; x += step) {
      grid.moveTo(x, bounds.y).lineTo(x, bounds.y + bounds.height);
    }
    for (let y = bounds.y; y <= bounds.y + bounds.height; y += step) {
      grid.moveTo(bounds.x, y).lineTo(bounds.x + bounds.width, y);
    }
    grid.stroke({ color: 0x1bb9bd, width: 1, alpha: 0.35 });
    container.addChild(grid);
    return container;
  }
}
