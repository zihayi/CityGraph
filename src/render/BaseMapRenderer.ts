import { Container, Graphics } from "pixi.js";
import type { City } from "../model/City";

export class BaseMapRenderer {
  public render(city: City): Container {
    const container = new Container();
    const background = new Graphics()
      .rect(city.bounds.x, city.bounds.y, city.bounds.width, city.bounds.height)
      .fill({ color: 0xf4f3ee });
    container.addChild(background);

    const districtTexture = new Graphics();
    const gridStep = Math.max(40, city.bounds.width / 400);
    for (let x = city.bounds.x; x <= city.bounds.x + city.bounds.width; x += gridStep) {
      districtTexture.moveTo(x, city.bounds.y).lineTo(x, city.bounds.y + city.bounds.height);
    }
    for (let y = city.bounds.y; y <= city.bounds.y + city.bounds.height; y += gridStep) {
      districtTexture.moveTo(city.bounds.x, y).lineTo(city.bounds.x + city.bounds.width, y);
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
