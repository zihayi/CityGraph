import { Container, Graphics, Text } from "pixi.js";
import type { City, POI } from "../model/City";

const poiStyle: Record<POI["type"], { color: number; glyph: string }> = {
  hospital: { color: 0xc95951, glyph: "+" },
  school: { color: 0x3e72ba, glyph: "S" },
  "city-hall": { color: 0x70519a, glyph: "C" },
  police: { color: 0x456aa0, glyph: "P" },
  "fire-station": { color: 0xd66b46, glyph: "F" },
  station: { color: 0x2f7580, glyph: "T" },
  harbor: { color: 0x2b70b5, glyph: "H" },
};

export class POIRenderer {
  public render(city: City): Container {
    const container = new Container();

    for (const poi of city.pois) {
      const style = poiStyle[poi.type];
      const marker = new Graphics()
        .circle(poi.x, poi.y, 13)
        .fill({ color: 0xffffff, alpha: 0.96 })
        .stroke({ color: style.color, width: 2.5 });
      const glyph = new Text({
        text: style.glyph,
        style: { fontFamily: "Arial", fontSize: 14, fontWeight: "700", fill: style.color },
      });
      glyph.anchor.set(0.5);
      glyph.position.set(poi.x, poi.y - 0.5);
      const name = new Text({
        text: poi.name,
        style: {
          fontFamily: "Arial",
          fontSize: 13,
          fontWeight: "600",
          fill: 0x27333a,
          stroke: { color: 0xffffff, width: 3 },
        },
      });
      name.position.set(poi.x + 18, poi.y - 8);
      container.addChild(marker, glyph, name);
    }

    return container;
  }
}
