import type { Graphics } from "pixi.js";
import type { Point } from "../geometry/Point";

export function drawPolygon(graphics: Graphics, points: Point[]): Graphics {
  const [first, ...rest] = points;
  if (!first) {
    return graphics;
  }

  graphics.moveTo(first.x, first.y);
  for (const point of rest) {
    graphics.lineTo(point.x, point.y);
  }
  graphics.closePath();
  return graphics;
}
