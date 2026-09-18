import { Container, Graphics } from "pixi.js";
import type { City } from "../model/City";
import { canvasRenderBounds } from "../model/mapGenerator";

export class BaseMapRenderer {
  public render(city: City): Container {
    const container = new Container(); const bounds = canvasRenderBounds(city);
    const background = new Graphics()
      .rect(bounds.x, bounds.y, bounds.width, bounds.height)
      .fill({ color: 0xf4f3ee });
    container.addChild(background);

    const districtTexture = new Graphics();
    const gridStep = Math.max(40, bounds.width / 400);
    for (let x = bounds.x; x <= bounds.x + bounds.width; x += gridStep) {
      districtTexture.moveTo(x, bounds.y).lineTo(x, bounds.y + bounds.height);
    }
    for (let y = bounds.y; y <= bounds.y + bounds.height; y += gridStep) {
      districtTexture.moveTo(bounds.x, y).lineTo(bounds.x + bounds.width, y);
    }
    districtTexture.stroke({ color: 0xdadbd6, width: 0.75, alpha: 0.38 });
    container.addChild(districtTexture);

    if (city.mapSize !== "unlimited") {
      const boundary = new Graphics().rect(city.bounds.x + 1, city.bounds.y + 1, city.bounds.width - 2, city.bounds.height - 2).stroke({ color: 0xcfd2cd, width: 2 });
      container.addChild(boundary);
    }
    return container;
  }
}
