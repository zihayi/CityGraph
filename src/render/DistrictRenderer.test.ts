import { describe, expect, it } from "vitest";
import { Text } from "pixi.js";
import { createNewCity } from "../model/mapGenerator";
import { DistrictRenderer } from "./DistrictRenderer";

describe("DistrictRenderer", () => {
  it("keeps label textures small at extreme zoom levels", () => {
    const city = createNewCity({ name: "Labels", size: "small", terrain: "flat", lakeCount: 1 });
    city.districts.push({ id: "central", name: "Central", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    const labels = new DistrictRenderer().renderLabels(city, 0.0001); const label = labels.children[0] as Text;
    expect(label.style.fontSize).toBe(14); expect(label.scale.x).toBe(10_000);
    labels.destroy({ children: true });
  });
});
