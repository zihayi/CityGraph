import { Container, Text } from "pixi.js";
import type { City } from "../model/City";

export class LabelRenderer {
  public render(city: City): Container {
    const container = new Container();

    for (const label of city.labels) {
      const text = new Text({
        text: label.text,
        style: {
          fontFamily: "Arial",
          fontSize: label.type === "city" ? 22 : 16,
          fontWeight: "700",
          letterSpacing: 1.6,
          fill: 0x243037,
          stroke: { color: 0xf7f6f1, width: 4 },
        },
      });
      text.anchor.set(0.5);
      text.position.set(label.x, label.y);
      container.addChild(text);
    }

    return container;
  }
}
