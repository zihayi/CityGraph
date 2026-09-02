import { Container, Graphics } from "pixi.js";
import type { City } from "../model/City";

export class GridRenderer {
  public render(city: City): Container {
    const container = new Container();
    const grid = new Graphics();

    const step = Math.max(50, city.bounds.width / 240);
    for (let x = city.bounds.x; x <= city.bounds.x + city.bounds.width; x += step) {
      grid.moveTo(x, city.bounds.y).lineTo(x, city.bounds.y + city.bounds.height);
    }
    for (let y = city.bounds.y; y <= city.bounds.y + city.bounds.height; y += step) {
      grid.moveTo(city.bounds.x, y).lineTo(city.bounds.x + city.bounds.width, y);
    }
    grid.stroke({ color: 0x1bb9bd, width: 1, alpha: 0.35 });
    container.addChild(grid);
    return container;
  }
}
