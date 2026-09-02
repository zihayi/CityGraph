import { Container, Graphics } from "pixi.js";
import type { City } from "../model/City";
import { drawPolygon } from "./graphics";

export class ParkRenderer {
  public render(city: City): Container {
    const container = new Container();

    for (const park of city.parks) {
      const area = drawPolygon(new Graphics(), park.points)
        .fill({ color: 0xcfe4c3 })
        .stroke({ color: 0xb6d2aa, width: 2 });
      container.addChild(area);

      const paths = new Graphics();
      const boundsX = park.points.reduce((sum, point) => sum + point.x, 0) / park.points.length;
      const boundsY = park.points.reduce((sum, point) => sum + point.y, 0) / park.points.length;
      paths.circle(boundsX, boundsY, 38).stroke({ color: 0xf7f5ed, width: 5, alpha: 0.9 });
      paths.moveTo(boundsX - 95, boundsY + 30).bezierCurveTo(boundsX - 35, boundsY - 50, boundsX + 40, boundsY + 70, boundsX + 100, boundsY - 20);
      paths.stroke({ color: 0xf7f5ed, width: 4, alpha: 0.9 });
      container.addChild(paths);
    }

    return container;
  }
}
