import { describe, expect, it } from "vitest";
import type { Building, City } from "../model/City";
import { BuildingRenderer } from "./BuildingRenderer";

function building(id: string, x: number, type: Building["type"] = "office"): Building {
  return { id, type, subtype: "", floors: 2, height: 6, style: "modern", footprint: { outer: [{ x, y: 0 }, { x: x + 8, y: 0 }, { x: x + 8, y: 8 }, { x, y: 8 }], holes: [] } };
}

function cityWithBuildings(buildings: Building[]): City { return { buildings } as City; }

describe("BuildingRenderer", () => {
  it("batches buildings by visual style instead of display object", () => {
    const buildings = Array.from({ length: 1_000 }, (_, index) => building(`office-${index}`, index * 10)); buildings.push(building("shop", 10_100, "commercial"));
    const rendered = new BuildingRenderer().render(cityWithBuildings(buildings));
    expect(rendered.children).toHaveLength(2);
    rendered.destroy({ children: true });
  });

  it("keeps selected buildings in a separate batch", () => {
    const buildings = [building("first", 0), building("second", 20)]; const rendered = new BuildingRenderer().render(cityWithBuildings(buildings), { kind: "spatial-group", items: [{ kind: "building", id: "first" }] });
    expect(rendered.children).toHaveLength(2);
    rendered.destroy({ children: true });
  });
});
