import { Container, Graphics } from "pixi.js";
import type { City } from "../model/City";
import { drawPolygon } from "./graphics";

export class WaterRenderer {
  public render(city: City): Container {
    const container = new Container();

    for (const water of city.waters) {
      const area = drawPolygon(new Graphics(), water.points)
        .fill({ color: 0x8ec9e8 })
        .stroke({ color: 0x77b6d9, width: 2 });
      container.addChild(area);
    }

    return container;
  }
}
