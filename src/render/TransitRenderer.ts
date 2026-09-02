import { Container, Graphics, Text } from "pixi.js";
import type { City, TransitStation } from "../model/City";

export class TransitRenderer {
  public render(city: City): Container {
    const container = new Container();
    const stations = new Map<string, TransitStation>(city.transitStations.map((station) => [station.id, station]));

    for (const line of city.transitLines) {
      const path = new Graphics();
      const firstStationId = line.stationIds[0];
      const first = firstStationId ? stations.get(firstStationId) : undefined;
      if (!first) {
        continue;
      }
      path.moveTo(first.x, first.y);
      for (const stationId of line.stationIds.slice(1)) {
        const station = stations.get(stationId);
        if (station) {
          path.lineTo(station.x, station.y);
        }
      }
      path.stroke({ color: line.color, width: 5, alpha: 0.9, cap: "round", join: "round" });
      container.addChild(path);
    }

    for (const station of city.transitStations) {
      const marker = new Graphics()
        .circle(station.x, station.y, 12)
        .fill({ color: 0xffffff })
        .stroke({ color: 0x24313a, width: 3 });
      const letter = new Text({
        text: station.type === "metro" ? "M" : station.type === "train" ? "T" : "B",
        style: { fontFamily: "Arial", fontSize: 11, fontWeight: "700", fill: 0x17242d },
      });
      letter.anchor.set(0.5);
      letter.position.set(station.x, station.y + 0.5);
      container.addChild(marker, letter);
    }

    return container;
  }
}
